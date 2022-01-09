const { BigNumber } = require("ethers");

let i = 0;

const fallThroughFixture = deployments.createFixture(async ({
  deployments,
  getNamedAccounts,
  ethers
}) => {
  const [signer] = await ethers.getSigners();
  const weth = await ethers.getContract('weth', signer);
  const wmatic = await ethers.getContract('wmatic', signer);
  const MockERC20 = await ethers.getContractFactory('MockERC20');

  let token0 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
  let token1 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);

  let ethPair, /* ethPair1, */ wmaticPair,/*  wmaticPair1, */ wethMaticPair;
  const uniswapFactory = await ethers.getContract('UniswapV2Factory', signer);

  await uniswapFactory.createPair(token0.address, weth.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    ethPair = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  });

  // await uniswapFactory.createPair(token1.address, weth.address).then(tx => tx.wait()).then(async ({ events }) => {
  //   const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
  //   ethPair1 = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  // });

  await uniswapFactory.createPair(token1.address, wmatic.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    wmaticPair = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  });

/*   await uniswapFactory.createPair(token1.address, wmatic.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    wmaticPair1 = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  }); */

  await uniswapFactory.createPair(wmatic.address, weth.address).then(tx => tx.wait()).then(async ({ events }) => {
    const { args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0];
    wethMaticPair = await ethers.getContractAt('IUniswapV2Pair', pairAddress, signer);
  });


  return {
    weth,
    wmatic,
    token0,
    token1,
    ethPair,
    // ethPair1,
    wmaticPair,
    // wmaticPair1,
    wethMaticPair
  };
});

module.exports = {fallThroughFixture};