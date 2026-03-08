// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IPriceOracle } from "../interfaces/IPriceOracle.sol";

/// @notice Mock price oracle for testing. Owner can set price and updatedAt.
contract MockPriceOracle is IPriceOracle {
    uint256 private _price;
    uint256 private _updatedAt;

    constructor(uint256 initialPrice) {
        _price = initialPrice;
        _updatedAt = block.timestamp;
    }

    function setPrice(uint256 price) external {
        _price = price;
        _updatedAt = block.timestamp;
    }

    function latestPrice() external view returns (uint256 price, uint256 updatedAt) {
        return (_price, _updatedAt);
    }

    function getPrice() external view returns (uint256) {
        return _price;
    }
}
