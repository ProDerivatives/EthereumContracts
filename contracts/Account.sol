/**
* © Copyright 2019 Steffen Lehmann slehmann@proderivatives.com
* Deployment permitted
**/

pragma solidity ^0.5.0;

/**
 * @title DerivativeProxy
 * @dev interface to derivative contracts
 */
interface DerivativeProxy {
    function fee() external view returns (uint64);                // Fee requirement
    function fees(address account) external view returns (uint64);  // Paid fees
    function price() external view returns (int64);
    function getLowEstimate() external view returns (int64);
    function getHighEstimate() external view returns (int64);
    function isExpired() external view returns (bool);
    function isInUse(address account) external view returns (bool);
    function isInDefault(address account) external view returns (bool); 
    function getPosition(address account) external view returns (int64, int128); // notional, amount
    function getBid(address account) external view returns (int32, int64);    // notional, price
    function getAsk(address account) external view returns (int32, int64);    // notional, price
    function getCollateralRequirement(int64 positionNotional, int128 positionValue, int32 bidNotional, int64 bidPrice, int32 askNotional, int64 askPrice) external view returns (int128);
    function goLong(int32 notional, int64 xp) external;
    function goShort(int32 notional, int64 xp) external;
    function transferNotional(address recipient, int32 notional) external;    // Transfer notional value, i.e. pay fixed amount of the underlying
    function payFee() external payable;
}

/**
 * @title Account
 * @dev The Account is owned by a counterparty in a derivatives contract.
 * It locks up funds required for settlement.
 */
