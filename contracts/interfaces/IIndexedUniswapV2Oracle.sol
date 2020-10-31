// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

/* ==========  Libraries  ========== */
import "../lib/PriceLibrary.sol";
import "../lib/FixedPoint.sol";


interface IIndexedUniswapV2Oracle {
/* ==========  Mutative Functions  ========== */

  function updatePrice(address token) external returns (bool);

  function updatePrices(address[] calldata tokens) external returns (bool[] memory);

/* ==========  Meta Price Queries  ========== */

  function hasPriceObservationInWindow(address token, uint256 priceKey) external view returns (bool);

  function getPriceObservationInWindow(
    address token, uint256 priceKey
  ) external view returns (PriceLibrary.PriceObservation memory);

  function getPriceObservationsInRange(
    address token, uint256 timeFrom, uint256 timeTo
  ) external view returns (PriceLibrary.PriceObservation[] memory prices);

/* ==========  Price Update Queries  ========== */

  function canUpdatePrice(address token) external view returns (bool);

  function canUpdatePrices(address[] calldata tokens) external view returns (bool[] memory);

/* ==========  Price Queries: Singular  ========== */

  function computeTwoWayAveragePrice(
    address token, uint256 minTimeElapsed, uint256 maxTimeElapsed
  ) external view returns (PriceLibrary.TwoWayAveragePrice memory);

  function computeAverageTokenPrice(
    address token, uint256 minTimeElapsed, uint256 maxTimeElapsed
  ) external view returns (FixedPoint.uq112x112 memory);

  function computeAverageEthPrice(
    address token, uint256 minTimeElapsed, uint256 maxTimeElapsed
  ) external view returns (FixedPoint.uq112x112 memory);

/* ==========  Price Queries: Multiple  ========== */

  function computeTwoWayAveragePrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (PriceLibrary.TwoWayAveragePrice[] memory);

  function computeAverageTokenPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (FixedPoint.uq112x112[] memory);

  function computeAverageEthPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (FixedPoint.uq112x112[] memory);

/* ==========  Value Queries: Singular  ========== */

  function computeAverageEthForTokens(
    address token,
    uint256 tokenAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (uint144);

  function computeAverageTokensForEth(
    address token,
    uint256 wethAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (uint144);

/* ==========  Value Queries: Multiple  ========== */

  function computeAverageEthForTokens(
    address[] calldata tokens,
    uint256[] calldata tokenAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (uint144[] memory);

  function computeAverageTokensForEth(
    address[] calldata tokens,
    uint256[] calldata wethAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  ) external view returns (uint144[] memory);
}