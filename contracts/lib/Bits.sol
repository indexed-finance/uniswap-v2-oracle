// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;


library Bits {
  uint256 internal constant ONE = uint256(1);
  uint256 internal constant ONES = uint256(~0);

  /**
   * @dev Sets the bit at the given 'index' in 'self' to '1'.
   * Returns the modified value.
   */
  function setBit(uint256 self, uint256 index) internal pure returns (uint256) {
    return self | (ONE << index);
  }

  /**
   * @dev Returns a boolean indicating whether the bit at the given `index` in `self` is set.
   */
  function bitSet(uint256 self, uint256 index) internal pure returns (bool) {
    return (self >> index) & 1 == 1;
  }

  /**
    * @dev Clears all bits in the exclusive range [index:255]
    */
  function clearBitsAfter(uint256 self, uint256 index) internal pure returns (uint256) {
    return self & (ONES >> (255 - index));
  }

  /**
    * @dev Clears bits in the exclusive range [0:index]
    */
  function clearBitsBefore(uint256 self, uint256 index) internal pure returns (uint256) {
    return self & (ONES << (index));
  }

  /**
   * @dev Writes the index of every set bit in `val` as a uint16 in `bitPositions`.
   * Adds `offset` to the stored bit index.
   *
   * `bitPositions` must have a length equal to twice the maximum number of bits that
   * could be found plus 31. Each index is stored as a uint16 to accomodate `offset`
   *  because this is used in functions which would otherwise need expensive methods
   * to handle relative indices in multi-integer searches.
   * The specified length ensures that solc will handle memory allocation, and the
   * addition of 31 allows us to store whole words at a time.
   * After being declared, the actual length stored in memory must be set to 0 with:
   * `assembly { mstore(bitPositions, 0) }` because the length is used to count found bits.
   *
   * @param bitPositions Packed uint16 array for positions of set bits
   * @param val Value to search set bits in
   * @param offset Value added to the stored position, used to simplify large searches.
   */
  function writeSetBits(bytes memory bitPositions, uint256 val, uint16 offset) internal pure {
    if (val == 0) return;

    assembly {
      // Read the current length, which is the number of stored bytes
      let len := mload(bitPositions)
      // Set the starting pointer by adding the length to the bytes data pointer
      // This does not change and is later used to compute the new length
      let startPtr := add(add(bitPositions, 32), len)
      // Set the variable pointer which is used to track where to write memory values
      let ptr := startPtr
      // Increment the number of bits to shift until the shifted integer is 0
      // Add 3 to the index each loop because that is the number of bits being checked
      // at a time.
      for {let i := 0} gt(shr(i, val), 0) {i := add(i, 3)} {
        // Loop until the last 8 bits are not all 0
        for {} eq(and(shr(i, val), 255), 0) {i := add(i, 8)} {}
        // Take only the last 3  bits
        let x := and(shr(i, val), 7)
        // Use a switch statement as a lookup table with every possible combination of 3 bits.
        switch x
          case 0 {}// no bits set
          case 1 {// bit 0 set
            // shift left 240 bits to write uint16, increment ptr by 2 bytes
            mstore(ptr, shl(0xf0, add(i, offset)))
            ptr := add(ptr, 2)
          }
          case 2 {// bit 1 set
            // shift left 240 bits to write uint16, increment ptr by 2 bytes
            mstore(ptr, shl(0xf0, add(add(i, 1), offset)))
            ptr := add(ptr, 2)
          }
          case 3 {// bits 0,1 set
            // shift first left 240 bits and second 224 to write two uint16s
            // increment ptr by 4 bytes
            mstore(
              ptr,
              or(// use OR to avoid multiple memory writes
                shl(0xf0, add(i, offset)),
                shl(0xe0, add(add(i, 1), offset))
              )
            )
            ptr := add(ptr, 4)
          }
          case 4 {// bit 2 set
            // shift left 240 bits to write uint16, increment ptr by 2 bytes
            mstore(ptr, shl(0xf0, add(add(i, 2), offset)))
            ptr := add(ptr, 2)
          }
          case 5 {// 5: bits 0,2 set
            // shift first left 240 bits and second 224 bits to write two uint16s
            mstore(
              ptr,
              or(// use OR to avoid multiple memory writes
                shl(0xf0, add(i, offset)),
                shl(0xe0, add(add(i, 2), offset))
              )
            )

            ptr := add(ptr, 4)// increment ptr by 4 bytes
          }
          case 6 {// bits 1,2 set
            // shift first left 240 bits and second 224 to write two uint16s
            mstore(
              ptr,
              or(// use OR to avoid multiple memory writes
                shl(0xf0, add(add(i, 1), offset)),
                shl(0xe0, add(add(i, 2), offset))
              )
            )
            ptr := add(ptr, 4)// increment ptr by 4 bytes
          }
          case 7 {//bits 0,1,2 set
            // shift first left 240 bits, second 224, third 208 to write three uint16s
            mstore(
              ptr,
              or(// use OR to avoid multiple memory writes
                shl(0xf0, add(i, offset)),
                or(
                  shl(0xe0, add(add(i, 1), offset)),
                  shl(0xd0, add(add(i, 2), offset))
                )
              )
            )
            ptr := add(ptr, 6)// increment ptr by 6 bytes
          }
      }
      // subtract current pointer from initial to get byte length
      let newLen := sub(ptr, startPtr)
      // write byte length
      mstore(bitPositions, add(len, newLen))
    }
  }

  /**
   * @dev Returns the index of the highest bit set in `self`.
   * Note: Requires that `self != 0`
   */
  function highestBitSet(uint256 self) internal pure returns (uint256 r) {
    uint256 x = self;
    require (x > 0, "Bits::highestBitSet: Value 0 has no bits set");
    if (x >= 0x100000000000000000000000000000000) {x >>= 128; r += 128;}
    if (x >= 0x10000000000000000) {x >>= 64; r += 64;}
    if (x >= 0x100000000) {x >>= 32; r += 32;}
    if (x >= 0x10000) {x >>= 16; r += 16;}
    if (x >= 0x100) {x >>= 8; r += 8;}
    if (x >= 0x10) {x >>= 4; r += 4;}
    if (x >= 0x4) {x >>= 2; r += 2;}
    if (x >= 0x2) r += 1; // No need to shift x anymore
  }

  /**
   * @dev Returns the index of the lowest bit set in `self`.
   * Note: Requires that `self != 0`
   */
  function lowestBitSet(uint256 self) internal pure returns (uint256 _z) {
    require (self > 0, "Bits::lowestBitSet: Value 0 has no bits set");
    uint256 _magic = 0x00818283848586878898a8b8c8d8e8f929395969799a9b9d9e9faaeb6bedeeff;
    uint256 val = (self & -self) * _magic >> 248;
    uint256 _y = val >> 5;
    _z = (
      _y < 4
        ? _y < 2
          ? _y == 0
            ? 0x753a6d1b65325d0c552a4d1345224105391a310b29122104190a110309020100
            : 0xc976c13bb96e881cb166a933a55e490d9d56952b8d4e801485467d2362422606
          : _y == 2
            ? 0xe39ed557db96902cd38ed14fad815115c786af479b7e83247363534337271707
            : 0xf7cae577eec2a03cf3bad76fb589591debb2dd67e0aa9834bea6925f6a4a2e0e
        : _y < 6
          ? _y == 4
            ? 0xc8c0b887b0a8a4489c948c7f847c6125746c645c544c444038302820181008ff
            : 0xf6e4ed9ff2d6b458eadcdf97bd91692de2d4da8fd2d0ac50c6ae9a8272523616
          : _y == 6
            ? 0xf5ecf1b3e9debc68e1d9cfabc5997135bfb7a7a3938b7b606b5b4b3f2f1f0ffe
            : 0xf8f9cbfae6cc78fbefe7cdc3a1793dfcf4f0e8bbd8cec470b6a28a7a5a3e1efd
    );
    _z >>= (val & 0x1f) << 3;
    return _z & 0xff;
  }

  /**
   * @dev Returns a boolean indicating whether `bit` is the highest set bit
   * in the integer and the index of the next lowest set bit if it is not.
   */
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

  /**
   * @dev Returns a boolean indicating whether `bit` is the lowest set bit
   * in the integer and the index of the next highest set bit if it is not.
   */
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
