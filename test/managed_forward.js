//jshint ignore: start

const Web3Utils = require('web3-utils');
const f = require('./functions');

const ManagedForward = artifacts.require('./ManagedForward.sol');
const Account = artifacts.require('./Account.sol');

contract('ManagedForward', function(accounts) {
  
    let derivative;
    const owner = accounts[0];
    const trader1 = accounts[1];
    const trader2 = accounts[2];
    const trader3 = accounts[3];
    const trader4 = accounts[4];
    const random = accounts[5];
    const derivops = accounts[6];

    let account1;
    let account2;
    let account3;
    let account4;
    let account5;
      
    it('should be deployed', async () => {
      derivative = await ManagedForward.new(100, 2, 1000000);

      account1 = await Account.new();
      account2 = await Account.new();
      account3 = await Account.new();
      account4 = await Account.new();
      account5 = await Account.new();
  
      assert(derivative.address !== undefined, 'ManagedForward was not deployed');
      assert(account1.address !== undefined, 'Account1 was not deployed');
      assert(account2.address !== undefined, 'Account2 was not deployed');
      assert(account3.address !== undefined, 'Account3 was not deployed');
      assert(account4.address !== undefined, 'Account4 was not deployed');
      assert(account5.address !== undefined, 'Account5 was not deployed');

      await account1.transferOwnership(trader1);
      await account2.transferOwnership(trader2);
      await account3.transferOwnership(trader3);
      await account4.transferOwnership(trader3);
      await account5.transferOwnership(trader4);
      await derivative.transferOwnership(derivops);

      await derivative.setFee(100, {from: derivops});
    });

    it('should be able to register and pay fees', async () => {
      const rfee1 = await account1.getRequiredFee(derivative.address, {from: trader1});
      const rfee2 = await account2.getRequiredFee(derivative.address, {from: trader2});

      assert.equal(rfee1, 100, 'Account1 Required Fee not correct');
      assert.equal(rfee2, 100, 'Account2 Required Fee not correct');

      await account1.sendTransaction({from: trader1, value: Web3Utils.toWei('1', 'ether')});
      await account2.sendTransaction({from: trader2, value: Web3Utils.toWei('1', 'ether')});

      await account1.registerDerivativeAndPayFee(derivative.address, {from: trader1, gas: 500000});
      await account2.registerDerivativeAndPayFee(derivative.address, {from: trader2, gas: 500000});

      await derivative.addVerifiedAccount(account1.address, {from: derivops});
      await derivative.addVerifiedAccount(account2.address, {from: derivops});

      await derivative.markToMarket(10, 3000000000000000, {from: derivops});
    });

    it('Account1 should not be in default', async () => {

      const isInDefault = await derivative.isInDefault(account1.address);

      assert.isFalse(isInDefault, 'Account is in default.');
    });

    it('should be post orders', async () => {
      let ask = await derivative.getLowestAsk();
      let bid = await derivative.getHighestBid();
      assert.equal(ask, 0, "Lowest ask not correct.");
      assert.equal(bid, 0, "Highest bid not correct.");

      await account1.goLong(derivative.address, 10000, 2900000000000000, {from: trader1});
      await account2.goShort(derivative.address, 10000, 3100000000000000, {from: trader2});
      ask = await derivative.getLowestAsk();
      bid = await derivative.getHighestBid();
      assert.equal(ask, 3100000000000000, "Lowest ask not correct.");
      assert.equal(bid, 2900000000000000, "Highest bid not correct.");
    });

    it('should be able to create position', async () => {
      const tx1 = await account1.goLong(derivative.address, 10000, 3000000000000000, {from: trader1});
      const tx2 = await account2.goShort(derivative.address, 10000, 3000000000000000, {from: trader2});
       
      const long = await derivative.getPosition(account1.address);
      const short = await derivative.getPosition(account2.address);

      assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
      assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
      assert.equal(long[1], -30000000000000000000, 'Long value not correct ' + long[1].toString());
      assert.equal(short[0], -10000, 'Short notional amount not correct ' + short[0].toString());
      assert.equal(short[1], 30000000000000000000, 'Short value not correct ' + short[1].toString());
    });

    it('should have two accounts', async () => {
      const ac = await derivative.getAccounts({from: derivops});

      assert(ac.length === 2, 'Incorrect number of accounts ' + ac.length.toString());
    });

    it('should have one derivative contracts', async () => {
      const dc = await account1.getDerivatives({from: trader1});
        
      assert(dc.length === 1, 'Incorrect number of derivatives ' + dc.length.toString());
    });

    it('should be able to mark to market', async () => {
      await derivative.setInitialMarginRate(30, {from: derivops});
      await derivative.setVariationMarginRate(10, {from: derivops});

      const tx1 = await derivative.markToMarket(20, 3000004000000000, {from: derivops});
      
      const long = await derivative.getPosition(account1.address);
      const longMtM = await derivative.getMarkToMarket(long[0], long[1]);
      const short = await derivative.getPosition(account2.address);
      const shortMtM = await derivative.getMarkToMarket(short[0], short[1]);
      assert.equal(longMtM, 40000000000000, 'Long MtM amount not correct ' + longMtM.toString());
      assert.equal(shortMtM, -40000000000000, 'Short MtM amount not correct ' + shortMtM.toString());
    });

    it('should be able to calculate collateral requirement', async () => {
      await derivative.setInitialMarginRate(2, {from: derivops});
      await derivative.setVariationMarginRate(1, {from: derivops});

      const tx2 = await derivative.markToMarket(30, 3600000000000000, {from: derivops});

      const col1 = await account1.getCollateralRequirement(derivative.address);
      const col2 = await account2.getCollateralRequirement(derivative.address);

      assert.equal(col1, 0, 'Collateral requirement of long position not correct ' + col1.toString());
      assert.equal(col2, 6960000000000000000, 'Collateral requirement of short position not correct ' + col2.toString());
    });

    it('Trader1 account allocation equals collateral requirement', async() => {
      const alloc = await account1.getTotalAllocated();
      const collat = await account1.getCollateralRequirement(derivative.address);

      //console.log('Allocation does not match collateral requirement: ' + web3.fromWei(alloc, 'ether') + ' vs ' + web3.fromWei(collat, 'ether'));
      assert.isTrue(alloc.eq(collat), 'Allocation does not match collateral requirement: ' + Web3Utils.fromWei(alloc, 'ether') + ' vs ' + Web3Utils.fromWei(collat, 'ether'));
    });

    it('Trader2 account allocation equals collateral requirement', async() => {
      const alloc = await account2.getTotalAllocated();
      const collat = await account2.getCollateralRequirement(derivative.address);

      //console.log('Allocation does not match collateral requirement: ' + web3.fromWei(alloc, 'ether') + ' vs ' + web3.fromWei(collat, 'ether'));
      assert.isTrue(alloc.eq(collat), 'Allocation does not match collateral requirement: ' + Web3Utils.fromWei(alloc, 'ether') + ' vs ' + Web3Utils.fromWei(collat, 'ether'));
    });

    it('owner should be able to call register derivative', async () => {
      // Fund acccounts
      await account3.sendTransaction({from: trader3, value: Web3Utils.toWei('1', 'ether')});
      await account4.sendTransaction({from: trader3, value: Web3Utils.toWei('1', 'ether')});
      await account5.sendTransaction({from: trader4, value: Web3Utils.toWei('1', 'ether')});

      const tx = await account3.registerDerivativeAndPayFee(derivative.address, {from: trader3, gas: 500000});
      await derivative.addVerifiedAccount(account3.address, {from: derivops});
      
      const d = await account3.getDerivatives({from: trader3});
    
      assert(d[0] === derivative.address, 'derivative address does not match');

      await account4.registerDerivativeAndPayFee(derivative.address, {from: trader3, gas: 500000});
      await account5.registerDerivativeAndPayFee(derivative.address, {from: trader4, gas: 500000});

      await derivative.addVerifiedAccount(account4.address, {from: derivops});
      await derivative.addVerifiedAccount(account5.address, {from: derivops});

      const paidFee1 = await derivative.fees(account1.address, {from: trader1});
      const paidFee2 = await derivative.fees(account2.address, {from: trader2});
      const paidFee3 = await derivative.fees(account3.address, {from: trader3});
      const paidFee4 = await derivative.fees(account4.address, {from: trader3});
      const paidFee5 = await derivative.fees(account5.address, {from: trader4});

      const balance = await web3.eth.getBalance(derivative.address);

      assert.equal(paidFee1, 100, 'Account1 fee not correct: ' + paidFee1.toString());
      assert.equal(paidFee2, 100, 'Account2 fee not correct: ' + paidFee2.toString());
      assert.equal(paidFee3, 100, 'Account3 fee not correct: ' + paidFee3.toString());
      assert.equal(paidFee4, 100, 'Account4 fee not correct: ' + paidFee4.toString());
      assert.equal(paidFee5, 100, 'Account5 fee not correct: ' + paidFee5.toString());
      assert.equal(balance, 500, 'Fee and/or balance do not match: ' + balance.toString());
    });

    it('derivops should be able to call add derivative', async () => {
      const tx1 = await account3.addOperator(derivops, {from: trader3});
      const tx2 = await account3.registerDerivativeAndPayFee(derivative.address, {from: derivops});

      const d = await account3.getDerivatives({from: trader3});

      assert(d[0] === derivative.address, 'derivative address does not match');
    });

    it('starting position should be zero', async () => {
      const p = await derivative.getPosition(account3.address, {from: trader3});

      assert.equal(p[0], 0, 'Notional not correct ' + p[0].toString());
      assert.equal(p[1], 0, 'Value not correct ' + p[1].toString());
    });

    it('Trader3 can submit long trade via Account4', async () => {
      const tx = await account4.goLong(derivative.address, 100, 10, {from: trader3});

      const accounts = await derivative.getAccounts({from: derivops});

      const asks = await f.getAsks(accounts, derivative.getAsk);
      const bids = await f.getBids(accounts, derivative.getBid);

      const bid = await derivative.getBid(account4.address, {from: trader3});
      const notional = bid[0];
      const xp = bid[1];
 
      assert.equal(notional, 100, 'Notional amount not correct ' + notional.toString());
      assert.equal(xp, 10, 'XP amount not correct ' + xp.toString());
    });

    it('Trader4 can submit short trade via Account5 and trigger settlement', async () => {
      const tx = await account5.goShort(derivative.address, 100, 10, {from: trader4});

      const long = await derivative.getPosition(account4.address, {from: trader3});
      const longNotional = long[0];
      const longValue = long[1];
      const short = await derivative.getPosition(account5.address, {from: trader4});
      const shortNotional = short[0];
      const shortValue = short[1];
 
      assert.equal(longNotional, 100, 'Long notional amount not correct ' + longNotional.toString());
      assert.equal(longValue, -1000, 'Long value not correct ' + longValue.toString());
      assert.equal(shortNotional, -100, 'Short notional amount not correct ' + shortNotional.toString());
      assert.equal(shortValue, 1000, 'Short value not correct ' + shortValue.toString());

      const accounts = await derivative.getAccounts({from: derivops});

      const asks = await f.getAsks(accounts, derivative.getAsk);
      const bids = await f.getBids(accounts, derivative.getBid);

      let lowestAskPrice = 0;
      let highestBidPrice = 0;
      if (asks.length != 0)
        lowestAskPrice = asks[0][0];
      if (bids.length != 0)
        highestBidPrice = bids[0][0];

      assert.equal(lowestAskPrice, 0, 'Lowest ask not correct ' + lowestAskPrice.toString());
      assert.equal(highestBidPrice, 0, 'Highest bid not correct ' + highestBidPrice.toString());
  
    });

    it('Trader4 can submit another sell order', async () => {
      /*
      const requirement = await account5.getCollateralRequirement(derivative.address);
      console.log(`Requirement: ${requirement.toString()}`);
      const alloc = await account5.getTotalAllocated();
      console.log(`Allocated: ${alloc.toString()}`);
      const avail = await account5.getTotalAvailable();
      console.log(`Available: ${avail.toString()}`);
      
      const bid = await derivative.getBid(account5.address, {from: trader4});
      const pos = await derivative.getPosition(account5.address, {from: trader4});

      const nr = await derivative.getCollateralRequirement(pos[0], pos[1], bid[0], bid[1], 10, 20);
      console.log(`New req: ${nr.toString()}`);
      */

      await account5.goShort(derivative.address, 10, 20, {from: trader4});

      const ask = await derivative.getAsk(account5.address, {from: trader4});
      assert.equal(ask[0], 10, 'Ask not correct ' + ask.toString());
    });

    it('Trader4 can cancel sell order', async () => {
      await account5.goShort(derivative.address, 0, 0, {from: trader4});

      const ask = await derivative.getAsk(account5.address, {from: trader4});
      assert.equal(ask[0], 0, 'Ask not correct ' + ask.toString());
    });

    it('Trader3 can offset own bid', async () => {
      const tx1 = await account4.goLong(derivative.address, 200, 20, {from: trader3});
      const tx2 = await account4.goShort(derivative.address, 50, 20, {from: trader3});

      const bid = await derivative.getBid(account4.address, {from: trader3});
      const bidNotional = bid[0];
      const bidXp = bid[1];
 
      assert.equal(bidNotional, 150, 'Notional amount not correct ' + bidNotional.toString());
      assert.equal(bidXp, 20, 'XP amount not correct ' + bidXp.toString());

      const ask = await derivative.getAsk(account4.address, {from: trader3});
      const askNotional = ask[0];
      const askXp = ask[1];
 
      assert.equal(askNotional, 0, 'Notional amount not correct ' + askNotional.toString());
      assert.equal(askXp, 0, 'XP amount not correct ' + askXp.toString());

      const long = await derivative.getPosition(account4.address, {from: trader3});
      const longNotional = long[0];
      const longValue = long[1];
    
      assert.equal(longNotional, 100, 'Long notional amount not correct ' + longNotional.toString());
      assert.equal(longValue, -1000, 'Long value not correct ' + longValue.toString());

      const accounts = await derivative.getAccounts({from: derivops});

      const asks = await f.getAsks(accounts, derivative.getAsk);
      const bids = await f.getBids(accounts, derivative.getBid);

      let lowestAskPrice = 0;
      let highestBidPrice = 0;
      if (asks.length != 0)
        lowestAskPrice = asks[0][0];
      if (bids.length != 0)
        highestBidPrice = bids[0][0];

      assert.equal(lowestAskPrice, 0, 'Lowest ask not correct ' + lowestAskPrice.toString());
      assert.equal(highestBidPrice, 20, 'Highest bid not correct ' + highestBidPrice.toString());
 
    });

    it('Clear order book', async () => {

      const accounts = await derivative.getAccounts({from: derivops});
      let asks = await f.getAsks(accounts, derivative.getAsk);
      let bids = await f.getBids(accounts, derivative.getBid);

      assert.isTrue(asks.length > 0 || bids.length > 0, 'Order book must contain items at beginning of test');

      await account1.goLong(derivative.address, 0, 0, {from: trader1});
      await account1.goShort(derivative.address, 0, 0, {from: trader1});

      await account2.goLong(derivative.address, 0, 0, {from: trader2});
      await account2.goShort(derivative.address, 0, 0, {from: trader2});

      await account3.goLong(derivative.address, 0, 0, {from: trader3});
      await account3.goShort(derivative.address, 0, 0, {from: trader3});

      await account4.goLong(derivative.address, 0, 0, {from: trader3});
      await account4.goShort(derivative.address, 0, 0, {from: trader3});

      await account5.goLong(derivative.address, 0, 0, {from: trader4});
      await account5.goShort(derivative.address, 0, 0, {from: trader4});

      asks = await f.getAsks(accounts, derivative.getAsk);
      bids = await f.getBids(accounts, derivative.getBid);

      assert.isTrue(asks.length == 0 && bids.length == 0, 'Order book must be empty at end of test');
    });

    it('One buy order can settle two small sell orders (partial settlement)', async () => {

      await derivative.markToMarket(40, 3000000000000000, {from: derivops});

      await account3.sendTransaction({from: trader1, value: Web3Utils.toWei('1', 'ether')});
      await account4.sendTransaction({from: trader2, value: Web3Utils.toWei('1', 'ether')});
      await account5.sendTransaction({from: trader2, value: Web3Utils.toWei('1', 'ether')});

      await account3.goShort(derivative.address, 700, 2980000000000000, {from: trader3});
      await account4.goShort(derivative.address, 250, 2990000000000000, {from: trader3});

      await account5.goLong(derivative.address, 1000, 3000000000000000, {from: trader4});

      await account4.goShort(derivative.address, 500, 3500000000000000, {from: trader3});

      const accounts = await derivative.getAccounts({from: derivops});
      const asks = await f.getAsks(accounts, derivative.getAsk);
      const bids = await f.getBids(accounts, derivative.getBid);

      const short = await derivative.getPosition(account3.address);
      
      assert.equal(bids[0][0], 3000000000000000, 'Bid price not correct');
      assert.equal(bids[0][1], 50, 'Bid notional not correct');

      assert.equal(asks[0][0], 3500000000000000, 'Ask price not correct');
      assert.equal(asks[0][1], 500, 'Ask notional not correct');

      assert.equal(short[0], -700, 'Account3 Position Notional not correct');
      assert.equal(short[1], 2100000000000000000, 'Account3 Position Amount not correct');

      // assert.isTrue(false)
    });

    it('Trader4 account is in use', async () => {
      const inUse = await account5.isInUse({from: trader4});
      assert.isTrue(inUse, 'Account not in use');
    });

    it('Account1 allocation equals collateral requirement', async() => {
      const alloc = await account1.getTotalAllocated();

      let collat = 0;
      const derivatives = await account1.getDerivatives();
      for (const d in derivatives) {
        collat += await account1.getCollateralRequirement(derivatives[d]);   
      }
 
      //console.log('Allocation does not match collateral requirement: ' + web3.fromWei(alloc, 'ether') + ' vs ' + web3.fromWei(collat, 'ether'));
      assert.equal(Web3Utils.fromWei(alloc, 'ether'), Web3Utils.fromWei(collat, 'ether'), 'Allocation does not match collateral requirement: ' + Web3Utils.fromWei(alloc, 'ether') + ' vs ' + Web3Utils.fromWei(collat, 'ether'));
    });

    it('Account5 allocation equals collateral requirement', async() => {
      const alloc = await account2.getTotalAllocated();
      let collat = 0;
      const derivatives = await account2.getDerivatives();
      for (const d in derivatives) {
        collat += await account2.getCollateralRequirement(derivatives[d]);   
      }

      //console.log('Allocation does not match collateral requirement: ' + web3.fromWei(alloc, 'ether') + ' vs ' + web3.fromWei(collat, 'ether'));
      assert.equal(Web3Utils.fromWei(alloc, 'ether'), Web3Utils.fromWei(collat, 'ether'), 'Allocation does not match collateral requirement: ' + Web3Utils.fromWei(alloc, 'ether') + ' vs ' + Web3Utils.fromWei(collat, 'ether'));
    });

    it('should be possible to close position', async () => {
      let isExpired = await derivative.isExpired();
      assert.isFalse(isExpired, 'Derivative should be active at start of test');

      const price = 3000000500000000;
      await derivative.markToMarket(100, price, {from: derivops});

      await derivative.closePosition(account1.address, {from: derivops});
      await derivative.closePosition(account2.address, {from: derivops});
      await derivative.closePosition(account3.address, {from: derivops});
      await derivative.closePosition(account4.address, {from: derivops});
      await derivative.closePosition(account5.address, {from: derivops});
      
      isExpired = await derivative.isExpired();
      assert.isTrue(isExpired, 'Derivative should be expired at end of test');
  });

  it('should be possible to settle position', async () => {
      let isSettled = await derivative.isSettled();
      assert.isFalse(isSettled, 'There should be open positions at start of test');

      /* const accounts = await derivative.getAccounts({from: derivops});
      for (const a in accounts) {
        const account = accounts[a];
        const pos = await derivative.getPosition(account);
        console.log(a + ': ' + account + ' : ' + pos[1]);
      } */

      await derivative.settle(account2.address, account1.address, Web3Utils.toBN(5000000000000), {from: derivops});
      await derivative.settle(account3.address, account4.address, Web3Utils.toBN(350000000000), {from: derivops});
      await derivative.settle(account5.address, account4.address, Web3Utils.toBN(299999574999999000), {from: derivops});
      
      isSettled = await derivative.isSettled();
      assert.isTrue(isSettled, 'Derivative should be settled at end of test');
  });

  it('deleting derivative contract should release collateral', async () => {
      const d = await ManagedForward.new(20200101, 2, 500);
      await d.setInitialMarginRate(30);
      await d.setVariationMarginRate(20);
      const acc1 = await Account.new();
      const acc2 = await Account.new();
      await acc1.sendTransaction({value: 1000000});
      await acc2.sendTransaction({value: 1000000});
      await acc1.registerDerivativeAndPayFee(d.address);
      await acc2.registerDerivativeAndPayFee(d.address);
      await d.addVerifiedAccount(acc1.address);
      await d.addVerifiedAccount(acc2.address);
      await acc1.goLong(d.address, 10000, 50);
      await acc2.goShort(d.address, 9000, 50);
      await d.markToMarket(20191201, 55);

      let acc1_alloc = await acc1.getTotalAllocated();
      let acc1_avail = await acc1.getTotalAvailable();
      let acc2_alloc = await acc2.getTotalAllocated();
      let acc2_avail = await acc2.getTotalAvailable();

      assert.equal(acc1_alloc, 210000, "Account1 allocated amount incorrect");
      assert.equal(acc1_avail, 789500, "Account1 available amount incorrect");
      assert.equal(acc2_alloc, 279000, "Account2 allocated amount incorrect");
      assert.equal(acc2_avail, 720500, "Account2 available amount incorrect");


      //console.log("Account1 Allocated: " + acc1_alloc.toString() + " Available: " + acc1_avail.toString());
      //console.log("Account2 Allocated: " + acc2_alloc.toString() + " Available: " + acc2_avail.toString());

      await d.markToMarket(20200101, 55);
      await d.closePosition(acc1.address);
      await d.closePosition(acc2.address);
      await d.settle(acc2.address, acc1.address, 45000);

      /* const accounts = await d.getAccounts();
      for (const a in accounts) {
        const account = accounts[a];
        const pos = await d.getPosition(account);
        console.log(a + ': ' + account + ' : ' + pos[0] + ', ' + pos[1]);
      } */

      await d.destroy();

      acc1_alloc = await acc1.getTotalAllocated();
      acc1_avail = await acc1.getTotalAvailable();
      acc2_alloc = await acc2.getTotalAllocated();
      acc2_avail = await acc2.getTotalAvailable();

      //console.log("Account1 Allocated: " + acc1_alloc.toString() + " Available: " + acc1_avail.toString());
      //console.log("Account2 Allocated: " + acc2_alloc.toString() + " Available: " + acc2_avail.toString());

      assert.equal(acc1_alloc, 0, "Account1 allocated amount incorrect");
      assert.equal(acc1_avail, 1044500, "Account1 available amount incorrect");
      assert.equal(acc2_alloc, 0, "Account2 allocated amount incorrect");
      assert.equal(acc2_avail, 954500, "Account2 available amount incorrect");

  });

});