//jshint ignore: start

const Web3Utils = require('web3-utils');
const EthUtils = require('ethereumjs-util');
const f = require('./functions');

const Forward = artifacts.require('./Forward.sol');
const Account = artifacts.require('./Account.sol');

contract('Forward', function(accounts) {
    let derivative;
    const owner = accounts[0];
    const trader1 = accounts[1];
    const trader2 = accounts[2];

    let account1;
    let account2;

    it('should be deployed', async () => {
        derivative = await Forward.new(100, 1000000, 30, 10);
  
        account1 = await Account.new();
        account2 = await Account.new();

        assert(derivative.address !== undefined, 'Forward was not deployed');
        assert(account1.address !== undefined, 'Account1 was not deployed');
        assert(account2.address !== undefined, 'Account2 was not deployed');

        await account1.transferOwnership(trader1);
        await account2.transferOwnership(trader2);
    });

    it('should be able to register and pay fees', async () => {
        const rfee = await account1.getRequiredFee(derivative.address, {from: trader1});
        assert.equal(rfee, 1000000, 'Account1 Required Fee not correct');
  
        await account1.sendTransaction({from: trader1, value: Web3Utils.toWei('1', 'ether')});
        await account2.sendTransaction({from: trader2, value: Web3Utils.toWei('1', 'ether')});
  
        await account1.registerDerivativeAndPayFee(derivative.address, {from: trader1, gas: 500000});
        await account2.registerDerivativeAndPayFee(derivative.address, {from: trader2, gas: 500000});
  
        await derivative.addVerifiedAccount(account1.address, {from: owner});
        await derivative.addVerifiedAccount(account2.address, {from: owner});
    });

    it('Account1 should not be in default', async () => {

        const isInDefault = await derivative.isInDefault(account1.address);

        assert.isFalse(isInDefault, 'Account1 is in default.');
    });

    it('should be able to trade and set price', async () => {
        const tx1 = await account1.goLong(derivative.address, 10000, 100000, {from: trader1});
        const tx2 = await account2.goShort(derivative.address, 10000, 100000, {from: trader2});
         
        const long = await derivative.getPosition(account1.address);
        const short = await derivative.getPosition(account2.address);
  
        assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
        assert.equal(long[0], 10000, 'Long notional amount not correct ' + long[0].toString());
        assert.equal(long[1], -1000000000, 'Long value not correct ' + long[1].toString());
        assert.equal(short[0], -10000, 'Short notional amount not correct ' + short[0].toString());
        assert.equal(short[1], 1000000000, 'Short value not correct ' + short[1].toString());

        const price = await derivative.price();
        assert.equal(price, 100000, 'Price is not correct');
    });

    it('should be possible to close position', async () => {
        let isExpired = await derivative.isExpired();
        assert.isFalse(isExpired, 'Derivative should be active at start of test');

        const price = 20000;

        const message = web3.eth.abi.encodeParameter('int64', price);
        const hash = Web3Utils.sha3(message);
        let signature = await web3.eth.sign(hash, owner);
        var split = EthUtils.fromRpcSig(signature);

        await derivative.closePosition(account1.address, price, split.v, split.r, split.s);
        await derivative.closePosition(account2.address, price, split.v, split.r, split.s);
        
        isExpired = await derivative.isExpired();
        assert.isTrue(isExpired, 'Derivative should be expired at end of test');
    });

    it('should be possible to settle position', async () => {
        let isSettled = await derivative.isSettled();
        assert.isFalse(isSettled, 'There should be open positions at start of test');

        const short = await derivative.getPosition(account2.address);
        await derivative.settle(account1.address, account2.address, short[1]);
        
        isSettled = await derivative.isSettled();
        assert.isTrue(isSettled, 'Derivative should be settled at end of test');
    });

});