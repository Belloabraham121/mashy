// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {SimpleToken} from "../src/SimpleToken.sol";

/// @title MintUSDC
/// @notice Mint mock USDC (SimpleToken) to any address.
///
/// Required env vars:
///   PRIVATE_KEY    — deployer private key (must be the SimpleToken owner)
///   MINT_TO        — recipient address
///
/// Optional env vars:
///   TOKEN_ADDRESS  — deployed SimpleToken address (auto-reads from deployments/<chainId>.json if not set)
///   AMOUNT         — amount in human-readable USDC units (default: 10000)
///                    The script multiplies by 1e6 to match the frontend's 6-decimal convention.
///
/// Example:
///   MINT_TO=0xYourAddress AMOUNT=5000 forge script script/MintUSDC.s.sol \
///     --rpc-url $RPC_URL --broadcast
contract MintUSDC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address mintTo = vm.envAddress("MINT_TO");
        uint256 humanAmount = vm.envOr("AMOUNT", uint256(10000));
        uint256 rawAmount = humanAmount * 1e6;

        address tokenAddr = _resolveToken();
        SimpleToken token = SimpleToken(tokenAddr);

        console2.log("=== Mint Mock USDC ===");
        console2.log("Token:", tokenAddr);
        console2.log("Mint to:", mintTo);
        console2.log("Amount (human):", humanAmount, "USDC");
        console2.log("Amount (raw):", rawAmount);

        vm.startBroadcast(pk);
        token.mint(mintTo, rawAmount);
        vm.stopBroadcast();

        console2.log("------------------------------");
        console2.log("Successfully minted to", mintTo);
        console2.log("------------------------------");
    }

    function _resolveToken() internal view returns (address) {
        address envAddr = vm.envOr("TOKEN_ADDRESS", address(0));
        if (envAddr != address(0)) return envAddr;

        uint256 chainId = block.chainid;
        string memory path = string.concat("deployments/", vm.toString(chainId), ".json");
        string memory json = vm.readFile(path);
        return vm.parseJsonAddress(json, ".paymentToken");
    }
}
