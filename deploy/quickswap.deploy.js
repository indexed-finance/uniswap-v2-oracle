const Deployer = require('../lib/deployer');
const Logger = require('../lib/logger');

module.exports = async (bre) => {
  const { getChainId, getNamedAccounts } = bre;
  const chainID = +(await getChainId());
  const logger = Logger(chainID, 'deploy-uniswap-mocks');

  const { deployer } = await getNamedAccounts();
  const deploy = await Deployer(bre, logger);

  if (chainID == 1 && bre.network.name != 'coverage') return;

  const weth = await deploy('MockERC20', 'weth', {
    from: deployer,
    gas: 4000000,
    args: ["Wrapped Ether V9", "WETH9"]
  });

  const wmatic = await deploy('MockERC20', 'wmatic', {
    from: deployer,
    gas: 4000000,
    args: ["Wrapped Matic", "WMATIC"]
  });

  if (chainID == 4) return;

  const uniswapFactory = await deploy("UniswapV2Factory", 'uniswapFactory', {
    from: deployer,
    gas: 4000000,
    args: [deployer]
  });

  const uniswapRouter = await deploy('UniswapV2Router02', 'uniswapRouter', {
    from: deployer,
    gas: 4000000,
    args: [uniswapFactory.address, wmatic.address]
  });

  const wethOracle = await deploy("IndexedUniswapV2Oracle", 'wethOracle', {
    from: deployer,
    gas: 4000000,
    args: [uniswapFactory.address, weth.address]
  });

  const wmaticOracle = await deploy("IndexedUniswapV2Oracle", 'wmaticOracle', {
    from: deployer,
    gas: 4000000,
    args: [uniswapFactory.address, wmatic.address]
  });

  await deploy('OracleFallthrough', 'fallthrough', {
    from: deployer,
    gas: 4000000,
    args: [
      wethOracle.address,
      wmaticOracle.address,
      weth.address,
      wmatic.address
    ]
  })
};

module.exports.tags = ['Mocks', 'Quickswap'];