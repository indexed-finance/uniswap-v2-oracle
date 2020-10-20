const Logger = require('../lib/logger');
const { oneToken, toBN, toHex } = require('../lib/bn');

const testTokens = require('../test/test-data/test-tokens.json');


module.exports = async ({
  getChainId,
  run
}) => {
  const chainID = await getChainId();
  const logger = Logger(chainID, 'deploy-mock-tokens');
  
  const addresses = [];
  for (let token of testTokens) {
    const { marketcap, name, symbol, price } = token;
    if (!marketcap || !name || !symbol || !price) {
      throw new Error(`Token JSON must include: marketcap, name, symbol, price`);
    }
    const erc20 = await run('deploy-test-token-and-market', { logger, name, symbol });
    addresses.push(erc20.address);
    const totalSupply = await erc20.totalSupply();
    let amountWeth = toBN(marketcap);
    // let liquidity = marketcap / price;
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
  await run('update-prices', { logger, tokens: addresses });
  logger.info('Executing deployment script.');
};

module.exports.tags = ['Tokens'];
module.exports.dependencies = ['Mocks'];