// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../../lib/PriceLibrary.sol";
import "../../lib/Bits.sol";


contract TestPriceLibrary {
  address internal immutable _uniswapFactory;
  address internal immutable _weth;

  constructor(address uniswapFactory_, address weth) public {
    _uniswapFactory = uniswapFactory_;
    _weth = weth;
  }

  function pairInitialized(
    address token,
    address weth
  )
    public
    view
    returns (bool)
  {
    return PriceLibrary.pairInitialized(_uniswapFactory, token, weth);
  }

  function observePrice(
    address tokenIn,
    address quoteToken
  )
    public
    view
    returns (uint32 timestamp, uint224 priceCumulativeLast)
  {
    return PriceLibrary.observePrice(_uniswapFactory, tokenIn, quoteToken);
  }

  function observeTwoWayPrice(
    address token,
    address weth
  ) public view returns (PriceLibrary.PriceObservation memory) {
    return PriceLibrary.observeTwoWayPrice(_uniswapFactory, token, weth);
  }

  function computeTwoWayAveragePrice(
    PriceLibrary.PriceObservation calldata observation1,
    PriceLibrary.PriceObservation calldata observation2
  )
    external
    pure
    returns (PriceLibrary.TwoWayAveragePrice memory)
  {
    return PriceLibrary.computeTwoWayAveragePrice(observation1, observation2);
  }

  function computeAveragePrice(
    uint32 timestampStart,
    uint224 priceCumulativeStart,
    uint32 timestampEnd,
    uint224 priceCumulativeEnd
  )
    public
    pure
    returns (FixedPoint.uq112x112 memory)
  {
    return PriceLibrary.computeAveragePrice(
      timestampStart,
      priceCumulativeStart,
      timestampEnd,
      priceCumulativeEnd
    );
  }

  function computeAverageTokenPrice(
    PriceLibrary.PriceObservation calldata observation1,
    PriceLibrary.PriceObservation calldata observation2
  )
    external
    pure
    returns (FixedPoint.uq112x112 memory)
  {
    return PriceLibrary.computeAverageTokenPrice(observation1, observation2);
  }

  function computeAverageEthPrice(
    PriceLibrary.PriceObservation calldata observation1,
    PriceLibrary.PriceObservation calldata observation2
  )
    external
    pure
    returns (FixedPoint.uq112x112 memory)
  {
    return PriceLibrary.computeAverageEthPrice(observation1, observation2);
  }

  function computeAverageEthForTokens(
    PriceLibrary.TwoWayAveragePrice calldata prices,
    uint256 tokenAmount
  )
    external
    pure
    returns (uint144)
  {
    return PriceLibrary.computeAverageEthForTokens(prices, tokenAmount);
  }

  function computeAverageTokensForEth(
    PriceLibrary.TwoWayAveragePrice calldata prices,
    uint256 wethAmount
  ) external pure returns (uint144) {
    return PriceLibrary.computeAverageTokensForEth(prices, wethAmount);
  }
}