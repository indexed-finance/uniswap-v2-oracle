module.exports = {
  mocha: {
    enableTimeouts: false,
    timeout: 250000
  },
  skipFiles: [
    'mocks/',
    'examples/',
    'interfaces/',
    'lib/FixedPoint.sol'
  ],
  testFiles: [
    'test/IndexedUniswapV2Oracle.spec.js',
    'test/PriceLibrary.spec.js',
    'test/ExampleMapIndex.spec.js'
  ]
}