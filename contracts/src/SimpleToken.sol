// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SimpleToken
/// @notice A simple ERC20 token with mint capability and ERC-2612 permit support.
/// @dev Uses 6 decimals (USDC-style) to match perps/prediction design (MIN_MARGIN = 1e6, frontend amount * 1e6).
contract SimpleToken is ERC20, ERC20Permit, Ownable {
    uint8 private constant _DECIMALS = 6;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Mint tokens to a specified address. Only the owner can mint.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
