const fs = require('fs');
const url = require('url');
const Table = require('cli-table3');
const Logger = require('./lib/logger');
const Deployer = require('./lib/deployer');
const { toBN, toHex, oneToken } = require('./lib/bn');

// usePlugin("@nomiclabs/buidler-waffle");
usePlugin("buidler-ethers-v5");
usePlugin("buidler-deploy");
// usePlugin("@nomiclabs/buidler-web3");
usePlugin("solidity-coverage");

internalTask('deploy-test-token-and-market', 'Deploy a test token and Uniswap market pair for it and WETH')
  .setAction(async ({ logger, name, symbol }) => {
    const bre = require('@nomiclabs/buidler');
    const { deployments } = bre;
    const chainID = await getChainId();
    if (!logger) logger = Logger(chainID, 'deploy-test-token-and-market');
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to deploy test tokens.`);
    }
    const [signer] = await ethers.getSigners();
    const { deployer } = await getNamedAccounts();
    const deploy = await Deployer(bre, logger);
    let erc20;
    if (await deployments.getOrNull(symbol.toLowerCase())) {
      erc20 = await ethers.getContractAt(
        'MockERC20',
        (await deployments.getOrNull(symbol.toLowerCase())).address,
        signer
      );
      logger.info(`Found existing deployment for ${symbol}`);
    } else {
      erc20 = await deploy('MockERC20', symbol.toLowerCase(), {
        from: deployer,
        gas: 4000000,
        args: [name, symbol]
      }, true);
      logger.info(`Deployed MockERC20 for ${symbol}`);
    }
    logger.info(`Creating pair for ${symbol}:WETH`);
    const weth = await ethers.getContract('weth');
    let factory;
    if (chainID == 4) {
      factory = await ethers.getContractAt('UniswapV2Factory', '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', signer);
    } else {
      factory = await ethers.getContract('UniswapV2Factory', signer);
    }
    if (
      (await factory.getPair(erc20.address, weth.address)) == '0x0000000000000000000000000000000000000000' &&
      (await factory.getPair(weth.address, erc20.address)) == '0x0000000000000000000000000000000000000000'
    ) {
      await factory.createPair(erc20.address, weth.address).then(tx => tx.wait());
      logger.info(`Created pair for ${symbol}:WETH`);
    } else {
      logger.error(`Pair for ${symbol}:WETH already exists`);
    }
    return erc20;
  });

internalTask('add-liquidity', 'Add liquidity to a test token market')
  .setAction(async ({ logger, symbol, amountToken, amountWeth }) => {
    const bre = require('@nomiclabs/buidler');
    const { deployments } = bre;
    const chainID = await getChainId();
    if (!logger) {
      logger = Logger(chainID, 'add-liquidity');
    }
    const deploy = await Deployer(bre, logger);
    const { deployer } = await getNamedAccounts();
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to add liquidity to test tokens.`);
    }
    const [signer] = await ethers.getSigners();
    const weth = await ethers.getContract('weth');
    let factory, router;
    if (chainID == 4) {
      factory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
      router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    } else {
      factory = (await deployments.getOrNull('UniswapV2Factory')).address;
      router = (await deployments.getOrNull('UniswapV2Router02')).address;
    }
    const liquidityAdder = await deploy('LiquidityAdder', 'liquidityAdder', {
      from: deployer,
      gas: 1000000,
      args: [
        weth.address,
        factory,
        router
      ]
    }, true);
    const erc20 = await ethers.getContractAt(
      'MockERC20',
      (await deployments.getOrNull(symbol.toLowerCase())).address,
      signer
    );
    logger.success(`Adding liquidity to ${symbol}:ETH market`);
    await liquidityAdder.addLiquiditySingle(
      erc20.address,
      amountToken,
      amountWeth,
      { gasLimit: 4700000 }
    ).then(r => r.wait());
    logger.success(`Added liquidity to ${symbol}:ETH market`);
  });

