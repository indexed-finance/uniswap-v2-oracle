const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;
const bre = require('@nomiclabs/buidler');
const { expandTo18Decimals, fastForwardToNextHour, encodePrice, getTransactionTimestamp, fastForward, HOUR } = require('./utils');
const { testTokensFixture } = require("./tokens-fixture");
const { BigNumber } = require("ethers");

const token0Amount = expandTo18Decimals(5);
const token1Amount = expandTo18Decimals(6);
const wethAmount = expandTo18Decimals(10);

const overrides = {gasLimit: 999999};

describe('IndexedUniswapV2Oracle', async () => {
  let oracle;
  let deployer;
  let token0, token1, weth;
  let pair0, pair1;

  before(async () => {
    ({deployer} = await getNamedAccounts());
    await deployments.fixture('Oracles');
    const [signer] = await ethers.getSigners();
    oracle = await ethers.getContract('IndexedUniswapV2Oracle', signer);
    weth = await ethers.getContract('weth', signer);
  });

  let expectedPrice0;
  let expectedPrice1;

  async function addLiquidity0() {
    await token0.getFreeTokens(pair0.address, token0Amount);
    await weth.getFreeTokens(pair0.address, wethAmount);
    const timestamp = await getTransactionTimestamp(pair0.mint(deployer, overrides));
    expectedPrice0 = encodePrice(token0Amount, wethAmount, +timestamp, expectedPrice0);
  }

  async function addLiquidity1() {
    await token1.getFreeTokens(pair1.address, token1Amount);
    await weth.getFreeTokens(pair1.address, wethAmount);
    const timestamp = await getTransactionTimestamp(pair1.mint(deployer, overrides));
    expectedPrice1 = encodePrice(token1Amount, wethAmount, +timestamp, expectedPrice1);
  }

  describe('Restrictions', async () => {
    before(async () => {
      ({
        token0,
        token1,
        pair0,
        pair1
      } = await testTokensFixture());
      expectedPrice0 = undefined;
      expectedPrice1 = undefined;
    });

    it('getPriceInWindow() reverts if there is no price for the window', async () => {
      await expect(
        oracle.getPriceObservationInWindow(token0.address, 0)
      ).to.be.rejectedWith(/IndexedUniswapV2Oracle::getPriceObservationInWindow: No price observed in given hour\./g);
    });

    it('updatePrice() reverts if a pair has no reserves', async () => {
      await expect(oracle.updatePrice(token0.address)).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      );
    });

    it('canUpdatePrice() returns false if a pair has no reserves', async () => {
      const canUpdatePrice = await oracle.canUpdatePrice(token0.address);
      expect(canUpdatePrice).to.be.false;
    });
  
    it('canUpdatePrices() returns false if a pair has no reserves', async () => {
      const canUpdatePrices = await oracle.canUpdatePrices([token0.address, token1.address]);
      expect(canUpdatePrices).to.deep.equal([false, false]);
    });

    it('Does update price once there are reserves', async () => {
      await fastForwardToNextHour();
      await fastForward(0.7 * HOUR);
      await addLiquidity0();
      await addLiquidity1();
      await getTransactionTimestamp(oracle.updatePrices([token0.address, token1.address]));
    });

    it('computeAverageEthForTokens() reverts if array lengths do not match', async () => {
      await expect(
        oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)'](
          [token0.address], [0, 1], 0.5 * HOUR, 2 * HOUR
        )
      ).to.be.rejectedWith(
        /IndexedUniswapV2Oracle::computeAverageEthForTokens: Tokens and amounts have different lengths\./g
      );
    });

    it('computeAverageTokensForEth() reverts if array lengths do not match', async () => {
      await expect(
        oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)'](
          [token0.address], [0, 1], 0.5 * HOUR, 2 * HOUR
        )
      ).to.be.rejectedWith(
        /IndexedUniswapV2Oracle::computeAverageTokensForEth: Tokens and amounts have different lengths\./g
      );
    });

    it('All price queries fail when `minTimeElapsed` has not passed', async () => {
      await expect(oracle.computeTwoWayAveragePrice(token0.address, 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageTokenPrice(token0.address, 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageEthPrice(token0.address, 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);
      await expect(oracle.computeTwoWayAveragePrices([token0.address], 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageTokenPrices([token0.address], 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageEthPrices([token0.address], 0.5 * HOUR, 2 * HOUR)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);
      
      await expect(
        oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](
          token0.address, 0, 0.5 * HOUR, 2 * HOUR)
        ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g
      );
      await expect(
        oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](
          token0.address, 0, 0.5 * HOUR, 2 * HOUR)
        ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g
      );
      await expect(
        oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)'](
          [token0.address], [0], 0.5 * HOUR, 2 * HOUR)
        ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g
      );
      await expect(
        oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)'](
          [token0.address], [0], 0.5 * HOUR, 2 * HOUR)
        ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g
      );
    });

    it('All price queries fail when there are no prices between `minTimeElapsed` and `maxTimeElapsed`', async () => {
      await expect(oracle.computeTwoWayAveragePrice(token0.address, 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageTokenPrice(token0.address, 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageEthPrice(token0.address, 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);
      await expect(oracle.computeTwoWayAveragePrices([token0.address], 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageTokenPrices([token0.address], 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      await expect(oracle.computeAverageEthPrices([token0.address], 0, 1)).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);

      await expect(
        oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token0.address, 0, 0, 1)
      ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      
      await expect(
        oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token0.address, 0, 0, 1)
      ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);
      
      await expect(
        oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)']([token0.address], [0], 0, 1)
      ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range\./g);
      
      await expect(
        oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)']([token0.address], [0], 0, 1)
      ).to.be.rejectedWith(/IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range\./g);
    });

    it('canUpdatePrice() returns false during the same observation window as last update', async () => {
      const canUpdatePrice = await oracle.canUpdatePrice(token0.address);
      expect(canUpdatePrice).to.be.false;
    });
  
    it('canUpdatePrices() returns false during the same observation window as last update', async () => {
      const canUpdatePrices = await oracle.canUpdatePrices([token0.address, token1.address]);
      expect(canUpdatePrices).to.deep.equal([false, false]);
    });

    it('updatePrice() does not update during the same observation window as last update', async () => {
      const wouldUpdatePrice = await oracle.callStatic.updatePrice(token0.address);
      expect(wouldUpdatePrice).to.be.false;
    });

    it('updatePrices() does not update during the same observation window as last update', async () => {
      const wouldUpdatePrices = await oracle.callStatic.updatePrices([token0.address, token1.address]);
      expect(wouldUpdatePrices).to.deep.equal([false, false]);
    });

    it('canUpdatePrice() returns false during the next observation window if <30 min have passed since last update', async () => {
      await fastForwardToNextHour();
      const canUpdatePrice = await oracle.canUpdatePrice(token0.address);
      expect(canUpdatePrice).to.be.false;
    });
  
    it('canUpdatePrices() returns false during the next observation window if <30 min have passed since last update', async () => {
      const canUpdatePrices = await oracle.canUpdatePrices([token0.address, token1.address]);
      expect(canUpdatePrices).to.deep.equal([false, false]);
    });

    it('updatePrice() does not update if <30 min have passed since last update', async () => {
      const wouldUpdatePrice = await oracle.callStatic.updatePrice(token0.address);
      expect(wouldUpdatePrice).to.be.false;
    });

    it('updatePrices() does not update if <30 min have passed since last update', async () => {
      const wouldUpdatePrices = await oracle.callStatic.updatePrices([token0.address, token1.address]);
      expect(wouldUpdatePrices).to.deep.equal([false, false]);
    });

    it('canUpdatePrice() returns true during the next observation window if >=30 min have passed since last update', async () => {
      await fastForward(0.3 * HOUR)
      const canUpdatePrice = await oracle.canUpdatePrice(token0.address);
      expect(canUpdatePrice).to.be.true;
    });
  
    it('canUpdatePrices() returns true during the next observation window if >=30 min have passed since last update', async () => {
      const canUpdatePrices = await oracle.canUpdatePrices([token0.address, token1.address]);
      expect(canUpdatePrices).to.deep.equal([true, true]);
    });

    describe('validMinMax', async () => {
      async function failsMinMax(fnName, ...beginArgs) {
        await expect(
          oracle[fnName](...beginArgs)
        ).to.be.rejectedWith(/IndexedUniswapV2Oracle::validMinMax: Minimum age can not be higher than maximum\./g)
      }

      it('All functions with validMinMax modifier reject invalid min/max values', async () => {
        await failsMinMax('computeTwoWayAveragePrice', token0.address, 2, 1);
        await failsMinMax('computeAverageTokenPrice', token0.address, 2, 1);
        await failsMinMax('computeAverageEthPrice', token0.address, 2, 1);
        await failsMinMax('computeTwoWayAveragePrices', [token0.address], 2, 1);
        await failsMinMax('computeAverageTokenPrices', [token0.address], 2, 1);
        await failsMinMax('computeAverageEthPrices', [token0.address], 2, 1);
        await failsMinMax('computeAverageEthForTokens(address,uint256,uint256,uint256)', token0.address, 0, 2, 1);
        await failsMinMax('computeAverageTokensForEth(address,uint256,uint256,uint256)', token0.address, 0, 2, 1);
        await failsMinMax('computeAverageEthForTokens(address[],uint256[],uint256,uint256)', [token0.address], [0], 2, 1);
        await failsMinMax('computeAverageTokensForEth(address[],uint256[],uint256,uint256)', [token0.address], [0], 2, 1);
      });
    });
  });

  describe('Price Queries', async () => {
    let timestampUpdated;
    before(async () => {
      ({
        token0,
        token1,
        pair0,
        pair1
      } = await testTokensFixture());
      expectedPrice0 = undefined;
      expectedPrice1 = undefined;
    });

    it('updatePrice()', async () => {
      await fastForwardToNextHour();
      await addLiquidity0();
      await addLiquidity1();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, timestamp, expectedPrice1);
      timestampUpdated = timestamp;
    });

    it('hasPriceObservationInWindow()', async () => {
      expect(await oracle.hasPriceObservationInWindow(token0.address, Math.floor(timestampUpdated / 3600))).to.be.true;
      expect(await oracle.hasPriceObservationInWindow(token0.address, 0)).to.be.false;
    });

    it('getPriceObservationInWindow()', async () => {
      const priceObservation = await oracle.getPriceObservationInWindow(token0.address, Math.floor(timestampUpdated / 3600));
      expect(priceObservation.timestamp).to.eq(timestampUpdated);
      expect(priceObservation.priceCumulativeLast.eq(expectedPrice0.tokenPriceCumulativeLast)).to.be.true;
      expect(priceObservation.ethPriceCumulativeLast.eq(expectedPrice0.ethPriceCumulativeLast)).to.be.true;
    });

    it('computeTwoWayAveragePrice()', async () => {
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidity0();
      await addLiquidity1();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      timestampUpdated = timestamp;
      const price0 = await oracle.computeTwoWayAveragePrice(token0.address, 1, 2 * HOUR);
      expect(price0.priceAverage.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price0.ethPriceAverage.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      const price1 = await oracle.computeTwoWayAveragePrice(token1.address, 1, 2 * HOUR);
      expect(price1.priceAverage.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
      expect(price1.ethPriceAverage.eq(expectedPrice1.ethPriceAverage)).to.be.true;
      const priceWeth = await oracle.computeTwoWayAveragePrice(weth.address, 1, 2 * HOUR);
      expect(priceWeth.priceAverage.eq(BigNumber.from(2).pow(112))).to.be.true
      expect(priceWeth.ethPriceAverage.eq(BigNumber.from(2).pow(112))).to.be.true
    });

    it('computeTwoWayAveragePrices()', async () => {
      const [price0, price1, priceWeth] = await oracle.computeTwoWayAveragePrices([token0.address, token1.address, weth.address], 1, 2 * HOUR);
      expect(price0.priceAverage.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price0.ethPriceAverage.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      expect(price1.priceAverage.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
      expect(price1.ethPriceAverage.eq(expectedPrice1.ethPriceAverage)).to.be.true;
      expect(priceWeth.priceAverage.eq(BigNumber.from(2).pow(112))).to.be.true
      expect(priceWeth.ethPriceAverage.eq(BigNumber.from(2).pow(112))).to.be.true
    });

    it('computeAverageTokenPrice()', async () => {
      const price0 = await oracle.computeAverageTokenPrice(token0.address, 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      const price1 = await oracle.computeAverageTokenPrice(token1.address, 1, 2 * HOUR);
      expect(price1._x.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
      const priceWeth = await oracle.computeAverageTokenPrice(weth.address, 1, 2 * HOUR);
      expect(priceWeth._x.eq(BigNumber.from(2).pow(112))).to.be.true;
    });

    it('computeAverageTokenPrices()', async () => {
      const [price0, price1, priceWeth] = await oracle.computeAverageTokenPrices([token0.address, token1.address, weth.address], 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price1._x.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
      expect(priceWeth._x.eq(BigNumber.from(2).pow(112))).to.be.true;
    });

    it('computeAverageEthPrice()', async () => {
      const price0 = await oracle.computeAverageEthPrice(token0.address, 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      const price1 = await oracle.computeAverageEthPrice(token1.address, 1, 2 * HOUR);
      expect(price1._x.eq(expectedPrice1.ethPriceAverage)).to.be.true;
      const priceWeth = await oracle.computeAverageEthPrice(weth.address, 1, 2 * HOUR);
      expect(priceWeth._x.eq(BigNumber.from(2).pow(112))).to.be.true;
    });

    it('computeAverageEthPrices()', async () => {
      const [price0, price1, priceWeth] = await oracle.computeAverageEthPrices([token0.address, token1.address, weth.address], 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      expect(price1._x.eq(expectedPrice1.ethPriceAverage)).to.be.true;
      expect(priceWeth._x.eq(BigNumber.from(2).pow(112))).to.be.true;
    });

    it('computeAverageEthForTokens(address,uint256,uint256,uint256)', async () => {
      const amountToken = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.tokenPriceAverage.mul(amountToken).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.tokenPriceAverage.mul(amountToken).div(BigNumber.from(2).pow(112));
      const tokenValue0 = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](
        token0.address, amountToken, 1, 2 * HOUR
      );
      const tokenValue1 = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](
        token1.address, amountToken, 1, 2 * HOUR
      );
      const tokenValueWeth = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](
        weth.address, amountToken, 1, 2 * HOUR
      );
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
      expect(tokenValueWeth.eq(amountToken)).to.be.true ;
    });

    it('computeAverageEthForTokens(address[],uint256[],uint256,uint256)', async () => {
      const amountToken = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.tokenPriceAverage.mul(amountToken).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.tokenPriceAverage.mul(amountToken).div(BigNumber.from(2).pow(112));
      const [tokenValue0, tokenValue1, tokenValueWeth] = await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)'](
        [token0.address,token1.address, weth.address],
        [amountToken, amountToken, amountToken],
        1,
        2 * HOUR
      );
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
      expect(tokenValueWeth.eq(amountToken)).to.be.true;
    });

    it('computeAverageTokensForEth(address,uint256,uint256,uint256)', async () => {
      const amountWeth = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.ethPriceAverage.mul(amountWeth).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.ethPriceAverage.mul(amountWeth).div(BigNumber.from(2).pow(112));
      const ethValue0 = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](
        token0.address, amountWeth, 1, 2 * HOUR
      );
      const ethValue1 = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](
        token1.address, amountWeth, 1, 2 * HOUR
      );
      const ethValueWeth = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](
        weth.address, amountWeth, 1, 2 * HOUR
      );
      expect(ethValue0.eq(expectedValue0)).to.be.true;
      expect(ethValue1.eq(expectedValue1)).to.be.true;
      expect(ethValueWeth.eq(amountWeth)).to.be.true;
    });

    it('computeAverageTokensForEth(address[],uint256[],uint256,uint256)', async () => {
      const amountWeth = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.ethPriceAverage.mul(amountWeth).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.ethPriceAverage.mul(amountWeth).div(BigNumber.from(2).pow(112));
      const [ethValue0, ethValue1, ethValueWeth] = await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)'](
        [token0.address,token1.address, weth.address],
        [amountWeth, amountWeth, amountWeth],
        1,
        2 * HOUR
      );
      expect(ethValue0.eq(expectedValue0)).to.be.true;
      expect(ethValue1.eq(expectedValue1)).to.be.true;
      expect(ethValueWeth.eq(amountWeth)).to.be.true;
    });

    it('All price queries succeed when there is a price between `minTimeElapsed` and `maxTimeElapsed` in the same observation window', async () => {
      await fastForward(0.2 * HOUR);
      await oracle.computeTwoWayAveragePrice(token0.address, 0, 0.4 * HOUR);
      await oracle.computeAverageTokenPrice(token0.address, 0, 0.4 * HOUR);
      await oracle.computeAverageEthPrice(token0.address, 0, 0.4 * HOUR);
      await oracle.computeTwoWayAveragePrices([token0.address], 0, 0.4 * HOUR);
      await oracle.computeAverageTokenPrices([token0.address], 0, 0.4 * HOUR);
      await oracle.computeAverageEthPrices([token0.address], 0, 0.4 * HOUR);
      await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token0.address, 0, 0, 0.4 * HOUR);
      await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token0.address, 0, 0, 0.4 * HOUR);
      await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)']([token0.address], [0], 0, 0.4 * HOUR);
      await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)']([token0.address], [0], 0, 0.4 * HOUR);
    });

    it('All price queries succeed when there is a price between `minTimeElapsed` and `maxTimeElapsed` which is multiple observation windows old', async () => {
      await fastForwardToNextHour();
      await addLiquidity0();
      await addLiquidity1();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      timestampUpdated = timestamp;
      await fastForward(5 * HOUR);
      await oracle.computeTwoWayAveragePrice(token0.address, 2*HOUR, 10 * HOUR);
      await oracle.computeAverageTokenPrice(token0.address, 2*HOUR, 10 * HOUR);
      await oracle.computeAverageEthPrice(token0.address, 2*HOUR, 10 * HOUR);
      await oracle.computeTwoWayAveragePrices([token0.address], 2*HOUR, 10 * HOUR);
      await oracle.computeAverageTokenPrices([token0.address], 2*HOUR, 10 * HOUR);
      await oracle.computeAverageEthPrices([token0.address], 2*HOUR, 10 * HOUR);
      await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token0.address, 0, 2*HOUR, 10 * HOUR);
      await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token0.address, 0, 2*HOUR, 10 * HOUR);
      await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)']([token0.address], [0], 2*HOUR, 10 * HOUR);
      await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)']([token0.address], [0], 2*HOUR, 10 * HOUR);
    });
  });
});