/**
* © Copyright 2019 Steffen Lehmann slehmann@proderivatives.com
* Deployment not permitted except to local test networks
**/

pragma solidity ^0.5.0;

interface AccountProxy {
    function getTotalAvailable() external view returns (uint256);
    function isInsufficientBalance() external view returns (bool);
    function closeOut(int32 notional) external;
    function settle(address destination, int128 amount) external;
}

/**
 * @title Derivative
 * @dev Base Class
 * This is the base class for all derivative contracts
 * and should not be used directly
 */
contract Derivative {
    address payable public owner;
    address[] private accounts;
    mapping(address => bool) public verified;
    mapping(address => uint) public fees;
    mapping(address => Position) internal positions;
    mapping(address => Order) internal bids;
    mapping(address => Order) internal asks;
    address public lowestAsk;
    address public highestBid;
    uint64 public fee;
    uint64 public expirationTime; // Expiration DateTime code (UTC)
    uint64 public valuationTime; // Last valuation DateTime code (UTC)
    uint8 public initialMarginRate;
    uint8 public variationMarginRate;
    int64 public price;
               
    struct Position {
        int64 notional; // Units of the underlying e.g. cents
        int128 amount;    // Wei
    }

    struct Order {
        int32 notional; // Units of the underlying e.g. cents    
        int64 price;    // Wei per one unit of the underlying (Wei / cent)
        address next;
    }

    /**
     * @dev Constructor should only be called from unit tests
     */
    constructor() public {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier canTrade() {
        require(!isExpired() && verified[msg.sender] && fees[msg.sender] >= fee, "Not elegible to trade");
        _;
    }

    /**************************************
    * Private and internal Methods
    **************************************/

    function getPrecedingBid(address account) private view returns (address) {
        address previous = highestBid;
        while (previous != address(0) && bids[previous].next != account) {
            previous = bids[previous].next;
        }
        if (bids[previous].next == account)
            return previous;
        return address(0);
    }

    function getPrecedingAsk(address account) private view returns (address) {
        address previous = lowestAsk;
        while (previous != address(0) && asks[previous].next != account) {
            previous = asks[previous].next;
        }
        if (asks[previous].next == account)
            return previous;
        return address(0);
    }

    function getNextHigherBid(int64 bidPrice) private view returns (address) {
        address previous = address(0);
        address next = highestBid;
        while (next != address(0) && bids[next].notional > 0 && bidPrice <= bids[next].price) {
            previous = next;
            next = bids[previous].next;
        }
        return previous;
    }

    function getNextLowerAsk(int64 askPrice) private view returns (address) {
        address previous = address(0);
        address next = lowestAsk;
        while (next != address(0) && asks[next].notional > 0 && askPrice >= asks[next].price) {
            previous = next;
            next = asks[previous].next;
        }
        return previous;
    }

    /**
    * @dev if new order reduces collat requirement then allow even if account balance is insufficient
    */
    function preClear(address account, int128 requirement) private view returns (bool) {
        // Clear if new trade reduces requirement (or does not change it)
        int128 currentRequirement = getCollateralRequirement(positions[account].notional, positions[account].amount, bids[account].notional, bids[account].price, asks[account].notional, asks[account].price);
        if (requirement <= currentRequirement)
            return true;

        AccountProxy proxy = AccountProxy(account);
        uint256 availableBalance = proxy.getTotalAvailable();
        // Difference guaranteed to be positive
        return uint256(requirement - currentRequirement) <= availableBalance;
    }

    function preClearBid(address account, int32 notional, int64 bidPrice) private view returns (bool) {
        return preClear(account, getCollateralRequirement(positions[account].notional, positions[account].amount, notional, bidPrice, asks[account].notional, asks[account].price));
    }

    function preClearAsk(address account, int32 notional, int64 askPrice) private view returns (bool) {
        return preClear(account, getCollateralRequirement(positions[account].notional, positions[account].amount, bids[account].notional, bids[account].price, notional, askPrice));
    }

    function updateBid(address account, int32 notional, int64 bidPrice) private {
        Order storage bid = bids[account];
        if (notional == 0 || bidPrice == 0) {
            bid.notional = 0;
            bid.price = 0;
        } else {
            bid.notional = notional;
            bid.price = bidPrice;
        }
        if (highestBid == account)
            highestBid = bid.next;
        address previous = getPrecedingBid(account);
        if (previous != address(0))
            bids[previous].next = bid.next;
        previous = getNextHigherBid(bid.price);
        if (previous == address(0)) {
            bid.next = highestBid;
            highestBid = account;
        } else {
            bid.next = bids[previous].next;
            bids[previous].next = account;
        }
    }

    function updateAsk(address account, int32 notional, int64 askPrice) private {
        Order storage ask = asks[account];
        if (notional == 0 || askPrice == 0) {
            ask.notional = 0;
            ask.price = 0;
        } else {
            ask.notional = notional;
            ask.price = askPrice;
        }
        if (lowestAsk == account)
            lowestAsk = ask.next;
        address previous = getPrecedingAsk(account);
        if (previous != address(0))
            asks[previous].next = ask.next;
        previous = getNextLowerAsk(ask.price);
        if (previous == address(0)) {
            ask.next = lowestAsk;
            lowestAsk = account;
        } else {
            ask.next = asks[previous].next;
            asks[previous].next = account;
        }
    }

    function clearLong(address account) private {
        if (highestBid == account) {
            int64 bidPrice = bids[highestBid].price;
            address current = lowestAsk;
            while (current != address(0) && bids[highestBid].notional > 0 && asks[current].notional > 0 && bidPrice >= asks[current].price) {
                int32 notional = asks[current].notional;
                if (bids[highestBid].notional < notional)
                    notional = bids[highestBid].notional;
                positions[account].notional += notional;
                positions[account].amount -= int128(notional) * int128(bidPrice);
                positions[current].notional -= notional;
                positions[current].amount += int128(notional) * int128(bidPrice);
                bids[highestBid].notional -= notional;
                asks[current].notional -= notional;
                clearTrade(account, current, notional, bidPrice);
                if (asks[current].notional == 0)
                    current = asks[current].next;    
            }
            removeClearedBids();
            removeClearedAsks();
        }
    }

    function clearShort(address account) private {
        if (lowestAsk == account) {
            int64 askPrice = asks[lowestAsk].price;
            address current = highestBid;
            while (current != address(0) && asks[lowestAsk].notional > 0 && bids[current].notional > 0 && askPrice <= bids[current].price) {
                int32 notional = bids[current].notional;
                if (asks[lowestAsk].notional < notional)
                    notional = asks[lowestAsk].notional;
                positions[account].notional -= notional;
                positions[account].amount += int128(notional) * int128(askPrice);
                positions[current].notional += notional;
                positions[current].amount -= int128(notional) * int128(askPrice);
                asks[lowestAsk].notional -= notional;
                bids[current].notional -= notional;
                clearTrade(current, account, notional, askPrice);
                if (bids[current].notional == 0)
                    current = bids[current].next;
            }
            removeClearedBids();
            removeClearedAsks();
        }
    }

    function clearTrade(address longAccount, address shortAccount, int32 notional, int64 xp) private {
        emit TradeCleared(longAccount, shortAccount, notional, xp);
    }

    function removeClearedBids() private {
        address current = highestBid;
        while (current != address(0) && bids[current].notional == 0) {
            bids[current].price = 0;
            highestBid = bids[current].next;
            bids[current].next = address(0);
            current = highestBid;
        }
    }

    function removeClearedAsks() private {
        address current = lowestAsk;
        while (current != address(0) && asks[current].notional == 0) {
            asks[current].price = 0;
            lowestAsk = asks[current].next;
            asks[current].next = address(0);
            current = lowestAsk;
        }
    }

    /**************************************
    * Events
    **************************************/
    event FeePaid(address account, uint256 amount);
    event OrderPosted(address account, int32 notional, int64 xp);
    event TradeCleared(address longAccount, address shortAccount, int32 notional, int64 xp);

    /*****************************************************
    * Public Methods - Called extarnally and from contract
    *****************************************************/

    function isExpired() public view returns (bool) {
        return valuationTime >= expirationTime;
    }

    function isSettled() public view returns (bool) {
        for (uint i = 0; i < accounts.length; i++) {
            Position storage pos = positions[accounts[i]];
            if (pos.notional != 0 || pos.amount != 0)
                return false;
        }
        return true;
    }

    /*************************************
    * External Methods - Non Restricted
    **************************************/

    function getAccounts() external view returns (address[] memory) { return accounts; }

    function isInUse(address account) external view returns (bool) {
        if (!verified[account] || (isExpired() && positions[account].amount == 0))
            return false;
        return true;
    }

    function getPosition(address account) external view returns (int64, int128) {
        return (positions[account].notional, positions[account].amount);
    }

    function getBid(address account) external view returns (int32, int64) {
        return (bids[account].notional, bids[account].price);
    }

    function getHighestBid() external view returns (int64) { return bids[highestBid].price; }

    function getAsk(address account) external view returns (int32, int64) {
        return (asks[account].notional, asks[account].price);
    }

    function getLowestAsk() external view returns (int64) { return asks[lowestAsk].price; }

    function getHighEstimate() public view returns (int64) {
        return price * (100 + variationMarginRate) / 100;
    }

    function getLowEstimate() public view returns (int64) {
        return price * (100 - variationMarginRate) / 100;
    }

    function getMarkToMarket(int32 notional, int128 amount) external view returns (int128) {
        return int128(notional) * price + amount;
    }

    function getVariationMargin(int64 notional, int128 amount) public view returns (int128) {
        if (notional > 0)
            return -(int128(notional) * getLowEstimate() + amount);
        return -(int128(notional) * getHighEstimate() + amount);
    }

    function getInitialMargin(int64 notional, int128 amount) public view returns (int128) {
        if (notional == 0)
            return 0;
        if (amount > 0)
            return amount * initialMarginRate / 100;
        else
            return -amount * initialMarginRate / 100;
    }

    function getMarginRequirement(int64 notional, int128 amount) public view returns (int128) {
        if (notional > 0 && amount >= 0) // Long position with no downside risk -> No margin requirement
            return 0;

        if (notional == 0)   // No exposure
            if (amount >= 0) // Locked in profit -> No margin requirement
                return 0;
            else
                return -amount; // Locked in loss
        
        int128 requirement = getInitialMargin(notional, amount) + getVariationMargin(notional, amount);
        if (requirement < 0)    // Requirement cannot be negative 
            requirement = 0;

        if (notional > 0 && requirement > -amount)  // Long position with negative amount -> Downside cannot exceed amount
            return -amount;

        return requirement;  // All other cases
    }

    function getCollateralRequirement(int64 positionNotional, int128 positionValue, int32 bidNotional, int64 bidPrice, int32 askNotional, int64 askPrice) public view returns (int128) {
        int128 posCol = getMarginRequirement(positionNotional, positionValue);
        int128 bidCol = getMarginRequirement(positionNotional + bidNotional, positionValue - int128(bidNotional) * bidPrice);
        int128 askCol = getMarginRequirement(positionNotional - askNotional, positionValue + int128(askNotional) * askPrice);
        int128 dbid = bidCol - posCol;
        int128 dask = askCol - posCol;
        int128 result = posCol;
        if (dbid > 0)
            result += dbid;
        if (dask > 0)
            result += dask;
        return result;
    }

    /************************************************
    * External API - Restricted to Accounts
    *************************************************/

    function goLong(int32 notional, int64 bidPrice) external canTrade {
        require(notional >= 0 && bidPrice >= 0, "Notional and Price must be non-negative");
        require(preClearBid(msg.sender, notional, bidPrice), "Insufficient collateral");
        updateBid(msg.sender, notional, bidPrice);
        emit OrderPosted(msg.sender, notional, bidPrice);
        clearLong(msg.sender);
    }

    function goShort(int32 notional, int64 askPrice) external canTrade {
        require(notional >= 0 && askPrice >= 0, "Notional and Price must be non-negative");
        require(preClearAsk(msg.sender, notional, askPrice), "Insufficient collateral");
        updateAsk(msg.sender, notional, askPrice);
        emit OrderPosted(msg.sender, -notional, askPrice);
        clearShort(msg.sender);
    }

    function transferNotional(address recipient, int32 notional) external canTrade {
        require(verified[recipient] && fees[recipient] >= fee, "Recipient not registered");
        require(notional > 0, "Notional must be greater zero");
        require(preClear(msg.sender, getCollateralRequirement(positions[msg.sender].notional - notional, positions[msg.sender].amount, bids[msg.sender].notional, bids[msg.sender].price, asks[msg.sender].notional, asks[msg.sender].price)), "Insufficient collateral");
        positions[msg.sender].notional -= notional;
        positions[recipient].notional += notional;
    }

    /*****************************************************************
    * External API - Restricted to Owner
    *****************************************************************/

    function setVerified(address account, bool isValid) public onlyOwner { verified[account] = isValid; }

    function addVerifiedAccount(address account) external onlyOwner {
        for (uint i = 0; i < accounts.length; i++) {
            if (accounts[i] == account) {
                return;
            }
        }
        accounts.push(account);
        setVerified(account, true);
    }

    function transferOwnership(address payable newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    function withdrawFee() external onlyOwner {
        uint256 balance = address(this).balance;
        owner.transfer(balance);
    }

    function destroy() external onlyOwner {
        require(isExpired() && isSettled(), "Contract in use");
        selfdestruct(owner);
    }


    /************************************************
    * Fallback - Payable function reveive fee
    *************************************************/

    // sender will be added to accounts if not yet present by event handler
    function payFee() external payable {
        fees[msg.sender] += msg.value;
        emit FeePaid(msg.sender, msg.value);
    }
}