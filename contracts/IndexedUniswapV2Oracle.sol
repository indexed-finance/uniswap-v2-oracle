// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

/* ==========  Internal Libraries  ========== */
import "./lib/PriceLibrary.sol";
import "./lib/FixedPoint.sol";
import "./lib/IndexedPriceMapLibrary.sol";

/* ==========  Internal Inheritance  ========== */
import "./interfaces/IIndexedUniswapV2Oracle.sol";


contract IndexedUniswapV2Oracle is IIndexedUniswapV2Oracle {
  using PriceLibrary for address;
  using PriceLibrary for PriceLibrary.PriceObservation;
  using PriceLibrary for PriceLibrary.TwoWayAveragePrice;
  using FixedPoint for FixedPoint.uq112x112;
  using FixedPoint for FixedPoint.uq144x112;
  using IndexedPriceMapLibrary for IndexedPriceMapLibrary.IndexedPriceMap;


/* ==========  Immutables  ========== */

  address internal immutable _uniswapFactory;
  address internal immutable _weth;

/* ==========  Storage  ========== */

  // Price observations for tokens indexed by hour.
  mapping(address => IndexedPriceMapLibrary.IndexedPriceMap) internal _tokenPriceMaps;

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

  /**
   * @dev Attempts to update the price of `token` and returns a boolean
   * indicating whether it was updated.
   *
   * Note: The price can be updated if there is no observation for the current hour
   * and at least 30 minutes have passed since the last observation.
   */
  function updatePrice(address token) public override returns (bool/* didUpdatePrice */) {
    if (token == _weth) return true;
    PriceLibrary.PriceObservation memory observation = _uniswapFactory.observeTwoWayPrice(token, _weth);
    return _tokenPriceMaps[token].writePriceObservation(observation);
  }

  /**
   * @dev Attempts to update the price of each token in `tokens` and returns a boolean
   * array indicating which tokens had their prices updated.
   *
   * Note: The price can be updated if there is no observation for the current hour
   * and at least 30 minutes have passed since the last observation.
   */
  function updatePrices(address[] calldata tokens)
    external
    override
    returns (bool[] memory pricesUpdated)
  {
    uint256 len = tokens.length;
    pricesUpdated = new bool[](len);
    for (uint256 i = 0; i < len; i++) {
      pricesUpdated[i] = updatePrice(tokens[i]);
    }
  }

/* ==========  Meta Price Queries  ========== */

  /**
   * @dev Returns a boolean indicating whether a price was recorded for `token` at `priceKey`.
   *
   * @param token Token to check if the oracle has a price for
   * @param priceKey Index of the hour to check
   */
  function hasPriceObservationInWindow(address token, uint256 priceKey)
    external view override returns (bool)
  {
    return _tokenPriceMaps[token].hasPriceInWindow(priceKey);
  }


  /**
   * @dev Returns the price observation for `token` recorded in `priceKey`.
   * Reverts if no prices have been recorded for that key.
   *
   * @param token Token to retrieve a price for
   * @param priceKey Index of the hour to query
   */
  function getPriceObservationInWindow(address token, uint256 priceKey)
    external
    view
    override
    returns (PriceLibrary.PriceObservation memory observation)
  {
    observation = _tokenPriceMaps[token].getPriceInWindow(priceKey);
    require(
      observation.timestamp != 0,
      "IndexedUniswapV2Oracle::getPriceObservationInWindow: No price observed in given hour."
    );
  }

  /**
   * @dev Returns all price observations for `token` recorded between `timeFrom` and `timeTo`.
   */
  function getPriceObservationsInRange(address token, uint256 timeFrom, uint256 timeTo)
    external
    view
    override
    returns (PriceLibrary.PriceObservation[] memory prices)
  {
    prices = _tokenPriceMaps[token].getPriceObservationsInRange(timeFrom, timeTo);
  }

/* ==========  Price Update Queries  ========== */

  /**
   * @dev Returns a boolean indicating whether the price of `token` can be updated.
   *
   * Note: The price can be updated if there is no observation for the current hour
   * and at least 30 minutes have passed since the last observation.
   */
  function canUpdatePrice(address token) external view override returns (bool/* canUpdatePrice */) {
    if (!_uniswapFactory.pairInitialized(token, _weth)) return false;
    return _tokenPriceMaps[token].canUpdatePrice(uint32(now));
  }

  /**
   * @dev Returns a boolean array indicating whether the price of each token in
   * `tokens` can be updated.
   *
   * Note: The price can be updated if there is no observation for the current hour
   * and at least 30 minutes have passed since the last observation.
   */
  function canUpdatePrices(address[] calldata tokens) external view override returns (bool[] memory canUpdateArr) {
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
   * Computes the time-weighted average price of weth in terms of `token` and the price
   * of `token` in terms of weth by getting the current prices from Uniswap and searching
   * for a historical price which is between `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeTwoWayAveragePrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (PriceLibrary.TwoWayAveragePrice memory)
  {
    return _getTwoWayPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  /**
   * @dev Returns the UQ112x112 struct representing the average price of
   * `token` in terms of weth.
   *
   * Computes the time-weighted average price of `token` in terms of weth by getting the
   * current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageTokenPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (FixedPoint.uq112x112 memory priceAverage)
  {
    return _getTokenPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  /**
   * @dev Returns the UQ112x112 struct representing the average price of
   * weth in terms of `token`.
   *
   * Computes the time-weighted average price of weth in terms of `token` by getting the
   * current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageEthPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
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
   * Computes the time-weighted average price of weth in terms of each token and the price
   * of each token in terms of weth by getting the current prices from Uniswap and searching
   * for a historical price which is between `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeTwoWayAveragePrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (PriceLibrary.TwoWayAveragePrice[] memory prices)
  {
    uint256 len = tokens.length;
    prices = new PriceLibrary.TwoWayAveragePrice[](len);
    for (uint256 i = 0; i < len; i++) {
      prices[i] = _getTwoWayPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

  /**
   * @dev Returns the UQ112x112 structs representing the average price of
   * each token in `tokens` in terms of weth.
   *
   * Computes the time-weighted average price of each token in terms of weth by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageTokenPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
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
   * Computes the time-weighted average price of weth in terms of each token by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageEthPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
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

  /**
   * @dev Compute the average value of `tokenAmount` ether in terms of weth.
   *
   * Computes the time-weighted average price of `token` in terms of weth by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old, then multiplies by `wethAmount`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageEthForTokens(
    address token,
    uint256 tokenAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144 /* averageValueInWETH */)
  {
    FixedPoint.uq112x112 memory tokenPrice = _getTokenPrice(token, minTimeElapsed, maxTimeElapsed);
    return tokenPrice.mul(tokenAmount).decode144();
  }

  /**
   * @dev Compute the average value of `wethAmount` ether in terms of `token`.
   *
   * Computes the time-weighted average price of weth in terms of the token by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old, then multiplies by `wethAmount`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageTokensForEth(
    address token,
    uint256 wethAmount,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
    validMinMax(minTimeElapsed, maxTimeElapsed)
    returns (uint144 /* averageValueInToken */)
  {
    FixedPoint.uq112x112 memory ethPrice = _getEthPrice(token, minTimeElapsed, maxTimeElapsed);
    return ethPrice.mul(wethAmount).decode144();
  }

/* ==========  Value Queries: Multiple  ========== */

  /**
   * @dev Compute the average value of each amount of tokens in `tokenAmounts` in terms
   * of the corresponding token in `tokens`.
   *
   * Computes the time-weighted average price of each token in terms of weth by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old, then multiplies by the corresponding
   * amount in `tokenAmounts`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageEthForTokens(
    address[] calldata tokens,
    uint256[] calldata tokenAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
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
   * Computes the time-weighted average price of weth in terms of each token by getting
   * the current price from Uniswap and searching for a historical price which is between
   * `minTimeElapsed` and `maxTimeElapsed` seconds old, then multiplies by the corresponding
   * amount in `wethAmounts`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is less than one hour.
   * Note: `minTimeElapsed` is only accurate to the nearest hour (rounded up) unless
   * it is less than one hour.
   */
  function computeAverageTokensForEth(
    address[] calldata tokens,
    uint256[] calldata wethAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    override
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
    returns (PriceLibrary.TwoWayAveragePrice memory)
  {
    if (token == _weth) {
      return PriceLibrary.TwoWayAveragePrice(
        FixedPoint.encode(1)._x,
        FixedPoint.encode(1)._x
      );
    }
    // Get the current cumulative price
    PriceLibrary.PriceObservation memory current = _uniswapFactory.observeTwoWayPrice(token, _weth);
    // Get the latest usable price
    (bool foundPrice, uint256 lastPriceKey) = _tokenPriceMaps[token].getLastPriceObservation(
      current.timestamp,
      minTimeElapsed,
      maxTimeElapsed
    );
    require(foundPrice, "IndexedUniswapV2Oracle::_getTwoWayPrice: No price found in provided range.");
    PriceLibrary.PriceObservation memory previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
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
    PriceLibrary.PriceObservation storage previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
    return PriceLibrary.computeAveragePrice(
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
    PriceLibrary.PriceObservation storage previous = _tokenPriceMaps[token].priceMap[lastPriceKey];
    return PriceLibrary.computeAveragePrice(
      previous.timestamp,
      previous.ethPriceCumulativeLast,
      timestamp,
      priceCumulativeEnd
    );
  }
}