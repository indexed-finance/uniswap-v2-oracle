// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

/* ==========  Libraries  ========== */
import { PriceLibrary as Prices } from "./lib/PriceLibrary.sol";
import "./lib/FixedPoint.sol";
import { IndexedPriceMapLibrary as PriceMapLib } from "./lib/IndexedPriceMapLibrary.sol";


contract IndexedUniswapV2Oracle {
  using Prices for address;
  using Prices for Prices.PriceObservation;
  using Prices for Prices.TwoWayAveragePrice;
  using FixedPoint for FixedPoint.uq112x112;
  using FixedPoint for FixedPoint.uq144x112;
  using PriceMapLib for PriceMapLib.IndexedPriceMap;


/* ==========  Immutables  ========== */

  address internal immutable _uniswapFactory;
  address internal immutable _weth;

/* ==========  Storage  ========== */

  // Price observations for tokens indexed by hour.
  mapping(address => PriceMapLib.IndexedPriceMap) internal _tokenPriceMaps;

/* ==========  Modifiers  ========== */

  modifier validMinMax(uint256 minTimeElapsed, uint256 maxTimeElapsed) {
    require(
      maxTimeElapsed >= minTimeElapsed,
      "IndexedUniswapV2Oracle::validMinMax: Minimum age can not be higher than maximum."
    );
    _;
  }

/* ==========  Constructor  ========== */

  constructor(address uniswapFactory, address weth) public {
    _uniswapFactory = uniswapFactory;
    _weth = weth;
  }

/* ==========  Mutative Functions  ========== */

  function updatePrice(address token) public returns (bool/* didUpdatePrice */) {
    Prices.PriceObservation memory observation = _uniswapFactory.observeTwoWayPrice(token, _weth);
    return _tokenPriceMaps[token].writePriceObservation(observation);
  }

  function updatePrices(address[] calldata tokens) external returns (bool[] memory pricesUpdated) {
    uint256 len = tokens.length;
    pricesUpdated = new bool[](len);
    for (uint256 i = 0; i < len; i++) {
      pricesUpdated[i] = updatePrice(tokens[i]);
    }
  }

/* ==========  Meta Price Queries  ========== */

  function hasPriceObservationInWindow(address token, uint256 priceKey) external view returns (bool) {
    return _tokenPriceMaps[token].hasPriceInWindow(priceKey);
  }

  function getPriceObservationInWindow(address token, uint256 priceKey)
    external
    view
    returns (Prices.PriceObservation memory)
  {
    Prices.PriceObservation memory observation = _tokenPriceMaps[token].getPriceInWindow(priceKey);
    require(
      observation.timestamp != 0,
      "IndexedUniswapV2Oracle::getPriceObservationInWindow: No price observed in given hour."
    );
    return observation;
  }

/* ==========  Price Update Queries  ========== */

  function canUpdatePrice(address token) external view returns (bool/* canUpdatePrice */) {
    if (!_uniswapFactory.pairInitialized(token, _weth)) return false;
    return _tokenPriceMaps[token].canUpdatePrice(uint32(now));
  }

  function canUpdatePrices(address[] calldata tokens) external view returns (bool[] memory canUpdateArr) {
    uint256 len = tokens.length;
    canUpdateArr = new bool[](len);
    for (uint256 i = 0; i < len; i++) {
      address token = tokens[i];
      bool timeAllowed = _tokenPriceMaps[token].canUpdatePrice(uint32(now));
      canUpdateArr[i] = timeAllowed && _uniswapFactory.pairInitialized(token, _weth);
    }
  }

/* ==========  Price Queries: Singular  ========== */

  /**
   * @dev Returns the TwoWayAveragePrice struct representing the average price of
   * weth in terms of `token` and the average price of `token` in terms of weth.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeTwoWayAveragePrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (Prices.TwoWayAveragePrice memory)
  {
    return _getTwoWayPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  /**
   * @dev Returns the UQ112x112 struct representing the average price of
   * `token` in terms of weth.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeAverageTokenPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (FixedPoint.uq112x112 memory priceAverage)
  {
    return _getTokenPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  /**
   * @dev Returns the UQ112x112 struct representing the average price of
   * weth in terms of `token`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeAverageEthPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (FixedPoint.uq112x112 memory priceAverage)
  {
    return _getEthPrice(token, minTimeElapsed, maxTimeElapsed);
  }

/* ==========  Price Queries: Multiple  ========== */

  /**
   * @dev Returns the TwoWayAveragePrice structs representing the average price of
   * weth in terms of each token in `tokens` and the average price of each token
   * in terms of weth.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeTwoWayAveragePrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (Prices.TwoWayAveragePrice[] memory prices)
  {
    uint256 len = tokens.length;
    prices = new Prices.TwoWayAveragePrice[](len);
    for (uint256 i = 0; i < len; i++) {
      prices[i] = _getTwoWayPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

    /**
   * @dev Returns the UQ112x112 structs representing the average price of
   * each token in `tokens` in terms of weth.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeAverageTokenPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (FixedPoint.uq112x112[] memory averagePrices)
  {
    uint256 len = tokens.length;
    averagePrices = new FixedPoint.uq112x112[](len);
    for (uint256 i = 0; i < len; i++) {
      averagePrices[i] = _getTokenPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

  /**
   * @dev Returns the UQ112x112 structs representing the average price of
   * weth in terms of each token in `tokens`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   */
  function computeAverageEthPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (FixedPoint.uq112x112[] memory averagePrices)
  {
    uint256 len = tokens.length;
    averagePrices = new FixedPoint.uq112x112[](len);
    for (uint256 i = 0; i < len; i++) {
      averagePrices[i] = _getEthPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

/* ==========  Value Queries: Singular  ========== */

  function computeAverageEthForTokens(
    address token,
    uint256 tokenAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144 /* averageValueInWETH */)
  {
    FixedPoint.uq112x112 memory tokenPrice = _getTokenPrice(token, minTimeElapsed, maxTimeElapsed);
    return tokenPrice.mul(tokenAmount).decode144();
  }

  function computeAverageTokensForEth(
    address token,
    uint256 wethAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144 /* averageValueInToken */)
  {
    FixedPoint.uq112x112 memory ethPrice = _getEthPrice(token, minTimeElapsed, maxTimeElapsed);
    return ethPrice.mul(wethAmount).decode144();
  }

/* ==========  Value Queries: Singular  ========== */

  function computeAverageEthForTokens(
    address[] calldata tokens,
    uint256[] calldata tokenAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144[] memory averageValuesInWETH)
  {
    uint256 len = tokens.length;
    require(
      tokenAmounts.length == len,
      "IndexedUniswapV2Oracle::computeAverageEthForTokens: Tokens and amounts have different lengths."
    );
    averageValuesInWETH = new uint144[](len);
    for (uint256 i = 0; i < len; i++) {
      averageValuesInWETH[i] = _getTokenPrice(
        tokens[i],
        minTimeElapsed,
        maxTimeElapsed
      ).mul(tokenAmounts[i]).decode144();
    }
  }

  /**
   * @dev Compute the average value of each amount of ether in `wethAmounts` in terms
   * of the corresponding token in `tokens`.
   *
   * Computes the time-weighted average price of each token by getting the current price
   * from Uniswap and searching for a historical price which is between `minTimeElapsed`
   * and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour. `minTimeElapsed` is only accurate to the nearest hour
   * (rounded up) unless it is less than one hour.
   */
  function computeAverageTokensForEth(
    address[] calldata tokens,
    uint256[] calldata wethAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144[] memory averageValuesInWETH)
  {
    uint256 len = tokens.length;
    require(
      wethAmounts.length == len,
      "IndexedUniswapV2Oracle::computeAverageTokensForEth: Tokens and amounts have different lengths."
    );
    averageValuesInWETH = new uint144[](len);
    for (uint256 i = 0; i < len; i++) {
      averageValuesInWETH[i] = _getEthPrice(
        tokens[i],
        minTimeElapsed,
        maxTimeElapsed
      ).mul(wethAmounts[i]).decode144();
    }
  }

/* ==========  Internal Functions  ========== */
  function _getTwoWayPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    internal
    view
    returns (Prices.TwoWayAveragePrice memory)
  {
    if (token == _weth) {
      return Prices.TwoWayAveragePrice(
        FixedPoint.encode(1)._x,
        FixedPoint.encode(1)._x
      );
    }
    // Get the current cumulative price
    Prices.PriceObservation memory current = _uniswapFactory.observeTwoWayPrice(token, _weth);
    // Get the latest usable price
    (bool foundPrice, uint256 lastPriceKey) = _tokenPriceMaps[token].getLastPriceObservation(
      current.timestamp,
      minTimeElapsed,
      maxTimeElapsed
    );
    require(foundPrice, "IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range.");
    Prices.PriceObservation memory previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
    return previous.computeTwoWayAveragePrice(current);
  }

  function _getTokenPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    internal
    view
    returns (FixedPoint.uq112x112 memory)
  {
    if (token == _weth) {
      return FixedPoint.fraction(1, 1);
    }
    (uint32 timestamp, uint224 priceCumulativeEnd) = _uniswapFactory.observePrice(token, _weth);
    (bool foundPrice, uint256 lastPriceKey) = _tokenPriceMaps[token].getLastPriceObservation(
      timestamp,
      minTimeElapsed,
      maxTimeElapsed
    );
    require(foundPrice, "IndexedUniswapV2Oracle::_getTokenPrice: No price found in provided range.");
    Prices.PriceObservation storage previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
    return Prices.computeAveragePrice(
      previous.timestamp,
      previous.priceCumulativeLast,
      timestamp,
      priceCumulativeEnd
    );
  }

  function _getEthPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    internal
    view
    returns (FixedPoint.uq112x112 memory)
  {
    if (token == _weth) {
      return FixedPoint.fraction(1, 1);
    }
    (uint32 timestamp, uint224 priceCumulativeEnd) = _uniswapFactory.observePrice(_weth, token);
    (bool foundPrice, uint256 lastPriceKey) = _tokenPriceMaps[token].getLastPriceObservation(
      timestamp,
      minTimeElapsed,
      maxTimeElapsed
    );
    require(foundPrice, "IndexedUniswapV2Oracle::_getEthPrice: No price found in provided range.");
    Prices.PriceObservation storage previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
    return Prices.computeAveragePrice(
      previous.timestamp,
      previous.ethPriceCumulativeLast,
      timestamp,
      priceCumulativeEnd
    );
  }
}