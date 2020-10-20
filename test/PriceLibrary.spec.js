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

const noReservesRegex = () => /UniswapV2OracleLibrary::currentCumulativePrice.: Pair has no reserves\./g

describe('PriceLibrary', async () => {
  let library;
  let deployer;
  let token0, token1, weth;
  let pair0, pair1;

  before(async () => {
    ({deployer} = await getNamedAccounts());
    await deployments.fixture('Oracles');
    const [signer] = await ethers.getSigners();
    const TestPriceLibrary = await ethers.getContractFactory('TestPriceLibrary', signer);
    weth = await ethers.getContract('weth', signer);
    library = await TestPriceLibrary.deploy(
      (await deployments.get('UniswapV2Factory')).address,
      weth.address
    );
    ({token0, token1, pair0, pair1} = await testTokensFixture());
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

  describe('Before pairs have reserves', async () => {
    it('pairInitialized() returns false', async () => {
      expect(await library.pairInitialized(token0.address, weth.address)).to.be.false;
      expect(await library.pairInitialized(token1.address, weth.address)).to.be.false;
    });

    it('observePrice() reverts', async () => {
      await expect(library.observePrice(token0.address, weth.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observePrice(token1.address, weth.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observePrice(weth.address, token0.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observePrice(weth.address, token1.address)).to.be.rejectedWith(noReservesRegex());
    });

    it('observeTwoWayPrice() reverts', async () => {
      await expect(library.observeTwoWayPrice(token0.address, weth.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observeTwoWayPrice(token1.address, weth.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observeTwoWayPrice(weth.address, token0.address)).to.be.rejectedWith(noReservesRegex());
      await expect(library.observeTwoWayPrice(weth.address, token1.address)).to.be.rejectedWith(noReservesRegex());
    });
  });

  describe('After pairs have reserves', async () => {
    it('pairInitialized() returns true', async () => {
      await addLiquidity0();
      await addLiquidity1();
      const timestamp = await bre.run('getTimestamp');
      expectedPrice0 = encodePrice(0, 0, timestamp, expectedPrice0);
      expectedPrice1 = encodePrice(0, 0, timestamp, expectedPrice1);
      expect(await library.pairInitialized(token0.address, weth.address)).to.be.true;
      expect(await library.pairInitialized(token1.address, weth.address)).to.be.true;
    });

    it('observePrice() succeeds and returns correct values', async () => {
      const tokenPriceObservation0 = await library.observePrice(token0.address, weth.address);
      const tokenPriceObservation1 = await library.observePrice(token1.address, weth.address);
      const ethPriceObservation0 = await library.observePrice(weth.address, token0.address);
      const ethPriceObservation1 = await library.observePrice(weth.address, token1.address);
      expect(tokenPriceObservation0.timestamp).to.eq(expectedPrice0.blockTimestamp);
      expect(tokenPriceObservation1.timestamp).to.eq(expectedPrice1.blockTimestamp);
      expect(ethPriceObservation0.timestamp).to.eq(expectedPrice0.blockTimestamp);
      expect(ethPriceObservation1.timestamp).to.eq(expectedPrice1.blockTimestamp);
      expect(tokenPriceObservation0.priceCumulativeLast).to.eq(expectedPrice0.tokenPriceCumulativeLast);
      expect(tokenPriceObservation1.priceCumulativeLast).to.eq(expectedPrice1.tokenPriceCumulativeLast);
      expect(ethPriceObservation0.priceCumulativeLast).to.eq(expectedPrice0.ethPriceCumulativeLast);
      expect(ethPriceObservation1.priceCumulativeLast).to.eq(expectedPrice1.ethPriceCumulativeLast);
    });

    it('observeTwoWayPrice() succeeds and returns correct values', async () => {
      const priceObservation0 = await library.observeTwoWayPrice(token0.address, weth.address);
      const priceObservation1 = await library.observeTwoWayPrice(token1.address, weth.address);
      expect(priceObservation0.timestamp).to.eq(expectedPrice0.blockTimestamp);
      expect(priceObservation1.timestamp).to.eq(expectedPrice1.blockTimestamp);
      expect(priceObservation0.priceCumulativeLast).to.eq(expectedPrice0.tokenPriceCumulativeLast);
      expect(priceObservation1.priceCumulativeLast).to.eq(expectedPrice1.tokenPriceCumulativeLast);
      expect(priceObservation0.ethPriceCumulativeLast).to.eq(expectedPrice0.ethPriceCumulativeLast);
      expect(priceObservation1.ethPriceCumulativeLast).to.eq(expectedPrice1.ethPriceCumulativeLast);
    });
  });

  describe('Utility functions', async () => {
    const copyPrice = ({
      tokenPriceCumulativeLast,
      ethPriceCumulativeLast,
      blockTimestamp,
      tokenPriceAverage,
      ethPriceAverage
    }) => {
      const full = {
        observation: {
          timestamp: blockTimestamp,
          priceCumulativeLast: BigNumber.from(tokenPriceCumulativeLast),
          ethPriceCumulativeLast: BigNumber.from(ethPriceCumulativeLast)
        },
        twoWayPrice: {
          priceAverage: BigNumber.from(tokenPriceAverage || 0),
          ethPriceAverage: BigNumber.from(ethPriceAverage || 0),
        }
      };
      return full;
    };

    let oldPrice0, newPrice0;
    let oldPrice1, newPrice1;

    before(async () => {
      oldPrice0 = copyPrice(expectedPrice0);
      oldPrice1 = copyPrice(expectedPrice1);
      await addLiquidity0();
      await addLiquidity1();
      newPrice0 = copyPrice(expectedPrice0);
      newPrice1 = copyPrice(expectedPrice1);
    });

    it('computeTwoWayAveragePrice() returns correct values', async () => {
      const price0 = await library.computeTwoWayAveragePrice(oldPrice0.observation, newPrice0.observation);
      expect(price0.priceAverage.eq(expectedPrice0.tokenPriceAverage)).to.be.true;
      expect(price0.ethPriceAverage.eq(expectedPrice0.ethPriceAverage)).to.be.true;

      const price1 = await library.computeTwoWayAveragePrice(oldPrice1.observation, newPrice1.observation);
      expect(price1.priceAverage.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
      expect(price1.ethPriceAverage.eq(expectedPrice1.ethPriceAverage)).to.be.true;
    });

    it('computeAveragePrice() returns correct values', async () => {
      const tokenPrice0 = await library.computeAveragePrice(
        oldPrice0.observation.timestamp,
        oldPrice0.observation.priceCumulativeLast,
        newPrice0.observation.timestamp,
        newPrice0.observation.priceCumulativeLast
      );
      expect(tokenPrice0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;

      const ethPrice0 = await library.computeAveragePrice(
        oldPrice0.observation.timestamp,
        oldPrice0.observation.ethPriceCumulativeLast,
        newPrice0.observation.timestamp,
        newPrice0.observation.ethPriceCumulativeLast
      );
      expect(ethPrice0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;

      const tokenPrice1 = await library.computeAveragePrice(
        oldPrice1.observation.timestamp,
        oldPrice1.observation.priceCumulativeLast,
        newPrice1.observation.timestamp,
        newPrice1.observation.priceCumulativeLast
      );
      expect(tokenPrice1._x.eq(expectedPrice1.tokenPriceAverage)).to.be.true;

      const ethPrice1 = await library.computeAveragePrice(
        oldPrice1.observation.timestamp,
        oldPrice1.observation.ethPriceCumulativeLast,
        newPrice1.observation.timestamp,
        newPrice1.observation.ethPriceCumulativeLast
      );
      expect(ethPrice1._x.eq(expectedPrice1.ethPriceAverage)).to.be.true;
    });

    it('computeAverageTokenPrice() returns correct values', async () => {
      const tokenPrice0 = await library.computeAverageTokenPrice(oldPrice0.observation, newPrice0.observation);
      expect(tokenPrice0._x.eq(expectedPrice0.tokenPriceAverage)).to.be.true;

      const tokenPrice1 = await library.computeAverageTokenPrice(oldPrice1.observation, newPrice1.observation);
      expect(tokenPrice1._x.eq(expectedPrice1.tokenPriceAverage)).to.be.true;
    });

    it('computeAverageEthPrice() returns correct values', async () => {
      const ethPrice0 = await library.computeAverageEthPrice(oldPrice0.observation, newPrice0.observation);
      expect(ethPrice0._x.eq(expectedPrice0.ethPriceAverage)).to.be.true;

      const ethPrice1 = await library.computeAverageEthPrice(oldPrice1.observation, newPrice1.observation);
      expect(ethPrice1._x.eq(expectedPrice1.ethPriceAverage)).to.be.true;
    });

    it('computeAverageEthForTokens() returns correct values', async () => {
      const tokenAmount = expandTo18Decimals(100);
      const expectedValue0 = expectedPrice0.tokenPriceAverage.mul(tokenAmount).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.tokenPriceAverage.mul(tokenAmount).div(BigNumber.from(2).pow(112));
      const tokenValue0 = await library.computeAverageEthForTokens(newPrice0.twoWayPrice, tokenAmount);
      const tokenValue1 = await library.computeAverageEthForTokens(newPrice1.twoWayPrice, tokenAmount);
      expect(tokenValue0.eq(expectedValue0)).to.be.true;
      expect(tokenValue1.eq(expectedValue1)).to.be.true;
    });

    it('computeAverageTokensForEth() returns correct values', async () => {
      const wethAmount = expandTo18Decimals(100);
      const expectedValue0 = expectedPrice0.ethPriceAverage.mul(wethAmount).div(BigNumber.from(2).pow(112));
      const expectedValue1 = expectedPrice1.ethPriceAverage.mul(wethAmount).div(BigNumber.from(2).pow(112));
      const ethValue0 = await library.computeAverageTokensForEth(newPrice0.twoWayPrice, wethAmount);
      const ethValue1 = await library.computeAverageTokensForEth(newPrice1.twoWayPrice, wethAmount);
      expect(ethValue0.eq(expectedValue0)).to.be.true;
      expect(ethValue1.eq(expectedValue1)).to.be.true;
    });
  });
});