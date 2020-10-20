// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../../lib/UniswapV2Library.sol";
import "../../lib/Bits.sol";


contract TestErrorTriggers {
  function triggerUniswapLibrarySameTokenError() public pure {
    UniswapV2Library.sortTokens(address(1), address(1));
  }

  function triggerUniswapLibraryNullTokenError() public pure {
    UniswapV2Library.sortTokens(address(1), address(0));
  }

  function triggerHighestBitError() public pure {
    Bits.highestBitSet(0);
  }

  function triggerLowestBitError() public pure {
    Bits.lowestBitSet(0);
  }
}