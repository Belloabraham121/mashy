// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPriceOracle
/// @notice Returns price for the perpetual asset (e.g. ETH/USD). Price uses 8 decimals.
interface IPriceOracle {
    /// @notice Get the latest price and timestamp.
    /// @return price Price with 8 decimals (e.g. 2000e8 = $2000).
    /// @return updatedAt Timestamp when the price was last updated.
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);

    /// @notice Get the latest price (convenience).
    function getPrice() external view returns (uint256);
}
