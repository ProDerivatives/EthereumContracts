const Web3Utils = require('web3-utils');

module.exports = {
  ranking: async function(getDerivative, getAccount) {
    const fs = require('fs');
    const notionalConversionFactor = 100;
    const priceConversionFactor = 10000000000000000;
    const derivative = await getDerivative('0x7e49ec8389335a6280fbd411d5ac704e646632a9');
    const valuationDate = await derivative.valuationTime();
    const valDate = new Date(valuationDate * 1000);
    const price = await derivative.price();
    fs.writeFileSync("./ranking.csv", `Valuation Date: ${valDate.toLocaleDateString()}, Price: ${(price / priceConversionFactor).toString()} ETH/USD (${(priceConversionFactor / price).toString()} USD/ETH)\r\n`);
    fs.appendFileSync("./ranking.csv", `Contract Value (ETH), Account Contract, Owner, Notional (USD), Allocated Collat (ETH), Available Collat (ETH)\r\n`);
    const accountAddresses = await derivative.getAccounts();
    for (const a in accountAddresses) {
      const accountAddress = accountAddresses[a];
      const account = await getAccount(accountAddress);
      const owner = await account.owner();
      const position = await derivative.getPosition(accountAddress);
      const mtm = await derivative.getMarkToMarket(position[0], position[1]);
      const allocatedCollat = await account.getTotalAllocated();
      const availableCollal = await account.getTotalAvailable();
      fs.appendFileSync("./ranking.csv", `${Web3Utils.fromWei(mtm, 'ether')}, ${accountAddress}, ${owner}, ${(position[0] / notionalConversionFactor).toString()}, ${Web3Utils.fromWei(allocatedCollat, 'ether')}, ${Web3Utils.fromWei(availableCollal, 'ether')}\r\n`);
    }
  }
}