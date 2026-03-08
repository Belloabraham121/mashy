// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { PolicyEngine } from "@chainlink/policy-management/core/PolicyEngine.sol";
import { SimpleToken } from "../src/SimpleToken.sol";
import { SimpleMarket } from "../src/SimpleMarket.sol";
import { PerpetualsEngine } from "../src/PerpetualsEngine.sol";
import { ChainlinkPriceOracle } from "../src/ChainlinkPriceOracle.sol";
import { MockPriceOracle } from "../src/mock/MockPriceOracle.sol";

interface IVault {
    function register(address token, address policyEngine) external;
}

/// @title DeployAll
/// @notice Deploys payment token (or uses existing), PolicyEngine, SimpleMarket, price oracle, PerpetualsEngine.
///         Optionally registers token + PolicyEngine with an existing Vault.
///         Writes deployment addresses to deployments/<chainId>.json.
///
/// Env: PRIVATE_KEY (required), RPC_URL for forge. Optional: PAYMENT_TOKEN, VAULT_ADDRESS,
///      CRE_FORWARDER_ADDRESS, CHAINLINK_PRICE_FEED_ADDRESS, MOCK_ORACLE_INITIAL_PRICE.
///      Only set VAULT_ADDRESS if your PolicyEngine implements the Vault's callback (e.g. attach());
///      the Chainlink ACE PolicyEngine does not, so registration with the Compliant Private Token
///      demo vault will revert. Deploy without VAULT_ADDRESS then register manually if needed.
contract DeployAll is Script {
    uint256 constant DEFAULT_MOCK_PRICE = 2000e8;
    uint256 constant SEPOLIA_CHAIN_ID = 11155111;
    address constant SEPOLIA_DEMO_VAULT = 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13;

    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);
        uint256 chainId = block.chainid;

        address paymentToken;
        address policyEngineProxy;
        address policyEngineImpl;
        address simpleMarket;
        address priceOracle;
        address perpsEngine;
        address vaultAddr = address(0);

        vm.startBroadcast(deployerPK);

        // 1) Payment token: use existing or deploy SimpleToken
        if (vm.envOr("PAYMENT_TOKEN", address(0)) != address(0)) {
            paymentToken = vm.envAddress("PAYMENT_TOKEN");
            console.log("Using existing PAYMENT_TOKEN:", paymentToken);
        } else {
            SimpleToken token = new SimpleToken("PivateUSDC", "pUSD", deployer);
            token.mint(deployer, 1000 ether);
            paymentToken = address(token);
            console.log("Deployed SimpleToken:", paymentToken);
        }

        // 2) PolicyEngine (implementation + proxy)
        PolicyEngine impl = new PolicyEngine();
        policyEngineImpl = address(impl);
        bytes memory initData = abi.encodeWithSelector(
            PolicyEngine.initialize.selector,
            true,
            deployer
        );
        ERC1967Proxy proxy = new ERC1967Proxy(policyEngineImpl, initData);
        policyEngineProxy = address(proxy);
        console.log("PolicyEngine proxy:", policyEngineProxy);

        // 3) Optional: register token + PolicyEngine on Vault (only if VAULT_ADDRESS is set)
        // Note: Compliant Private Token vaults call attach() on the PolicyEngine; Chainlink ACE PolicyEngine
        // does not implement it, so registration with the demo vault will revert. Omit VAULT_ADDRESS to skip.
        address vaultEnv = vm.envOr("VAULT_ADDRESS", address(0));
        if (vaultEnv != address(0)) {
            IVault(vaultEnv).register(paymentToken, policyEngineProxy);
            vaultAddr = vaultEnv;
            console.log("Registered on Vault:", vaultEnv);
        }

        // 4) SimpleMarket (payment token + CRE forwarder)
        address forwarder = vm.envOr(
            "CRE_FORWARDER_ADDRESS",
            address(0x15fC6ae953E024d975e77382eEeC56A9101f9F88)
        );
        SimpleMarket market = new SimpleMarket(paymentToken, forwarder);
        simpleMarket = address(market);
        console.log("SimpleMarket:", simpleMarket);

        // 5) Price oracle: Chainlink feed adapter or Mock
        if (vm.envOr("CHAINLINK_PRICE_FEED_ADDRESS", address(0)) != address(0)) {
            address feed = vm.envAddress("CHAINLINK_PRICE_FEED_ADDRESS");
            ChainlinkPriceOracle oracle = new ChainlinkPriceOracle(feed);
            priceOracle = address(oracle);
            console.log("ChainlinkPriceOracle:", priceOracle);
        } else {
            uint256 initialPrice = vm.envOr("MOCK_ORACLE_INITIAL_PRICE", DEFAULT_MOCK_PRICE);
            MockPriceOracle mock = new MockPriceOracle(initialPrice);
            priceOracle = address(mock);
            console.log("MockPriceOracle:", priceOracle);
        }

        // 6) PerpetualsEngine (collateral token = payment token, price oracle)
        PerpetualsEngine engine = new PerpetualsEngine(paymentToken, priceOracle);
        perpsEngine = address(engine);
        console.log("PerpetualsEngine:", perpsEngine);

        vm.stopBroadcast();

        // Vault in JSON: use registered vault, or on Sepolia the demo vault for reference (script does not call register)
        address vaultForJson = vaultAddr;
        if (vaultForJson == address(0) && chainId == SEPOLIA_CHAIN_ID) {
            vaultForJson = SEPOLIA_DEMO_VAULT;
        }

        // Write deployments/<chainId>.json
        string memory path = string.concat("deployments/", vm.toString(chainId), ".json");
        string memory json = string.concat(
            "{",
            "\"chainId\":", vm.toString(chainId), ",",
            "\"paymentToken\":\"", vm.toString(paymentToken), "\",",
            "\"policyEngine\":\"", vm.toString(policyEngineProxy), "\",",
            "\"policyEngineImpl\":\"", vm.toString(policyEngineImpl), "\",",
            "\"simpleMarket\":\"", vm.toString(simpleMarket), "\",",
            "\"priceOracle\":\"", vm.toString(priceOracle), "\",",
            "\"perpsEngine\":\"", vm.toString(perpsEngine), "\",",
            "\"vault\":\"", vm.toString(vaultForJson), "\"",
            "}"
        );
        vm.writeFile(path, json);
        console.log("Wrote", path);
    }
}
