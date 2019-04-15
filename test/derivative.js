
//jshint ignore: start

const Derivative = artifacts.require('./Derivative.sol');

contract('Derivative', function(accounts) {
  
    let derivative;
    const owner = accounts[0];
    const trader1 = accounts[1];
    const trader2 = accounts[2];
    const trader3 = accounts[3];
      
    it('should be deployed', async () => {
      //derivative = await Derivative.deployed();
      derivative = await Derivative.new();
  
      assert(derivative.address !== undefined, 'Derivative was not deployed');

      await derivative.payFee({amount: 500, from: trader1});
      await derivative.payFee({amount: 500, from: trader2});
      await derivative.payFee({amount: 500, from: trader3});

      await derivative.addVerifiedAccount(trader1);
      await derivative.addVerifiedAccount(trader2);
      await derivative.addVerifiedAccount(trader3);
    });

    it('should be able to check list of accounts', async () => {
      const accounts = await derivative.getAccounts();

      assert(accounts.length === 3, 'Number of accounts not correct ' + accounts.length);      
    });

});