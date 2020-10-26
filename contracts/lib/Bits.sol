// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

/************************************************************************************************
From https://github.com/ethereum/solidity-examples/blob/master/src/bits/Bits.sol

This source code has been modified from the original, which was copied from the github repository
at commit hash 09b36edcf8213de74ac47092961c1e3d2628dd09.

Modifications:
Removed:
- `ONES` constant
- `toggleBit` function
- `bit` function
- `bitEqual` function
- `bitNot` function
- `bitAnd` function
- `bitOr` function
- `bitXor` function
- `bits` function
Added:
- `nextLowestBitSet` function
- `nextHighestBitSet` function
- Error messages for `highestBitSet` and `lowestBitSet`

Subject to the MIT license
*************************************************************************************************/


library Bits {
  uint256 internal constant ONE = uint256(1);

  // Sets the bit at the given 'index' in 'self' to '1'.
  // Returns the modified value.
  function setBit(uint256 self, uint256 index) internal pure returns (uint256) {
    return self | (ONE << index);
  }

  // Check if the bit at the given 'index' in 'self' is set.
  // Returns:
  //  'true' - if the value of the bit is '1'
  //  'false' - if the value of the bit is '0'
  function bitSet(uint256 self, uint256 index) internal pure returns (bool) {
    return (self >> index) & 1 == 1;
  }

  // Computes the index of the highest bit set in 'self'.
  // Requires that 'self != 0'.
  function highestBitSet(uint256 self) internal pure returns (uint256 highest) {
    require(self != 0, "Bits::highestBitSet: Value 0 has no bits set");
    uint256 val = self;
    for (uint256 i = 128; i >= 1; i >>= 1) {
      if (val & (((ONE << i) - 1) << i) != 0) {
        highest += i;
        val >>= i;
      }
    }
  }

  // Computes the index of the lowest bit set in 'self'.
  // Requires that 'self != 0'.
  function lowestBitSet(uint256 self) internal pure returns (uint256 lowest) {
    require(self != 0, "Bits::lowestBitSet: Value 0 has no bits set");
    uint256 val = self;
    for (uint256 i = 128; i >= 1; i >>= 1) {
      if (val & ((ONE << i) - 1) == 0) {
        lowest += i;
        val >>= i;
      }
    }
  }

  function nextLowestBitSet(uint256 self, uint256 bit)
    internal
    pure
    returns (bool haveValueBefore, uint256 previousBit)
  {
    uint256 val = self << (256 - bit);
    if (val == 0) {
      return (false, 0);
    }
    return (true, (highestBitSet(val) - (256 - bit)));
  }

  function nextHighestBitSet(uint256 self, uint256 bit)
    internal
    pure
    returns (bool haveValueAfter, uint256 nextBit)
  {
    uint256 val = self >> (bit + 1);
    if (val == 0) {
      return (false, 0);
    }
    return (true, lowestBitSet(val) + (bit + 1));
  }
}
