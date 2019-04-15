

//jshint ignore: start

const Account = artifacts.require('./Account.sol');

contract('Account', function(accounts) {
  
  let account;
  const principal = accounts[0];
  const operator = accounts[1];
  const random = accounts[2];
    
  it('should be deployed', async () => {
    account = await Account.new();
    
    assert(account.address !== undefined, 'Account was not deployed');
  });

  it('principal should be owner', async () => {
    const owner = await account.owner.call();
    assert(owner === principal, `Failed to add operator ${owner}`);
  });
  
  it('owner should be able to add operator', async () => {
    const tx = await account.addOperator(operator, {from: principal});
    //state should be updated
    const isOperator = await account.operators.call(operator);
    //const isOperator = true;
    assert(isOperator, 'Failed to add operator');
  });

  it('non-owner should not be able to add operator', async () => {
    try {
        const tx = await account.addOperator(operator, {from: random});
        //state should be updated
        const isOperator = await account.operators.call(operator);
        //const isOperator = true;
        assert(!isOperator, 'Succeeded in adding operator');
      } catch (ex) {
          // Expect to get here
      }
  });
  
});
