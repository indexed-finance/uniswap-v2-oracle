const { BigNumber } = require('ethers');
const { formatEther } = require('ethers/lib/utils');

const bre = require("@nomiclabs/buidler");

const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;

async function mineBlock(timestamp) {
  return bre.ethers.provider.send('evm_mine', timestamp ? [timestamp] : [])
}

async function fastForward(seconds) {
  await bre.ethers.provider.send('evm_increaseTime', [seconds]);
  await mineBlock();
}

async function fastForwardToPeriodStart(observationPeriod) {
  const timestamp = await bre.run('getTimestamp');
  const seconds = observationPeriod - ((+timestamp) % observationPeriod);
  await fastForward(seconds);
}

async function fastForwardToNextHour() {
  await fastForwardToPeriodStart(HOUR);
}

function expandTo18Decimals(n) {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

function from18Decimals(n) {
  return formatEther(n);
}

function encodePrice(_tokenReserves, _wethReserves, _blockTimestamp, lastPrice = {}) {
  const blockTimestamp = _blockTimestamp % (2**32);
  const timeElapsed = blockTimestamp - (lastPrice.blockTimestamp || 0);
  let tokenPriceAverage = lastPrice.tokenPriceAverage;
  let ethPriceAverage = lastPrice.ethPriceAverage;
  let tokenPriceCumulativeLast = BigNumber.from(0)
  let ethPriceCumulativeLast = BigNumber.from(0);
  if (timeElapsed > 0 && lastPrice.tokenReserves && lastPrice.wethReserves) {
    const { tokenReserves, wethReserves } = lastPrice;
    tokenPriceAverage = wethReserves.mul(BigNumber.from(2).pow(112)).div(tokenReserves);
    ethPriceAverage = tokenReserves.mul(BigNumber.from(2).pow(112)).div(wethReserves);
    tokenPriceCumulativeLast = lastPrice.tokenPriceCumulativeLast.add(
      tokenPriceAverage.mul(timeElapsed)
    );
    ethPriceCumulativeLast = lastPrice.ethPriceCumulativeLast.add(
      ethPriceAverage.mul(timeElapsed)
    );
  }
  const tokenReserves = BigNumber.from(lastPrice.tokenReserves || 0).add(_tokenReserves);
  const wethReserves = BigNumber.from(lastPrice.wethReserves || 0).add(_wethReserves);
  return {
    tokenReserves,
    wethReserves,
    tokenPriceAverage,
    ethPriceAverage,
    blockTimestamp,
    tokenPriceCumulativeLast,
    ethPriceCumulativeLast
  };
}

async function getTransactionTimestamp(_tx) {
  const tx = await Promise.resolve(_tx)
  const receipt = await tx.wait();
  const { timestamp } = await ethers.provider.getBlock(receipt.blockNumber);
  return timestamp;
}

module.exports = {
  HOUR,
  DAY,
  WEEK,
  expandTo18Decimals,
  from18Decimals,
  fastForward,
  fastForwardToNextHour,
  fastForwardToPeriodStart,
  encodePrice,
  getTransactionTimestamp
}