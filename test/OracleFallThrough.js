const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;
const bre = require('@nomiclabs/buidler');
const { expandTo18Decimals, fastForwardToNextHour, encodePrice, getTransactionTimestamp, fastForward, HOUR, convertMaticPriceToEthPrice, Q112 } = require('./utils');
const { fallThroughFixture } = require('./fallthrough-fixture');
const { BigNumber } = require("ethers");
const { formatEther } = require("@ethersproject/units");

const token0Amount = expandTo18Decimals(5);
const token1Amount = expandTo18Decimals(6);
const wethAmount = expandTo18Decimals(10);
const wmaticAmount = expandTo18Decimals(1)

const overrides = {gasLimit: 999999};

const maxErrorDelta = 1e-8;

const calcRelativeDiff = (a, b) => {
  const [numer, denom] = a.gt(b) ? [b, a] : [a, b];
  const fraction = numer.mul(expandTo18Decimals(1)).div(denom);
  return 1 - parseFloat(formatEther(fraction));
}

describe('OracleFallthrough', async () => {
  let oracle;
  let owner, notOwner;
  let token0, token1, weth, wmatic;
  let ethPair, wmaticPair, wethMaticPair;
  let wethOracle, wmaticOracle;

  let expectedPrice0;
  let expectedPrice1;
  let expectedPriceMatic;
  let timestampUpdated;

  async function setup() {
    ({weth, wmatic, token0, token1, ethPair, wmaticPair, wethMaticPair} = await fallThroughFixture());
    expectedPrice0 = undefined;
    expectedPrice1 = undefined;
    expectedPriceMatic = undefined;
    await oracle.setUseMaticMultiple([token0.address, token1.address], [false, false])
  }

  async function addLiquidity0() {
    await token0.getFreeTokens(ethPair.address, token0Amount);
    await weth.getFreeTokens(ethPair.address, wethAmount);
    const timestamp = await getTransactionTimestamp(ethPair.mint(owner._address, overrides));
    expectedPrice0 = encodePrice(token0Amount, wethAmount, +timestamp, expectedPrice0);
  }

  async function addLiquidity1() {
    await token1.getFreeTokens(wmaticPair.address, token1Amount);
    await wmatic.getFreeTokens(wmaticPair.address, wmaticAmount);
    const timestamp = await getTransactionTimestamp(wmaticPair.mint(owner._address, overrides));
    expectedPrice1 = encodePrice(token1Amount, wmaticAmount, +timestamp, expectedPrice1);
  }

  async function addMaticLiquidity() {
    await weth.getFreeTokens(wethMaticPair.address, wethAmount);
    await wmatic.getFreeTokens(wethMaticPair.address, wmaticAmount);
    const timestamp = await getTransactionTimestamp(wethMaticPair.mint(owner._address, overrides));
    expectedPriceMatic = encodePrice(wmaticAmount, wethAmount, +timestamp, expectedPriceMatic);
  }

  async function addLiquidityAll() {
    await addLiquidity0();
    await addLiquidity1();
    await addMaticLiquidity();
  }

  async function updatePrices() {
    await oracle.setUseMatic(token1.address, true)
    await fastForwardToNextHour();
    await addLiquidityAll();
    const timestamp = await getTransactionTimestamp(
      oracle.updatePrices([token0.address, token1.address])
    );
    expectedPrice0 = encodePrice(0, 0, timestamp, expectedPrice0);
    expectedPrice1 = encodePrice(0, 0, timestamp, expectedPrice1);
    expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
    timestampUpdated = timestamp;
  }

  before(async () => {
    const [signer] = await ethers.getSigners();
    ([owner, notOwner] = await ethers.getSigners());
    await deployments.fixture('Quickswap');
    oracle = await ethers.getContract('OracleFallthrough', owner);
    wethOracle = await ethers.getContract('wethOracle', signer);
    wmaticOracle = await ethers.getContract('wmaticOracle', signer);
  });

  describe('setUseMatic', () => {
    before(async () => { await setup(); })

    it('Should fail if caller not owner', async () => {
      await expect(oracle.connect(notOwner).setUseMatic(token0.address, true)).to.be.rejectedWith(/Ownable: caller is not the owner/g);
    })

    it('Should mark token for use with matic', async () => {
      await oracle.setUseMatic(token0.address, true);
      expect(await oracle.useMatic(token0.address)).to.be.true;
    })

    it('Should revert if token is weth or matic', async () => {
      await expect(
        oracle.setUseMatic(weth.address, true)
      ).to.be.rejectedWith(/OracleFallthrough::setUseMatic: Can not set useMatic for weth or matic/g);
      await expect(
        oracle.setUseMatic(wmatic.address, true)
      ).to.be.rejectedWith(/OracleFallthrough::setUseMatic: Can not set useMatic for weth or matic/g);
    })
  })

  describe('setUseMaticMultiple', () => {
    before(async () => { await setup(); })

    it('Should fail if caller not owner', async () => {
      await expect(
        oracle.connect(notOwner).setUseMaticMultiple([token0.address], [true])
      ).to.be.rejectedWith(/Ownable: caller is not the owner/g);
    })

    it('Should revert is array lengths do not match', async () => {
      await expect(
        oracle.setUseMaticMultiple([token0.address], [true, false])
      ).to.be.rejectedWith(/OracleFallthrough::setUseMaticMultiple: Array lengths do not match/g)
    })

    it('Should mark tokens for use with matic', async () => {
      await oracle.setUseMaticMultiple([token0.address, token1.address], [true, true]);
      expect(await oracle.useMatic(token0.address)).to.be.true;
      expect(await oracle.useMatic(token1.address)).to.be.true;
    })

    it('Should revert if token is weth or matic', async () => {
      await expect(
        oracle.setUseMaticMultiple([weth.address], [true])
      ).to.be.rejectedWith(/OracleFallthrough::setUseMatic: Can not set useMatic for weth or matic/g);
      await expect(
        oracle.setUseMaticMultiple([wmatic.address], [true])
      ).to.be.rejectedWith(/OracleFallthrough::setUseMatic: Can not set useMatic for weth or matic/g);
    })
  })

  describe('updatePrice', () => {
    before(async () => { await setup(); })

    it('Reverts if weth pair has no liquidity and useMatic false', async () => {
      await expect(oracle.updatePrice(token0.address)).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      )
    })

    it('Reverts if wmatic pair has no liquidity and useMatic true', async () => {
      await oracle.setUseMatic(token1.address, true);
      await expect(oracle.updatePrice(token1.address)).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      )
    })

    it('Reverts if weth-wmatic pair has no liquidity and useMatic true', async () => {
      await addLiquidity1();
      await expect(oracle.updatePrice(token1.address)).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      )
    })

    it('Updates price on weth pair if useMatic is false', async () => {
      await addLiquidity0();
      await oracle.updatePrice(token0.address);
      expect(await wethOracle.canUpdatePrice(token0.address)).to.be.false;
    })

    it('Updates price on wmatic pair and weth-matic pair if useMatic is true', async () => {
      await addMaticLiquidity();
      await oracle.updatePrice(token1.address);
      expect(await wmaticOracle.canUpdatePrice(token1.address)).to.be.false;
      expect(await wethOracle.canUpdatePrice(wmatic.address)).to.be.false;
    })
  })

  describe('updatePrices()', () => {
    before(async () => {
      await setup();
      await fastForward(HOUR * 2);
    })

    it('Reverts if any token pair has no liquidity', async () => {
      await expect(oracle.updatePrices([token0.address])).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      )
      await oracle.setUseMatic(token1.address, true);
      await addLiquidity0();
      await addLiquidity1();
      await expect(oracle.updatePrices([token0.address, token1.address])).to.be.rejectedWith(
        /UniswapV2OracleLibrary::currentCumulativePrices: Pair has no reserves./g
      );
    })

    it('Does not update wmatic if no tokens have useMatic true', async () => {
      await addMaticLiquidity();
      await oracle.updatePrices([token0.address]);
      expect(await wethOracle.canUpdatePrice(wmatic.address)).to.be.true;
    })

    it('Uses wethOracle for tokens with useMatic false and wmaticOracle for tokens with useMatic true, and updates wmatic price if useMatic true', async () => {
      await oracle.updatePrices([token0.address, token1.address])
      expect(await wethOracle.canUpdatePrice(token0.address)).to.be.false;
      expect(await wmaticOracle.canUpdatePrice(token1.address)).to.be.false;
      expect(await wethOracle.canUpdatePrice(wmatic.address)).to.be.false;
    })
  })

  describe('computeTwoWayAveragePrice', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to eth oracle for tokens with useMatic false', async () => {
      const price0 = await oracle.computeTwoWayAveragePrice(token0.address, 1, 2 * HOUR);
      expect(price0.priceAverage.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price0.ethPriceAverage.eq(expectedPrice0.ethPriceAverage)).to.be.true;
    })

    it('Delegates to matic oracle for tokens with useMatic true and converts using matic price', async () => {
      const price1 = await oracle.computeTwoWayAveragePrice(token1.address, 1, 2 * HOUR);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1.priceAverage.eq(expectedPrice.tokenPriceAverage)).to.be.true;
      expect(price1.ethPriceAverage.eq(expectedPrice.ethPriceAverage)).to.be.true;
    })
  })

  describe('computeTwoWayAveragePrices', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to correct oracle per token and converts if necessary', async () => {
      const [price0, price1] = await oracle.computeTwoWayAveragePrices([token0.address, token1.address], 1, 2 * HOUR);
      expect(price0.priceAverage.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price0.ethPriceAverage.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1.priceAverage.eq(expectedPrice.tokenPriceAverage)).to.be.true;
      expect(price1.ethPriceAverage.eq(expectedPrice.ethPriceAverage)).to.be.true;
    })

    it('Should return 1 if token is weth', async () => {
      const [price] = await oracle.computeTwoWayAveragePrices([weth.address], 1, 2 * HOUR);
      expect(price.priceAverage.eq(Q112)).to.be.true;
      expect(price.ethPriceAverage.eq(Q112)).to.be.true;
    })
  })

  describe('computeAverageTokenPrice', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to eth oracle for tokens with useMatic false', async () => {
      const price0 = await oracle.computeAverageTokenPrice(token0.address, 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
    })

    it('Delegates to matic oracle for tokens with useMatic true and converts using matic price', async () => {
      const price1 = await oracle.computeAverageTokenPrice(token1.address, 1, 2 * HOUR);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1._x.eq(expectedPrice.tokenPriceAverage)).to.be.true;
    })

    it('Should return 1 if token is weth', async () => {
      const price = await oracle.computeAverageTokenPrice(weth.address, 1, 2 * HOUR);
      expect(price._x.eq(Q112)).to.be.true;
    })
  })

  describe('computeAverageTokenPrices', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to correct oracle per token and converts if necessary', async () => {
      const [price0, price1] = await oracle.computeAverageTokenPrices([token0.address, token1.address], 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1._x.eq(expectedPrice.tokenPriceAverage)).to.be.true;
    })

    it('Should return 1 if token is weth', async () => {
      const [price] = await oracle.computeAverageTokenPrices([weth.address], 1, 2 * HOUR);
      expect(price._x.eq(Q112)).to.be.true;
    })
  })

  describe('computeAverageEthPrice', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to eth oracle for tokens with useMatic false', async () => {
      const price0 = await oracle.computeAverageEthPrice(token0.address, 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;
    })

    it('Delegates to matic oracle for tokens with useMatic true and converts using matic price', async () => {
      const price1 = await oracle.computeAverageEthPrice(token1.address, 1, 2 * HOUR);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1._x.eq(expectedPrice.ethPriceAverage)).to.be.true;
    })

    it('Should return 1 if token is weth', async () => {
      const price = await oracle.computeAverageEthPrice(weth.address, 1, 2 * HOUR);
      expect(price._x.eq(Q112)).to.be.true;
    })
  })

  describe('computeAverageEthPrices', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Delegates to correct oracle per token and converts if necessary', async () => {
      const [price0, price1] = await oracle.computeAverageEthPrices([token0.address, token1.address], 1, 2 * HOUR);
      expect(price0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      expect(price1._x.eq(expectedPrice.ethPriceAverage)).to.be.true;
    })

    it('Should return 1 if token is weth', async () => {
      const [price] = await oracle.computeAverageEthPrices([weth.address], 1, 2 * HOUR);
      expect(price._x.eq(Q112)).to.be.true;
    })
  })

  describe('computeAverageEthForTokens(address,uint256,uint256,uint256)', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Should delegate to eth oracle if useMatic false', async () => {
      const amountToken = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.tokenPriceAverage.mul(amountToken).div(Q112);
      const tokenValue0 = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token0.address, amountToken, 1, 2 * HOUR);
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
    })

    it('Should do conversion if useMatic true', async () => {
      const amountToken = expandTo18Decimals(10);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      const expectedValue1 = expectedPrice.tokenPriceAverage.mul(amountToken).div(Q112);
      const tokenValue1 = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token1.address, amountToken, 1, 2 * HOUR);
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
    })

    it('Conversion should give same result as using both oracles', async () => {
      const amountToken = expandTo18Decimals(10);
      const tokenValue1 = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token1.address, amountToken, 1, 2 * HOUR);
      const maticAmount = await wmaticOracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token1.address, amountToken, 1, 2 * HOUR);
      const ethAmount = await wethOracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](wmatic.address, maticAmount, 1, 2 * HOUR);
      expect(calcRelativeDiff(tokenValue1, ethAmount)).to.be.lte(maxErrorDelta)
    })

    it('Should return input amount if token is eth', async () => {
      const amountToken = expandTo18Decimals(10);
      const tokenValue = await oracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](weth.address, amountToken, 1, 2 * HOUR);
      expect(tokenValue.eq(amountToken)).to.be.true;
    })
  })

  describe('computeAverageEthForTokens(address[],uint256[],uint256,uint256)', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Should use correct oracle and do conversion if necessary', async () => {
      const amountToken = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.tokenPriceAverage.mul(amountToken).div(Q112);
      const [tokenValue0, tokenValue1] = await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)'](
        [token0.address, token1.address], [amountToken, amountToken], 1, 2 * HOUR
      );
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      const expectedValue1 = expectedPrice.tokenPriceAverage.mul(amountToken).div(Q112);
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
    })

    it('Conversion should give same result as using both oracles', async () => {
      const amountToken = expandTo18Decimals(10);
      const [tokenValue1] = await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)']([token1.address], [amountToken], 1, 2 * HOUR);
      const maticAmount = await wmaticOracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](token1.address, amountToken, 1, 2 * HOUR);
      const ethAmount = await wethOracle['computeAverageEthForTokens(address,uint256,uint256,uint256)'](wmatic.address, maticAmount, 1, 2 * HOUR);
      expect(calcRelativeDiff(tokenValue1, ethAmount)).to.be.lte(maxErrorDelta)
    })

    it('Should return input amount if token is eth', async () => {
      const amountToken = expandTo18Decimals(10);
      const [tokenValue] = await oracle['computeAverageEthForTokens(address[],uint256[],uint256,uint256)']([weth.address], [amountToken], 1, 2 * HOUR);
      expect(tokenValue.eq(amountToken)).to.be.true;
    })
  })

  describe('computeAverageTokensForEth(address,uint256,uint256,uint256)', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Should delegate to eth oracle if useMatic false', async () => {
      const amountETH = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.ethPriceAverage.mul(amountETH).div(Q112);
      const tokenValue0 = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token0.address, amountETH, 1, 2 * HOUR);
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
    })

    it('Should do conversion if useMatic true', async () => {
      const amountETH = expandTo18Decimals(10);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      const expectedValue1 = expectedPrice.ethPriceAverage.mul(amountETH).div(Q112);
      const tokenValue1 = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token1.address, amountETH, 1, 2 * HOUR);
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
    })

    it('Conversion should give same result as using both oracles', async () => {
      const amountETH = expandTo18Decimals(10);
      const tokenValue1 = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token1.address, amountETH, 1, 2 * HOUR);
      const maticAmount = await wethOracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](wmatic.address, amountETH, 1, 2 * HOUR);
      const tokenAmount = await wmaticOracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token1.address, maticAmount, 1, 2 * HOUR);
      expect(calcRelativeDiff(tokenValue1, tokenAmount)).to.be.lte(maxErrorDelta)
    })

    it('Should return input amount if token is eth', async () => {
      const amountETH = expandTo18Decimals(10);
      const tokenValue = await oracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](weth.address, amountETH, 1, 2 * HOUR);
      expect(tokenValue.eq(amountETH)).to.be.true;
    })
  })

  describe('computeAverageTokensForEth(address[],uint256[],uint256,uint256)', () => {
    before(async () => {
      await setup();
      await updatePrices();
      await fastForwardToNextHour();
      await fastForward(0.3 * HOUR)
      await addLiquidityAll();
      const timestamp = await getTransactionTimestamp(
        oracle.updatePrices([token0.address, token1.address])
      );
      expectedPrice0 = encodePrice(0, 0, +timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, +timestamp, expectedPrice1);
      expectedPriceMatic = encodePrice(0, 0, +timestamp, expectedPriceMatic);
      timestampUpdated = timestamp;
    })

    it('Should use correct oracle and do conversion if necessary', async () => {
      const amountETH = expandTo18Decimals(10);
      const expectedValue0 = expectedPrice0.ethPriceAverage.mul(amountETH).div(Q112);
      const expectedPrice = convertMaticPriceToEthPrice(expectedPrice1, expectedPriceMatic);
      const expectedValue1 = expectedPrice.ethPriceAverage.mul(amountETH).div(Q112);
      const [tokenValue0, tokenValue1] = await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)'](
        [token0.address, token1.address], [amountETH, amountETH], 1, 2 * HOUR
      );
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
    })

    it('Conversion should give same result as using both oracles', async () => {
      const amountETH = expandTo18Decimals(10);
      const [tokenValue1] = await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)']([token1.address], [amountETH], 1, 2 * HOUR);
      const maticAmount = await wethOracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](wmatic.address, amountETH, 1, 2 * HOUR);
      const tokenAmount = await wmaticOracle['computeAverageTokensForEth(address,uint256,uint256,uint256)'](token1.address, maticAmount, 1, 2 * HOUR);
      expect(calcRelativeDiff(tokenValue1, tokenAmount)).to.be.lte(maxErrorDelta)
    })

    it('Should return input amount if token is eth', async () => {
      const amountETH = expandTo18Decimals(10);
      const [tokenValue] = await oracle['computeAverageTokensForEth(address[],uint256[],uint256,uint256)']([weth.address], [amountETH], 1, 2 * HOUR);
      expect(tokenValue.eq(amountETH)).to.be.true;
    })
  })

/*   describe('updatePrice', () => {})

  describe('updatePrices', () => {})

  describe('canUpdatePrice', () => {})

  describe('canUpdatePrices', () => {})

  describe('computeTwoWayAveragePrice', () => {})

  describe('computeAverageTokenPrice', () => {})

  describe('computeAverageEthPrice', () => {})

  describe('computeTwoWayAveragePrices', () => {})

  describe('computeAverageTokenPrices', () => {})

  describe('computeAverageEthPrices', () => {})

  describe('computeAverageEthForTokens', () => {}) */

});