//jshint ignore: start

const Web3Utils = require('web3-utils');
const f = require('./functions');

const ManagedForward = artifacts.require('./ManagedForward.sol');
const Account = artifacts.require('./Account.sol');

contract('ManagedForwardCloseOut', function(accounts) {
  
    let derivative;
    const owner = accounts[0];
    const trader1 = accounts[1];
    const trader2 = accounts[2];

    let account1;
    let account2;
      
    it('should be deployed', async () => {
      derivative = await ManagedForward.new(100, 2, 1000000);

      account1 = await Account.new();
      account2 = await Account.new();
  
      assert(derivative.address !== undefined, 'ManagedForward was not deployed');
      assert(account1.address !== undefined, 'Account1 was not deployed');
      assert(account2.address !== undefined, 'Account2 was not deployed');

      await account1.transferOwnership(trader1);
      await account2.transferOwnership(trader2);

      await derivative.setFee(100, {from: owner});

      await derivative.setInitialMarginRate(30, {from: owner});
      await derivative.setVariationMarginRate(10, {from: owner});
    });

    it('should be able to register and pay fees', async () => {
      const rfee1 = await account1.getRequiredFee(derivative.address, {from: trader1});
      const rfee2 = await account2.getRequiredFee(derivative.address, {from: trader2});

      assert.equal(rfee1, 100, 'Account1 Required Fee not correct');
      assert.equal(rfee2, 100, 'Account2 Required Fee not correct');

      await account1.sendTransaction({from: trader1, value: Web3Utils.toWei('0.121', 'ether')});
      await account2.sendTransaction({from: trader2, value: Web3Utils.toWei('0.121', 'ether')});

      await account1.registerDerivativeAndPayFee(derivative.address, {from: trader1, gas: 500000});
      await account2.registerDerivativeAndPayFee(derivative.address, {from: trader2, gas: 500000});

      await derivative.addVerifiedAccount(account1.address, {from: owner});
      await derivative.addVerifiedAccount(account2.address, {from: owner});

      await derivative.markToMarket(10, 30000000000000, {from: owner});
      await derivative.marginCheck(account1.address, {from: owner});
      await derivative.marginCheck(account2.address, {from: owner});
    });

    it('Accounts should not be in default', async () => {

      const isInDefault1 = await derivative.isInDefault(account1.address);
      const isInDefault2 = await derivative.isInDefault(account2.address);

      assert.isFalse(isInDefault1, 'Account1 is in default.');
      assert.isFalse(isInDefault2, 'Account2 is in default.');
    });

    it('should be able to create position', async () => {
      await account1.goLong(derivative.address, 10000, 30000000000000, {from: trader1});
      await account2.goShort(derivative.address, 10000, 30000000000000, {from: trader2});
       
      const long = await derivative.getPosition(account1.address);
      const short = await derivative.getPosition(account2.address);

      assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
      assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
      assert.equal(long[1], -300000000000000000, 'Long value not correct ' + long[1].toString());
      assert.equal(short[0], -10000, 'Short notional amount not correct ' + short[0].toString());
      assert.equal(short[1], 300000000000000000, 'Short value not correct ' + short[1].toString());
    });

    it('should be able to mark to market', async () => {
      await derivative.markToMarket(20, 31000000000000, {from: owner});
      await derivative.marginCheck(account1.address, {from: owner});
      await derivative.marginCheck(account2.address, {from: owner});
      
      const long = await derivative.getPosition(account1.address);
      const longMtM = await derivative.getMarkToMarket(long[0], long[1]);
      const short = await derivative.getPosition(account2.address);
      const shortMtM = await derivative.getMarkToMarket(short[0], short[1]);
      assert.equal(longMtM, 10000000000000000, 'Long MtM amount not correct ' + longMtM.toString());
      assert.equal(shortMtM, -10000000000000000, 'Short MtM amount not correct ' + shortMtM.toString());
    });

    it('should be able to calculate new collateral requirement', async () => {
      const long = await derivative.getPosition(account1.address);
      const longCollateralRequirement = await derivative.getCollateralRequirement(long[0], long[1], 0, 0, 0, 0);
      const short = await derivative.getPosition(account2.address);
      const shortCollateralRequirement = await derivative.getCollateralRequirement(short[0], short[1], 0, 0, 0, 0);
      assert.equal(longCollateralRequirement, 111000000000000000, 'Long collateral requirement not correct ' + longCollateralRequirement.toString());
      assert.equal(shortCollateralRequirement, 131000000000000000, 'Short collateral requirement not correct ' + shortCollateralRequirement.toString());
    });

    it('Account 2 should be in default', async () => {
      await derivative.markToMarket(30, 31000000000000, {from: owner});

      await derivative.marginCheck(account1.address, {from: owner});
      await derivative.marginCheck(account2.address, {from: owner});

      const isInDefault1 = await derivative.isInDefault(account1.address);
      const isInDefault2 = await derivative.isInDefault(account2.address);
 
      assert.isFalse(isInDefault1, 'Account1 is in default.');
      assert.isTrue(isInDefault2, 'Account2 is not in default.');
    });

    it('Account 2 should be closed out', async () => {
      await derivative.closeOut(account2.address, -10000, {from: owner});
      await account1.goShort(derivative.address, 10000, 31000000000000, {from: trader1});
  
      const long = await derivative.getPosition(account1.address);
      const short = await derivative.getPosition(account2.address);
   
      assert.equal(long[0], 0, 'Account1 notional should be zero.');
      assert.equal(short[0], 0, 'Account2 notional should be zero.');

      assert.equal(long[1], 10000000000000000, 'Account1 position value not correct ' + long[1].toString());
      assert.equal(short[1], -10000000000000000, 'Account2 position value not correct ' + short[1].toString());

      await derivative.marginCheck(account1.address, {from: owner});
      await derivative.marginCheck(account2.address, {from: owner});

      const isInDefault1 = await derivative.isInDefault(account1.address);
      const isInDefault2 = await derivative.isInDefault(account2.address);
 
      assert.isFalse(isInDefault1, 'Account1 is in default.');
      assert.isFalse(isInDefault2, 'Account2 is in default.');
    });

});