# Ethereum
Ethereum-based derivative contracts

## Test Contracts
Open a command prompt, cd into the root directory of this repository and enter

truffle develop
```js
truffle(develop)> test
```

## Interact with local Ethereum node
Open a command prompt, cd into the root directory of this repository and enter

truffle console --network local
```js
truffle(local)> var deriv = await ManagedForward.at('0x077d476d70c492861e2140f47e93cccec467a189')

truffle(local)> deriv.getAccounts()
[ '0x2b7C6260c28F2aFC6ee53FC23Dd716C641AA2d76',
  '0x33f13AcfEFC4b9408c6Db5deA5F65aB6CCf2eef2' ]
  
```
