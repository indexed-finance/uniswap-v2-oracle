const { BigNumber } = require("ethers");

const toBN = (bn) => BigNumber.from(bn);
const oneToken = toBN(10).pow(18); // 10 ** decimals
const nTokens = (amount) => oneToken.mul(amount);
const toHex = (bn) => bn.toHexString();
const nTokensHex = (amount) => toHex(nTokens(amount));

module.exports = {
  toBN,
  oneToken,
  nTokens,
  toHex,
  nTokensHex
};