// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;

import "../lib/KeyIndex.sol";

contract ExampleMapIndex {
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

  function hasKey(uint256 key)
    external
    view
    returns (bool)
  {
    return _keyIndex.hasKey(key);
  }
}