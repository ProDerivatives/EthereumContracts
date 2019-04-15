module.exports = {
  getBids: async function(accounts, getBid) {
    const bids = await getOrders(accounts, getBid);
    return bids.sort((a, b) => b[0] - a[0]);
  },
  getAsks: async function(accounts, getAsk) {
    const asks = await getOrders(accounts, getAsk);
    return asks.sort((a, b) => a[0] - b[0]);
  }
}

async function getOrders(accounts, getOrder) {
  let orders = [];
  for (const a in accounts) {
    const account = accounts[a];
    const order = await getOrder(account);
    orders.push(order);
  }
  const orderBook = groupSumNotionals(orders);
  const prices = Object.keys(orderBook).filter(p => parseInt(p) !== 0);
  let result = [];
  for (const p in prices) {
    const price = prices[p];
    result.push([parseInt(price), orderBook[price]]);
  }
  return result;
}

function groupSumNotionals(arr) {
  return arr.reduce((res, value) => {
    const p = parseInt(value[1]);
    const n = parseInt(value[0]);
    if (!res[p]) {
        res[p] = 0;
    }
    res[p] += n;
    return res;
  }, {});
}

