// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {SimpleMarket} from "../src/SimpleMarket.sol";

/// @title CreateMarkets
/// @notice Batch-create prediction markets on an existing SimpleMarket contract.
///
/// Usage (single market, question from env):
///   QUESTION="Will ETH hit $10k by Q2 2026?" \
///     forge script script/CreateMarkets.s.sol:CreateMarkets --rpc-url $RPC_URL --broadcast
///
/// Usage (batch — creates a preset list of markets when QUESTION is not set):
///   forge script script/CreateMarkets.s.sol:CreateMarkets --rpc-url $RPC_URL --broadcast
///
/// Env:
///   PRIVATE_KEY       — caller EOA private key (required)
///   MARKET            — SimpleMarket address (optional; falls back to deployments/<chainId>.json)
///   QUESTION          — single question to create (optional; if unset, creates batch)
///   DURATION_DAYS     — how many days markets stay open (optional; default 30)
contract CreateMarkets is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        address marketAddr = vm.envOr("MARKET", address(0));
        if (marketAddr == address(0)) {
            string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
            string memory json = vm.readFile(path);
            marketAddr = vm.parseJsonAddress(json, ".simpleMarket");
            console2.log("Loaded SimpleMarket from", path, ":", marketAddr);
        }

        uint256 durationDays = vm.envOr("DURATION_DAYS", uint256(30));
        uint256 duration = durationDays * 8 days;

        SimpleMarket market = SimpleMarket(marketAddr);
        string memory singleQ = vm.envOr("QUESTION", string(""));

        vm.startBroadcast(pk);

        if (bytes(singleQ).length > 0) {
            uint256 id = market.newMarket(singleQ, duration);
            console2.log("Created market", id);
            console2.log("  Question:", singleQ);
            console2.log("  Open for:", durationDays, "days");
        } else {
            _createBatch(market, duration, durationDays);
        }

        vm.stopBroadcast();
    }

    function _createBatch(SimpleMarket market, uint256 duration, uint256 durationDays) internal {
        string[8] memory questions = [
            "ETH above $10k by Q2 2026?",
            "Avalanche TVL above $10B by EOY?",
            "BTC 5 Minute Up or Down?",
            "DeFi yield protocols surge 2x?",
            "Fed cuts rates before July?",
            "GPT-5 released before June 2026?",
            "SOL flips ETH market cap?",
            "Will Crude Oil hit $120 by end of March?"
        ];

        console2.log("Creating %d markets (open for %d days each)...", questions.length, durationDays);
        console2.log("---");

        for (uint256 i = 0; i < questions.length; i++) {
            uint256 id = market.newMarket(questions[i], duration);
            console2.log("Market", id, ":", questions[i]);
        }

        console2.log("---");
        console2.log("Done.");
    }
}
