//jshint ignore: start

const Web3Utils = require('web3-utils');
const f = require('./functions');

const ManagedForward = artifacts.require('./ManagedForward.sol');
const Account = artifacts.require('./Account.sol');

contract('ManagedForwardOrders', function(accounts) {
  
    let derivative;
    const owner = accounts[0];
    const trader1 = accounts[1];
    const trader2 = accounts[2];
    const trader3 = accounts[3];
    const trader4 = accounts[4];

    let account1;
    let account2;
    let account3;
    let account4;
      
    it('should be deployed', async () => {
      derivative = await ManagedForward.new(100, 2, 1);

      account1 = await Account.new();
      account2 = await Account.new();
      account3 = await Account.new();
      account4 = await Account.new();
  
      assert(derivative.address !== undefined, 'ManagedForward was not deployed');
      assert(account1.address !== undefined, 'Account1 was not deployed');
      assert(account2.address !== undefined, 'Account2 was not deployed');
      assert(account3.address !== undefined, 'Account1 was not deployed');
      assert(account4.address !== undefined, 'Account2 was not deployed');

      await account1.transferOwnership(trader1);
      await account2.transferOwnership(trader2);
      await account3.transferOwnership(trader3);
      await account4.transferOwnership(trader4);

      await derivative.setInitialMarginRate(30, {from: owner});
      await derivative.setVariationMarginRate(10, {from: owner});
    });

    it('should be able to register and pay fees', async () => {
      await account1.sendTransaction({from: trader1, value: Web3Utils.toWei('0.121', 'ether')});
      await account2.sendTransaction({from: trader2, value: Web3Utils.toWei('0.121', 'ether')});
      await account3.sendTransaction({from: trader3, value: Web3Utils.toWei('0.121', 'ether')});
      await account4.sendTransaction({from: trader4, value: Web3Utils.toWei('0.121', 'ether')});

      await account1.registerDerivativeAndPayFee(derivative.address, {from: trader1, gas: 500000});
      await account2.registerDerivativeAndPayFee(derivative.address, {from: trader2, gas: 500000});
      await account3.registerDerivativeAndPayFee(derivative.address, {from: trader3, gas: 500000});
      await account4.registerDerivativeAndPayFee(derivative.address, {from: trader4, gas: 500000});

      await derivative.addVerifiedAccount(account1.address, {from: owner});
      await derivative.addVerifiedAccount(account2.address, {from: owner});
      await derivative.addVerifiedAccount(account3.address, {from: owner});
      await derivative.addVerifiedAccount(account4.address, {from: owner});

      await derivative.markToMarket(10, 35, {from: owner});
    });

    it('should be able to create bid and ask', async () => {
      await account2.goLong(derivative.address, 10000, 30, {from: trader2});
      await account2.goShort(derivative.address, 10000, 40, {from: trader2});
       
      const bid = await derivative.getBid(account2.address);
      const ask = await derivative.getAsk(account2.address);

      assert.equal(bid[1], 30, 'Bid price not correct ' + bid[1].toString());
      assert.equal(ask[1], 40, 'Ask price not correct ' + ask[1].toString());

      const highestBid = await derivative.getHighestBid();
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(highestBid, 30, 'Highest bid price not correct ' + highestBid.toString());
      assert.equal(lowestAsk, 40, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to clear bid', async () => {
      await account1.goShort(derivative.address, 10000, 30, {from: trader1});
       
      const highestBid = await derivative.getHighestBid();
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(highestBid, 0, 'Highest bid price not correct ' + highestBid.toString());
      assert.equal(lowestAsk, 40, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to post higher ask and not affect lowest ask', async () => {
      await account1.goShort(derivative.address, 10000, 50, {from: trader1});
       
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(lowestAsk, 40, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to post lower ask and update lowest ask', async () => {
      await account1.goShort(derivative.address, 10000, 30, {from: trader1});
       
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(lowestAsk, 30, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to create new bid and ask', async () => {
      await account2.goLong(derivative.address, 10000, 25, {from: trader2});
      await account2.goShort(derivative.address, 10000, 45, {from: trader2});
       
      const highestBid = await derivative.getHighestBid();
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(highestBid, 25, 'Highest bid price not correct ' + highestBid.toString());
      assert.equal(lowestAsk, 30, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to clear ask', async () => {
      await account1.goShort(derivative.address, 0, 0, {from: trader1});
      await account1.goLong(derivative.address, 10000, 45, {from: trader1});
       
      const highestBid = await derivative.getHighestBid();
      const lowestAsk = await derivative.getLowestAsk();

      assert.equal(highestBid, 25, 'Highest bid price not correct ' + highestBid.toString());
      assert.equal(lowestAsk, 0, 'Lowest ask price not correct ' + lowestAsk.toString());
    });

    it('should be able to add two more bids', async () => {
      await account1.goLong(derivative.address, 10000, 30, {from: trader1});
      await account3.goLong(derivative.address, 10000, 20, {from: trader3});
       
      const highestBid = await derivative.getHighestBid();
      
      assert.equal(highestBid, 30, 'Highest bid price not correct ' + highestBid.toString());
    });

    it('should be clear across two bids 1', async () => {
      await account4.goShort(derivative.address, 15000, 25, {from: trader4});
       
      const highestBid = await derivative.getHighestBid();
      
      assert.equal(highestBid, 25, 'Highest bid price not correct ' + highestBid.toString());
    });

    it('should be clear across two bids 2', async () => {
      await account4.goShort(derivative.address, 6000, 20, {from: trader4});
       
      const highestBid = await derivative.getHighestBid();
      
      assert.equal(highestBid, 20, 'Highest bid price not correct ' + highestBid.toString());
    });

    it('should have positions', async () => {
      const position1 = await derivative.getPosition(account1.address);
      const position2 = await derivative.getPosition(account2.address);
      const position3 = await derivative.getPosition(account3.address);
      const position4 = await derivative.getPosition(account4.address);
     
      assert.equal(position1[0], 10000, 'Position1 not correct ' + position1[0].toString());
      assert.equal(position2[0], 10000, 'Position2 not correct ' + position2[0].toString());
      assert.equal(position3[0], 1000, 'Position3 not correct ' + position3[0].toString());
      assert.equal(position4[0], -21000, 'Position4 not correct ' + position4[0].toString());
    });

});
