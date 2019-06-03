/**
* © Copyright 2019 Steffen Lehmann slehmann@proderivatives.com
* Deployment not permitted except to local test networks
**/

pragma solidity ^0.5.0;

import "./Derivative.sol";

/**
 * @title Forward
 * @dev 
 */
contract Forward is Derivative {
       
    /**
    * @dev Constructor
    */
    constructor(
        uint64 contractExpirationTime, 
        uint64 contractFee, 
        uint8 contractInitialMarginRate, 
        uint8 contractVariationMarginRate) public {

        owner = msg.sender;
        expirationTime = contractExpirationTime;
        fee = contractFee;
        initialMarginRate = contractInitialMarginRate;
        variationMarginRate = contractVariationMarginRate;
    }

    modifier verifiedPrice(int64 priceToVerify, uint8 v, bytes32 r, bytes32 s) {
        require(isValidSignature(getMessageHash(priceToVerify), v, r, s), "Verification failed");
        _;
    }

    function getMessageHash(int64 priceToVerify) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(priceToVerify))));
    }

    function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) private view returns(bool) {
        return ecrecover(hash, v, r, s) == owner;
    }

    function clearTrade(address longAccount, address shortAccount, int32 notional, int64 xp) private {
        price = xp;
        emit TradeCleared(longAccount, shortAccount, notional, xp);
    }

    function isInDefault(address account) external view returns (bool) {
        AccountProxy proxy = AccountProxy(account);
        return proxy.isInsufficientBalance();
    }

    /**
    * Close account that is in default
    * rules enforced by account contract
    */
    function closeOut(address account, int32 notional) external {
        AccountProxy proxy = AccountProxy(account);
        proxy.closeOut(notional);
    }

    /**
    * Close position at current price
    * after contract has expired
    * and release excess collateral
    */  
    function closePosition(address account, int64 settlementPrice, uint8 v, bytes32 r, bytes32 s) 
        external verifiedPrice(settlementPrice, v, r, s) {
        if (!isExpired()) { 
            valuationTime = expirationTime; // Expire contract
        }
        positions[account].amount += int128(positions[account].notional) * settlementPrice;
        positions[account].notional = 0;
    }

    /**
    * out-of-the-money party pays in-the-money party
    * release excess collateral
    * rules enforced by account contract
    */
    function settle(address otmParty, address itmParty, int128 amountToSettle) external {
        int128 amount = positions[itmParty].amount;
        require(positions[itmParty].notional == 0 && amount > 0 && amountToSettle <= amount, "ITM Party not eligible to receive");
        AccountProxy otmProxy = AccountProxy(otmParty);
        otmProxy.settle(itmParty, amountToSettle);
        positions[otmParty].amount += amountToSettle;
        positions[itmParty].amount -= amountToSettle;
    }
 
}
