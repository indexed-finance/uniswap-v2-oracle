const Deployer = require('../lib/deployer');
const Logger = require('../lib/logger');

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
  const uniswapFactory = (await deployments.get('uniswapFactory')).address;
  const weth = (await deployments.get('weth')).address;

  await deploy("IndexedUniswapV2Oracle", 'IndexedOracle', {
    from: deployer,
    gas: 4000000,
    args: [uniswapFactory, weth]
  });
};

module.exports.tags = ['Oracle'];
module.exports.dependencies = ['Uniswap']