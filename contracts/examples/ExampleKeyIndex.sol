// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;

/* ==========  Internal Libraries  ========== */
import "../lib/KeyIndex.sol";


/**
 * @dev Example usage of the KeyIndex library.
 */
contract ExampleKeyIndex {
  using KeyIndex for *;

  mapping(uint256 => uint256) internal _keyIndex;
  mapping(uint256 => uint256) internal _valueMap;

  function writeValue(uint256 mapKey, uint256 value) external {
    _valueMap[mapKey] = value;
    _keyIndex.markSetKey(mapKey);
  }

  function getPreviousValue(uint256 key, uint256 maxDistance)
    external
    view
    returns (bool /* foundValue */, uint256 /* value */)
  {
    (bool foundValue, uint256 mapKey) = _keyIndex.findLastSetKey(key, maxDistance);
    if (foundValue) {
      return (true, _valueMap[mapKey]);
    }
    return (false, 0);
  }

  function getNextValue(uint256 key, uint256 maxDistance)
    external
    view
    returns (bool /* foundValue */, uint256 /* value */)
  {

    (bool foundValue, uint256 mapKey) = _keyIndex.findNextSetKey(key, maxDistance);
    if (foundValue) {
      return (true, _valueMap[mapKey]);
    }
    return (false, 0);
  }

  function getValuesInRange(uint256 fromKey, uint256 toKey)
    external view returns (uint256[] memory values)
  {
    require(toKey > fromKey, "ExampleKeyIndex::getValuesInRange: Invalid Range");
    bytes memory bitPositions = _keyIndex.getEncodedSetKeysInRange(fromKey, toKey);
    // Divide by 2 because length is in bytes and relative indices are stored as uint16
    uint256 len = bitPositions.length / 2;
    values = new uint256[](len);
    uint256 ptr;
    assembly { ptr := add(bitPositions, 32) }
    for (uint256 i = 0; i < len; i++) {
      uint256 relativeIndex;
      assembly {
        relativeIndex := shr(0xf0, mload(ptr))
        ptr := add(ptr, 2)
      }
      uint256 key = fromKey + relativeIndex;
      values[i] = _valueMap[key];
    }
  }

  function getSetKeysInRange(uint256 fromKey, uint256 toKey)
    external view returns (uint256[] memory setKeys)
  {
    require(toKey > fromKey, "ExampleKeyIndex::getSetKeysInRange: Invalid Range");
    // Divide by 2 because length is in bytes and relative indices are stored as uint16
    bytes memory bitPositions = _keyIndex.getEncodedSetKeysInRange(fromKey, toKey);
    uint256 len = bitPositions.length / 2;
    setKeys = new uint256[](len);
    uint256 ptr;
    assembly { ptr := add(bitPositions, 32) }
    for (uint256 i = 0; i < len; i++) {
      uint256 relativeIndex;
      assembly {
        relativeIndex := shr(0xf0, mload(ptr))
        ptr := add(ptr, 2)
      }
      setKeys[i] = fromKey + relativeIndex;
    }
  }

  function hasKey(uint256 key)
    external
    view
    returns (bool)
  {
    return _keyIndex.hasKey(key);
  }
}