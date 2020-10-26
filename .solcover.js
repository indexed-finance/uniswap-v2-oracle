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
  ]
}