// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.0;

/* ==========  Libraries  ========== */
import { PriceLibrary as Prices } from "./PriceLibrary.sol";
import "./KeyIndex.sol";
import "@nomiclabs/buidler/console.sol";


library IndexedPriceMapLibrary {
  using Prices for address;
  using KeyIndex for mapping(uint256 => uint256);

/* ==========  Constants  ========== */

  // Period over which prices are observed, each period should have 1 price observation.
  uint256 public constant OBSERVATION_PERIOD = 1 hours;

  // Minimum time elapsed between stored price observations
  uint256 public constant MINIMUM_OBSERVATION_DELAY = 0.5 hours;

/* ==========  Struct  ========== */

  struct IndexedPriceMap {
    mapping(uint256 => uint256) keyIndex;
    mapping(uint256 => Prices.PriceObservation) priceMap;
  }

/* ========= Utility Functions ========= */

  function toPriceKey(uint256 timestamp) internal pure returns (uint256/* priceKey */) {
    return timestamp / OBSERVATION_PERIOD;
  }

  function timeElapsedSinceWindowStart(uint256 timestamp) internal pure returns (uint256/* timeElapsed */) {
    return timestamp % OBSERVATION_PERIOD;
  }

/* ========= Mutative Functions ========= */

  function writePriceObservation(
    IndexedPriceMap storage indexedPriceMap,
    Prices.PriceObservation memory observation
  ) internal returns (bool/* didUpdatePrice */) {
    bool canUpdate = sufficientDelaySinceLastPrice(indexedPriceMap, observation.timestamp);
    if (canUpdate) {
      uint256 priceKey = toPriceKey(observation.timestamp);
      canUpdate = indexedPriceMap.keyIndex.markSetKey(priceKey);
      if (canUpdate) {
        indexedPriceMap.priceMap[priceKey] = observation;
      }
    }
    return canUpdate;
  }

/* ========= Price Update View Functions ========= */

  /**
   * @dev Checks whether sufficient time has passed since the beginning of the observation
   * window or since the price recorded in the previous window (if any) for a new price
   * to be recorded.
   */
  function sufficientDelaySinceLastPrice(
    IndexedPriceMap storage indexedPriceMap,
    uint32 newTimestamp
  ) internal view returns (bool/* hasSufficientDelay */) {
    uint256 priceKey = toPriceKey(newTimestamp);
    // If half the observation period has already passed since the beginning of the
    // current window, we can write the price without checking the previous window.
    if (timeElapsedSinceWindowStart(newTimestamp) >= MINIMUM_OBSERVATION_DELAY) {
      return true;
    } else {
      // Verify that at least half the observation period has passed since the last price observation.
      Prices.PriceObservation storage lastObservation = indexedPriceMap.priceMap[priceKey - 1];
      if (
        lastObservation.timestamp == 0 ||
        newTimestamp - lastObservation.timestamp >= MINIMUM_OBSERVATION_DELAY
      ) {
        return true;
      }
    }
    return false;
  }

  function canUpdatePrice(
    IndexedPriceMap storage indexedPriceMap,
    uint32 newTimestamp
  ) internal view returns (bool/* canUpdatePrice */) {
    uint256 priceKey = toPriceKey(newTimestamp);
    // Verify there is not already a price for the same observation window
    if (indexedPriceMap.keyIndex.hasKey(priceKey)) return false;
    return sufficientDelaySinceLastPrice(indexedPriceMap, newTimestamp);
  }

/* =========  Price View Functions  ========= */

  function hasPriceInWindow(
    IndexedPriceMap storage indexedPriceMap,
    uint256 timestamp
  ) internal view returns (bool) {
    return indexedPriceMap.keyIndex.hasKey(toPriceKey(timestamp));
  }

  function getPriceInWindow(
    IndexedPriceMap storage indexedPriceMap,
    uint256 timestamp
  ) internal view returns (Prices.PriceObservation memory) {
    return indexedPriceMap.priceMap[toPriceKey(timestamp)];
  }

  /**
   * @dev Finds the most recent price observation before `timestamp` with a minimum
   * difference in observation times of `minTimeElapsed` and a maximum difference in
   * observation times of `maxTimeElapsed`.
   *
   * Note: `maxTimeElapsed` is only accurate to the nearest hour (rounded down) unless
   * it is below one hour.
   *
   * @param indexedPriceMap Struct with the indexed price mapping for the token.
   * @param timestamp Timestamp to search backwards from.
   * @param minTimeElapsed Minimum time elapsed between price observations.
   * @param maxTimeElapsed Maximum time elapsed between price observations.
   * Only accurate to the nearest hour (rounded down) unless it is below 1 hour.
   */
  function getLastPriceObservation(
    IndexedPriceMap storage indexedPriceMap,
    uint256 timestamp,
    uint256 minTimeElapsed,
    uint256 maxTimeElapsed
  )
    internal
    view
    returns (bool /* foundPrice */, uint256 /* lastPriceKey */)
  {
    uint256 priceKey = toPriceKey(timestamp);
    uint256 windowTimeElapsed = timeElapsedSinceWindowStart(timestamp);
    bool canBeThisWindow = minTimeElapsed <= windowTimeElapsed;
    bool mustBeThisWindow = maxTimeElapsed <= windowTimeElapsed;
    // If the observation window for `timestamp` could include a price observation less than `maxTimeElapsed`
    // older than `timestamp` and the time elapsed since the beginning of the hour for `timestamp` is not higher
    // than `maxTimeElapsed`,  any allowed price must exist in the observation window for `timestamp`.
    if (canBeThisWindow || mustBeThisWindow) {
      Prices.PriceObservation storage observation = indexedPriceMap.priceMap[priceKey];
      uint32 obsTimestamp = observation.timestamp;
      if (
        obsTimestamp != 0 &&
        timestamp > obsTimestamp &&
        timestamp - obsTimestamp <= maxTimeElapsed &&
        timestamp - obsTimestamp >= minTimeElapsed
      ) {
        return (true, priceKey);
      }
      if (mustBeThisWindow) {
        return (false, 0);
      }
    }

    uint256 beginSearchTime = timestamp - minTimeElapsed;
    /* uint256 */
    priceKey = toPriceKey(beginSearchTime);
    uint256 maxDistance = toPriceKey(maxTimeElapsed);
    return indexedPriceMap.keyIndex.findLastSetKey(priceKey, maxDistance);
  }
}