contract Account {
    address payable public owner;
    mapping(address => bool) public operators;
    address[] public derivatives;
    
    /**
     * @dev Constructor 
     */
    constructor() public {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized.");
        _;
    }

    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner || operators[msg.sender], "Not authorized.");
        _;
    }

    modifier onlyDerivative() {
        require(isDerivativeRegistered(msg.sender), "Not authorized.");
        _;
    }

    function destroy() external onlyOwner {
        require(!isInUse(), "Account still in use.");
        selfdestruct(owner);
    }

    function transferOwnership(address payable newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    function addOperator(address operatorAddress) external onlyOwner {
        operators[operatorAddress] = true;
    }

    function removeOperator(address operatorAddress) external onlyOwner {
        operators[operatorAddress] = false;
    }

    function addDerivative(address contractAddress) public onlyOwnerOrOperator {
        if (!isDerivativeRegistered(contractAddress))
            derivatives.push(contractAddress);
    }

    function isDerivativeRegistered(address contractAddress) private view returns(bool) {
        for (uint i = 0; i < derivatives.length; i++) {
            if (derivatives[i] == contractAddress) {
                return true;
            }
        }
        return false;
    }

    function transfer(address payable destination, uint amount) external onlyOwner {
        require(amount <= getTotalAvailable(), "Insufficient unallocated balance.");
        destination.transfer(amount);
    }

    function transferNotional(address derivative, address recipientAccount, int32 notional) external onlyOwner {
        DerivativeProxy proxy = DerivativeProxy(derivative);
        proxy.transferNotional(recipientAccount, notional);
    }

    function getRequiredFee(address derivative) public view onlyOwnerOrOperator returns (uint64) {
        DerivativeProxy proxy = DerivativeProxy(derivative);
        uint64 fee = proxy.fee();
        uint64 paidFee = proxy.fees(address(this));
        if (paidFee >= fee)
            return 0;
        return fee - paidFee;
    }

    function registerDerivativeAndPayFee(address contractAddress) external onlyOwnerOrOperator {
        addDerivative(contractAddress);
        uint64 fee = getRequiredFee(contractAddress);
        if (fee == 0)
            return;
        require(fee <= getTotalAvailable(), "Insufficient unallocated balance.");
        DerivativeProxy proxy = DerivativeProxy(contractAddress);
        proxy.payFee.value(fee)();
    }

    function getDerivatives() external view returns (address[] memory) {
        return derivatives;
    }

    function getCollateralRequirement(address derivative) public view returns (int128) {
        DerivativeProxy proxy = DerivativeProxy(derivative);
        (int64 positionNotional, int128 positionAmount) = proxy.getPosition(address(this));
        if (proxy.isExpired())
            return proxy.getCollateralRequirement(positionNotional, positionAmount, 0, 0, 0, 0);
        (int32 bidNotional, int64 bidPrice) = proxy.getBid(address(this));
        (int32 askNotional, int64 askPrice) = proxy.getAsk(address(this));
        return proxy.getCollateralRequirement(positionNotional, positionAmount, bidNotional, bidPrice, askNotional, askPrice);
    }

    function contractExists(address derivative) private view returns (bool) {
        uint size;
        assembly {
            size := extcodesize(derivative)
        }
        return size > 0;
    }

    function getTotalAllocated() public view returns (uint256) {
        uint256 a = 0;
        for (uint i = 0; i < derivatives.length; i++) {
            if (contractExists(derivatives[i])) {
                a += uint256(getCollateralRequirement(derivatives[i]));
            }
        }
        return a;
    }

    function getTotalAvailable() public view returns (uint256) {
        uint256 balance = address(this).balance;
        uint256 allocated = getTotalAllocated();
        return balance > allocated ? balance - allocated : 0;
    }

    function isInsufficientBalance() public view returns (bool) {
        uint256 balance = address(this).balance;
        uint256 allocated = uint256(getTotalAllocated());
        return balance < allocated ? true : false;
    }

    /**
    * Called by derivative on second consecutive default
    * We only pay if exposure amount is negative
    */
    function closeOut(int32 notional) external onlyDerivative {
        DerivativeProxy proxy = DerivativeProxy(msg.sender);
        // Derivative has not expired, account is in default and collateral requirement is positive (only close out positions that require collateral)
        require(!proxy.isExpired() && proxy.isInDefault(address(this)) && getCollateralRequirement(msg.sender) > 0, "Not eligible for close out.");
        (int64 positionNotional, /* int64 amount */) = proxy.getPosition(address(this));
        if (notional > 0) {
           require(positionNotional >= notional, "Invalid attempt to close out more than available");
           proxy.goShort(notional, proxy.getLowEstimate());
        } else {
           require(positionNotional <= notional, "Invalid attempt to close out more than available");
           proxy.goLong(-notional, proxy.getHighEstimate());
        }
    }

    /**
    * Called by derivative on final settlement
    * We only pay if MtM is negative
    */
    function settle(address payable destination, int128 amountToSend) external onlyDerivative {
        // amountToSend guaranteed to be positive number - enforced by derivative contract.
        DerivativeProxy proxy = DerivativeProxy(msg.sender);
        (int64 notional, int128 amount) = proxy.getPosition(address(this));
        // Derivative has expired, position is closed and amountToSend does not exceed final position amount
        require(proxy.isExpired() && notional == 0 && amount < 0 && amountToSend <= -amount, "Not eligible for final settlement");
        destination.transfer(uint256(amountToSend));
    }

    function goLong(address derivative, int32 notional, int64 xp) external onlyOwnerOrOperator {
        DerivativeProxy proxy = DerivativeProxy(derivative);
        proxy.goLong(notional, xp);
    }

    function goShort(address derivative, int32 notional, int64 xp) external onlyOwnerOrOperator {
        DerivativeProxy proxy = DerivativeProxy(derivative);
        proxy.goShort(notional, xp);
    }

    function isInUse() public view returns (bool) {
        for (uint i = 0; i < derivatives.length; i++) {
            if (contractExists(derivatives[i])) {
                DerivativeProxy proxy = DerivativeProxy(derivatives[i]);
                if (proxy.isInUse(address(this)))
                    return true;
            }
        }
        return false;
    }

    function() external payable {}
}