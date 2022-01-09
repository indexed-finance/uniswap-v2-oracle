const Deployer = require('../lib/deployer');
const Logger = require('../lib/logger');

const wethOracle = '0x672A44626C193CCafCD253b1B096de219FdcC2fa';
const maticOracle = '0xe0E828643266Fab54716503f82FB404867214f39';
const weth = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
const matic = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270';

module.exports = async (bre) => {
  const {
    deployments,
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const chainID = await getChainId();
  const logger = Logger(chainID)
  const { deployer } = await getNamedAccounts();

  const deploy = await Deployer(bre, logger);

  await deploy("OracleFallthrough", 'OracleFallthrough', {
    from: deployer,
    gas: 4000000,
    args: [
      wethOracle,
      maticOracle,
      weth,
      matic
    ]
  });
};

module.exports.tags = ['OracleFallthrough'];