task('add-test-liquidity', 'Add liquidity to test token markets')
  .addParam('file', 'Path to JSON file with the array of tokens')
  .addParam('updatePrices', 'Whether to update the prices of the tokens on the Uniswap oracles', false, types.boolean)
  .setAction(async ({ file, updatePrices }) => {
    const [signer] = await ethers.getSigners();
    const chainID = await getChainId();
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to add liquidity to test tokens.`);
    }
    const logger = Logger(10, 'add-test-liquidity');
    if (!fs.existsSync(file)) {
      throw new Error(`Invalid path given for file: ${file}`);
    }
    const tokens = require(file);
    const addresses = [];
    for (let token of tokens) {
      const { marketcap, name, symbol, price } = token;
      if (!marketcap || !name || !symbol || !price) {
        throw new Error(`Token JSON must include: marketcap, name, symbol, price`);
      }
      const erc20 = await ethers.getContract(
        'MockERC20',
        (await deployments.getOrNull(symbol.toLowerCase())).address,
        signer
      );
      addresses.push(erc20.address);
      const totalSupply = await erc20.totalSupply();
      let amountWeth = toBN(marketcap);
      if (totalSupply.eq(0)) {
        amountWeth = amountWeth.divn(10);
      }
      let amountToken = amountWeth.divn(price);
      await run('add-liquidity', {
        logger,
        symbol,
        amountToken: toHex(amountToken.mul(oneToken)),
        amountWeth: toHex(amountWeth.mul(oneToken))
      });
    }
    if (updatePrices) {
      await run('update-prices', { logger, tokens: addresses });
    }
  });

internalTask('update-prices', 'Update the prices for a list of tokens')
  .setAction(async ({ logger, tokens }) => {
    const chainID = await getChainId();
    if (!logger) {
      logger = Logger(chainID, 'update-prices');
    }
    const [signer] = await ethers.getSigners();
    logger.info('Updating prices on weekly TWAP oracle...');
    const shortOracle = await ethers.getContract('HourlyTWAPUniswapV2Oracle', signer);
    const receiptHourly = await shortOracle.updatePrices(tokens, { gasLimit: 2000000 }).then(r => r.wait());
    logger.info('Updated prices on weekly TWAP oracle!');
    logger.info('Updating prices on hourly TWAP oracle...');
    const oracle = await ethers.getContract('WeeklyTWAPUniswapV2Oracle', signer);
    const receiptWeekly = await oracle.updatePrices(tokens, { gasLimit: 2000000 }).then(r => r.wait());
    logger.success('Updated prices on hourly TWAP oracle!');
    logger.info('Updating prices on indexed oracle...');
    const indexedOracle = await ethers.getContract('IndexedOracle', signer);
    const receiptIndexed = await indexedOracle.updatePrices(tokens, { gasLimit: 2000000 }).then(r => r.wait());
    logger.success('Updated prices on indexed oracle!');

    const priceTable = new Table({head: ['Contract', 'Cost']});
    priceTable.push(['HourlyTWAP', receiptHourly.cumulativeGasUsed.toString()]);
    priceTable.push(['WeeklyTWAP', receiptWeekly.cumulativeGasUsed.toString()]);
    priceTable.push(['Indexed', receiptIndexed.cumulativeGasUsed.toString()]);
    
    // console.log(priceTable.toString());

  });

internalTask('getTimestamp', () => {
  return ethers.provider.getBlock('latest').then(b => b.timestamp);
});

internalTask('increaseTime', 'Increases the node timestamp')
  .setAction(async ({ days, hours, seconds }) => {
    const amount = days ? days * 86400 : hours ? hours * 3600 : seconds;
    await bre.ethers.provider.send('evm_increaseTime', [amount]);
    await bre.ethers.provider.send('evm_mine', []);
  });

module.exports = {
  external: {
    artifacts: [
      "node_modules/@uniswap/v2-core/build",
      "node_modules/@uniswap/v2-periphery/build"
    ],
  },
  namedAccounts: {
    deployer: {
      default: 0
    },
  },
  networks: {
    coverage: {
      url: url.format({
        protocol: "http:",
        port: 8555,
        hostname: "localhost",
      }),
    },
    deployments: {
      rinkeby: [
        "node_modules/@indexed-finance/uniswap-deployments/rinkeby"
      ]
    }
  },
  solc: {
    version: "0.6.8",
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
};
