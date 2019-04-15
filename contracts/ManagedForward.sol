/**
* © Copyright 2019 Steffen Lehmann
* Deployment not permitted except to local test networks
**/

pragma solidity ^0.5.0;

import "./Derivative.sol";

/**
 * @title ManagedForward
 * @dev 
 */
contract ManagedForward is Derivative {
    mapping(address => uint8) public shortfall; // Number of consecutive margin calculations that left account in default
    uint8 public defaultTrigger; // Number of consecutive shortfalls required to declare account in default (0 = default on first shortfall; 1 = default on second shortfall)
       
    /**
    * @dev Constructor
    */
    constructor(
        uint32 contractExpirationTime, 
        uint8 contractDefaultTrigger, 
        uint64 contractFee) public {

        owner = msg.sender;
        expirationTime = contractExpirationTime;
        defaultTrigger = contractDefaultTrigger;
        fee = contractFee;
    }

    function setDefaultTrigger(uint8 trigger) external onlyOwner { defaultTrigger = trigger; }

    function setFee(uint64 amount) external onlyOwner { fee = amount; }

    function setInitialMarginRate(uint8 rate) external onlyOwner { initialMarginRate = rate; }

    function setVariationMarginRate(uint8 rate) external onlyOwner {variationMarginRate = rate; }

    function markToMarket(uint32 currentTime, int64 currentPrice) external onlyOwner {
        valuationTime = currentTime;
        price = currentPrice;
    }

    function marginCheck(address account) external onlyOwner {
        AccountProxy proxy = AccountProxy(account);
        if (proxy.isInsufficientBalance())
            shortfall[account] += 1;
        else
            shortfall[account] = 0;
    }

    function isInDefault(address account) external view returns (bool) {
        return shortfall[account] >= defaultTrigger;
    }

    /**
    * Close account that is in default
    * rules enforced by account contract
    */
    function closeOut(address account) external onlyOwner {
        AccountProxy proxy = AccountProxy(account);
        proxy.closeOut();
    }

    /**
    * Close position at current price
    * after contract has expired
    * and release excess collateral
    */  
    function closePosition(address account) external onlyOwner {
        require(isExpired(), "Contract still active");
        positions[account].amount += int128(positions[account].notional) * price;
        positions[account].notional = 0;
    }

    /**
    * out-of-the-money party pays in-the-money party
    * release excess collateral
    * rules enforced by account contract
    */
    function settle(address otmParty, address itmParty, int128 amountToSettle) external onlyOwner {
        AccountProxy otmProxy = AccountProxy(otmParty);
        otmProxy.settle(itmParty, amountToSettle);
        positions[otmParty].amount += amountToSettle;
        positions[itmParty].amount -= amountToSettle;
    }
   
}
