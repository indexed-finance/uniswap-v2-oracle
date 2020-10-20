const chai = require("chai");
chai.use(require('chai-as-promised'))
const { expect } = chai;

describe('TestErrorTriggers', async () => {
  let test;
  before(async () => {
    const TestErrorTriggers = await ethers .getContractFactory('TestErrorTriggers');
    test = await TestErrorTriggers.deploy();
  });

  it('UniswapV2Library.sortTokens() fails if the tokens are the same', async () => {
    await expect(test.triggerUniswapLibrarySameTokenError()).to.be.rejectedWith(/UniswapV2Library: IDENTICAL_ADDRESSES/g);
  });

  it('UniswapV2Library.sortTokens() fails if null address is given', async () => {
    await expect(test.triggerUniswapLibraryNullTokenError()).to.be.rejectedWith(/UniswapV2Library: ZERO_ADDRESS/g);
  });

  it('Bits.highestBitSet() fails if zero is given', async () => {
    await expect(test.triggerHighestBitError()).to.be.rejectedWith(/Bits::highestBitSet: Value 0 has no bits set/g);
  });

  it('Bits.lowestBitSet() fails if zero is given', async () => {
    await expect(test.triggerLowestBitError()).to.be.rejectedWith(/Bits::lowestBitSet: Value 0 has no bits set/g);
  });
});