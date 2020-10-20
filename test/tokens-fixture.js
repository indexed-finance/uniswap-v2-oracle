let i = 0;

const testTokensFixture = deployments.createFixture(async ({
  deployments,
  getNamedAccounts,
  ethers
}) => {
  const [signer] = await ethers.getSigners();
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const token0 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
  const token1 = await MockERC20.deploy(`Token${i++}`, `Token${i}`);
  let pair0, pair1;
  const weth = await ethers.getContract('weth', signer);
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