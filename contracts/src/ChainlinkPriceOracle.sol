// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IPriceOracle } from "./interfaces/IPriceOracle.sol";

/// @notice Chainlink AggregatorV3-compatible price feed adapter.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ChainlinkPriceOracle
/// @notice Wraps a Chainlink price feed to implement IPriceOracle (8-decimal price).
contract ChainlinkPriceOracle is IPriceOracle {
    IAggregatorV3 public immutable feed;

    constructor(address _feed) {
        feed = IAggregatorV3(_feed);
    }

    function latestPrice() external view returns (uint256 price, uint256 updatedAt) {
        (uint80 _r, int256 answer, uint256 _s, uint256 updatedAtVal, uint80 _a) = feed.latestRoundData();
        require(answer >= 0, "Negative price");
        price = uint256(answer);
        updatedAt = updatedAtVal;
    }

    function getPrice() external view returns (uint256) {
        (uint256 price,) = this.latestPrice();
        return price;
    }
}
