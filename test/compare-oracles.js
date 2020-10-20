const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;

const chalk = require('chalk');
const Table = require('cli-table3');
const bre = require('@nomiclabs/buidler');
const { oneToken, toBN, toHex } = require('../lib/bn');
const testTokens = require('../test/test-data/test-tokens.json');
const { fastForwardToPeriodStart } = require("./utils");

const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
return;
describe('Compare Oracles', async () => {
  let weeklyTWAP, hourlyTWAP, indexedTWAP;
  let tokens = [];
  let addresses = [];
  let table;

  before(async () => {
    const [signer] = await ethers.getSigners();
    await deployments.fixture('Tokens');
    hourlyTWAP = await ethers.getContract('HourlyTWAPUniswapV2Oracle', signer);
    weeklyTWAP = await ethers.getContract('WeeklyTWAPUniswapV2Oracle', signer);
    indexedTWAP = await ethers.getContract('IndexedOracle', signer);
    for (let token of testTokens) {
      const { symbol } = token;
      const erc20 = await ethers.getContractAt(
        'MockERC20',
        (await deployments.getOrNull(symbol.toLowerCase())).address,
        signer
      );
      tokens.push({...token, erc20 });
      addresses.push(erc20.address);
    }
    table = new Table({ head: ['Scenario', 'Net Savings/Loss'] });
  });

  after(() => {
    console.log(table.toString());
  });

  async function addLiquidityAll() {
    for (let token of tokens) {
      const { marketcap, price, symbol } = token;
      let amountWeth = toBN(marketcap).divn(10);
      let amountToken = amountWeth.divn(price);
      await bre.run('add-liquidity', {
        symbol,
        amountToken: toHex(amountToken.mul(oneToken)),
        amountWeth: toHex(amountWeth.mul(oneToken))
      });
    }
  }

  function pushGasTable(title, oldPrice, newPrice) {
    // const table = new Table({ head: [title] });
    let _diff = (+oldPrice) - (+newPrice);
    let diff;
    if (_diff > 0) {
      diff = chalk.green(_diff);
    } else {
      diff = chalk.red(_diff);
    }
    table.push([title, diff]);
  }

  describe('Hourly TWAP - computeTwoWayAveragePrices', async () => {
    it('Price is in the same observation window', async () => {
      await fastForwardToPeriodStart(HOUR);
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      await bre.run('increaseTime', { hours: 0.6 });
      await addLiquidityAll();
      const oldPrice = await hourlyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, HOUR * 0.5, HOUR * 2);
      pushGasTable(
        'Price in same observation window | Hourly TWAP',
        oldPrice,
        newPrice
      );
    });

    it('Price is in the previous observation window', async () => {
      await fastForwardToPeriodStart(HOUR);
      await addLiquidityAll();
      const oldTimestamp = await bre.run('getTimestamp');
      console.log(`Seconds since hour start: ${oldTimestamp % HOUR}`);
      await bre.run('update-prices', { tokens: addresses });
      await fastForwardToPeriodStart(HOUR);
      await addLiquidityAll();
      const newTimestamp = await bre.run('getTimestamp');
      console.log(`Seconds since hour start: ${newTimestamp % HOUR}`);
      const oldPrice = await hourlyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, HOUR * 0.5, HOUR * 2);
      pushGasTable(
        'Price in previous observation window | Hourly TWAP',
        oldPrice,
        newPrice
      );
    });

    it('Price is 2 observation periods old', async () => {
      await fastForwardToPeriodStart(HOUR);
      await bre.run('increaseTime', { hours: 0.8 });
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      // await fastForwardToPeriodStart(HOUR);
      await bre.run('increaseTime', { hours: 1.5 });
      await addLiquidityAll();
      const oldPrice = await hourlyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, HOUR * 0.5, HOUR * 2);
      pushGasTable(
        'Price is 2 observation periods old | Hourly TWAP',
        oldPrice,
        newPrice
      );
    });

    it('Price is 6 observation periods old', async () => {
      await fastForwardToPeriodStart(HOUR);
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      await bre.run('increaseTime', { hours: 5 });
      await addLiquidityAll();
      await hourlyTWAP.setMaximumObservationAge(HOUR * 6).then(tx => tx.wait());
      const oldPrice = await hourlyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, HOUR * 0.5, HOUR * 6);
      pushGasTable(
        'Price is 6 observation periods old | Hourly TWAP',
        oldPrice,
        newPrice
      );
    });
  });

  describe('Weekly TWAP - computeTwoWayAveragePrices', async () => {
    it('Price is in the same observation window', async () => {
      await fastForwardToPeriodStart(WEEK);
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      await bre.run('increaseTime', { days: 3.5 });
      await addLiquidityAll();
      const oldPrice = await weeklyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, WEEK * 0.5, WEEK * 2);
      pushGasTable(
        'Price in same observation window | Weekly TWAP',
        oldPrice,
        newPrice
      );
    });

    it('Price is in the previous observation window', async () => {
      await fastForwardToPeriodStart(WEEK);
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      const diff = await fastForwardToPeriodStart(WEEK);
      console.log(diff)
      await addLiquidityAll();
      const oldPrice = await weeklyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, WEEK * 0.5, WEEK * 2);
      const oldValue = await weeklyTWAP.getLastPriceObservation(addresses[0]);
      const newValue = await indexedTWAP.getLastPriceObservation(addresses[0], WEEK * 0.5, WEEK * 2);
      console.log(oldValue.timestamp);
      console.log(newValue.timestamp);
      pushGasTable(
        'Price in previous observation window | Weekly TWAP',
        oldPrice,
        newPrice
      );
    });

    it('Price is 2 observation periods old', async () => {
      await fastForwardToPeriodStart(WEEK);
      await bre.run('increaseTime', { days: 6 });
      await addLiquidityAll();
      await bre.run('update-prices', { tokens: addresses });
      await fastForwardToPeriodStart(WEEK);
      await bre.run('increaseTime', { days: 7 });
      await addLiquidityAll();
      const oldPrice = await weeklyTWAP.estimateGas.computeTwoWayAveragePrices(addresses);
      const newPrice = await indexedTWAP.estimateGas.computeTwoWayAveragePrices(addresses, WEEK * 0.5, WEEK * 2);
      
      pushGasTable(
        'Price is 2 observation periods old | Weekly TWAP',
        oldPrice,
        newPrice
      );
    });
  });
});