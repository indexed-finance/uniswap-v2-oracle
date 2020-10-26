const { BigNumber } = require("ethers");

let i = 0;

const testTokensFixture = deployments.createFixture(async ({
  deployments,
  getNamedAccounts,
  ethers
}) => {
  const [signer] = await ethers.getSigners();
  const weth = await ethers.getContract('weth', signer);
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  let token0 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
  let token1 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
  let wethBN = BigNumber.from(weth.address);
  let token0BN = BigNumber.from(token0.address);
  let token1BN = BigNumber.from(token1.address);
  // Coverage of case in observeTwoWayPrice where token is greater than weth
  while (token0BN.gt(wethBN)) {
    token0 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
    token0BN = BigNumber.from(token0.address);
  }
  // Coverage of case in observeTwoWayPrice where token is greater than weth
  while (wethBN.gt(token1BN)) {
    token1 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
    token1BN = BigNumber.from(token1.address);
  }
  let pair0, pair1;
  const uniswapFactory = await ethers.getContract('UniswapV2Factory', signer);

  await uniswapFactory.createPair(token0.address, weth.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    pair0 = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  });

  await uniswapFactory.createPair(token1.address, weth.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    pair1 = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  });

  return {
    token0,
    token1,
    pair0,
    pair1
  };
});

module.exports = {testTokensFixture};