
module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  networks: {
    local: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
    }
  }
};