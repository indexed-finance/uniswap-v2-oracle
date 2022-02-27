// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

/* ==========  Internal Libraries  ========== */
import "./lib/PriceLibrary.sol";
import "./lib/FixedPoint.sol";

/* ==========  Internal Inheritance  ========== */
import "./interfaces/IIndexedUniswapV2Oracle.sol";


contract OracleFallthrough is Ownable {
  using PriceLibrary for address;
  using PriceLibrary for PriceLibrary.TwoWayAveragePrice;
  using FixedPoint for FixedPoint.uq112x112;
  using FixedPoint for FixedPoint.uq144x112;

  IIndexedUniswapV2Oracle public immutable ethOracle;
  IIndexedUniswapV2Oracle public immutable maticOracle;
  address public immutable weth;
  address public immutable wmatic;

  mapping (address => bool) public useMatic;

  constructor(
    IIndexedUniswapV2Oracle _ethOracle,
    IIndexedUniswapV2Oracle _maticOracle,
    address _weth,
    address _wmatic
  ) public Ownable() {
    ethOracle = _ethOracle;
    maticOracle = _maticOracle;
    weth = _weth;
    wmatic = _wmatic;
  }

/* ==========  Mutative Functions  ========== */

  function setUseMatic(address token, bool _useMatic) external onlyOwner {
    require(token != wmatic && token != weth, "OracleFallthrough::setUseMatic: Can not set useMatic for weth or matic.");
    useMatic[token] = _useMatic;
  }

  function setUseMaticMultiple(address[] calldata tokens, bool[] calldata useMatics) external onlyOwner {
    uint256 len = tokens.length;
    require(useMatics.length == len, "OracleFallthrough::setUseMaticMultiple: Array lengths do not match.");
    for (uint256 i; i < len; i++) {
      address token = tokens[i];
      require(token != wmatic && token != weth, "OracleFallthrough::setUseMaticMultiple: Can not set useMatic for weth or matic.");
      useMatic[token] = useMatics[i];
    }
  }

  function updatePrice(address token) public returns (bool) {
    (bool didUpdate, bool usedMatic) = _updatePrice(token);
    if (usedMatic) _updateMaticPrice();
    return didUpdate;
  }

  function updatePrices(address[] calldata tokens) external returns (bool[] memory) {
    uint256 len = tokens.length;
    bool[] memory didUpdates = new bool[](len);
    bool anyMatic;
    for (uint256 i; i < len; i++) {
      bool usedMatic;
      (didUpdates[i], usedMatic) = _updatePrice(tokens[i]);
      anyMatic = anyMatic || usedMatic;
    }
    if (anyMatic) _updateMaticPrice();
    return didUpdates;
  }

/* ==========  Price Update Queries  ========== */

  function canUpdatePrice(address token) public view returns (bool) {
    return (useMatic[token] ? maticOracle : ethOracle).canUpdatePrice(token);
  }

  function canUpdatePrices(address[] calldata tokens) external view returns (bool[] memory) {
    uint256 len = tokens.length;
    bool[] memory canUpdates = new bool[](len);
    for (uint256 i; i < len; i++) canUpdates[i] = canUpdatePrice(tokens[i]);
  }

/* ==========  Price Queries: Singular  ========== */

  function computeTwoWayAveragePrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (PriceLibrary.TwoWayAveragePrice memory)
  {
    return _getTwoWayPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  function computeAverageTokenPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (FixedPoint.uq112x112 memory priceAverage)
  {
    return _getTokenPrice(token, minTimeElapsed, maxTimeElapsed);
  }

  function computeAverageEthPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (FixedPoint.uq112x112 memory priceAverage)
  {
    return _getEthPrice(token, minTimeElapsed, maxTimeElapsed);
  }

/* ==========  Price Queries: Multiple  ========== */

  function computeTwoWayAveragePrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (PriceLibrary.TwoWayAveragePrice[] memory prices)
  {
    uint256 len = tokens.length;
    prices = new PriceLibrary.TwoWayAveragePrice[](len);
    for (uint256 i = 0; i < len; i++) {
      prices[i] = _getTwoWayPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

  function computeAverageTokenPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (FixedPoint.uq112x112[] memory averagePrices)
  {
    uint256 len = tokens.length;
    averagePrices = new FixedPoint.uq112x112[](len);
    for (uint256 i = 0; i < len; i++) {
      averagePrices[i] = _getTokenPrice(tokens[i], minTimeElapsed, maxTimeElapsed);
    }
  }

  function computeAverageEthPrices(
    address[] calldata tokens,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
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
    returns (uint144 /* averageValueInToken */)
  {
    FixedPoint.uq112x112 memory ethPrice = _getEthPrice(token, minTimeElapsed, maxTimeElapsed);
    return ethPrice.mul(wethAmount).decode144();
  }

/* ==========  Value Queries: Multiple  ========== */

  function computeAverageEthForTokens(
    address[] calldata tokens,
    uint256[] calldata tokenAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (uint144[] memory averageValuesInWETH)
  {
    uint256 len = tokens.length;
    require(
      tokenAmounts.length == len,
      "OracleFallthrough::computeAverageEthForTokens: Tokens and amounts have different lengths."
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

  function computeAverageTokensForEth(
    address[] calldata tokens,
    uint256[] calldata wethAmounts,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    external
    view
    returns (uint144[] memory averageValuesInWETH)
  {
    uint256 len = tokens.length;
    require(
      wethAmounts.length == len,
      "OracleFallthrough::computeAverageTokensForEth: Tokens and amounts have different lengths."
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

  function _updateMaticPrice() internal {
    ethOracle.updatePrice(wmatic);
  }

  function _getTwoWayPrice(
    address token,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    internal
    view
    returns (PriceLibrary.TwoWayAveragePrice memory)
  {
    if (token == weth) {
      return PriceLibrary.TwoWayAveragePrice(
        FixedPoint.encode(1)._x,
        FixedPoint.encode(1)._x
      );
    }
    if (useMatic[token]) {
      PriceLibrary.TwoWayAveragePrice memory tokenPrice = maticOracle.computeTwoWayAveragePrice(token, minTimeElapsed, maxTimeElapsed);
      PriceLibrary.TwoWayAveragePrice memory maticPrice = ethOracle.computeTwoWayAveragePrice(wmatic, minTimeElapsed, maxTimeElapsed);
      tokenPrice.priceAverage = FixedPoint.uq112x112(tokenPrice.priceAverage).mul(
        FixedPoint.uq112x112(maticPrice.priceAverage)
      )._x;
      tokenPrice.ethPriceAverage = FixedPoint.uq112x112(tokenPrice.ethPriceAverage).mul(
        FixedPoint.uq112x112(maticPrice.ethPriceAverage)
      )._x;
      return tokenPrice;
    } else {
      return ethOracle.computeTwoWayAveragePrice(token, minTimeElapsed, maxTimeElapsed);
    }
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
    if (token == weth) {
      return FixedPoint.fraction(1, 1);
    }
    if (useMatic[token]) {
      FixedPoint.uq112x112 memory tokenPrice = maticOracle.computeAverageTokenPrice(token, minTimeElapsed, maxTimeElapsed);
      FixedPoint.uq112x112 memory maticPrice = ethOracle.computeAverageTokenPrice(wmatic, minTimeElapsed, maxTimeElapsed);
      return tokenPrice.mul(maticPrice);
    } else {
      return ethOracle.computeAverageTokenPrice(token, minTimeElapsed, maxTimeElapsed);
    }
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
    if (token == weth) {
      return FixedPoint.fraction(1, 1);
    }
    if (useMatic[token]) {
      FixedPoint.uq112x112 memory maticPriceToken = maticOracle.computeAverageEthPrice(token, minTimeElapsed, maxTimeElapsed);
      FixedPoint.uq112x112 memory ethPriceMatic = ethOracle.computeAverageEthPrice(wmatic, minTimeElapsed, maxTimeElapsed);
      return maticPriceToken.mul(ethPriceMatic);
    } else {
      return ethOracle.computeAverageEthPrice(token, minTimeElapsed, maxTimeElapsed);
    }
  }

  function _updatePrice(address token) internal returns (bool didUpdate, bool usedMatic) {
    usedMatic = useMatic[token];
    didUpdate = (usedMatic ? maticOracle : ethOracle).updatePrice(token);
  }
}