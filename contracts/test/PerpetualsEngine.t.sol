// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import { PerpetualsEngine } from "../src/PerpetualsEngine.sol";
import { MockPriceOracle } from "../src/mock/MockPriceOracle.sol";
import { MockUSDC } from "../src/mock/usdc.sol";

contract PerpetualsEngineTest is Test {
    MockUSDC internal collateral;
    MockPriceOracle internal oracle;
    PerpetualsEngine internal engine;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 constant PRICE_ETH = 2000e8; // $2000, 8 decimals
    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        collateral = new MockUSDC(1_000_000 * 1e6);
        oracle = new MockPriceOracle(PRICE_ETH);
        engine = new PerpetualsEngine(address(collateral), address(oracle));

        collateral.transfer(alice, 100_000 * ONE_USDC);
        collateral.transfer(bob, 100_000 * ONE_USDC);

        vm.startPrank(alice);
        collateral.approve(address(engine), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        collateral.approve(address(engine), type(uint256).max);
        vm.stopPrank();
    }

    function test_DepositWithdraw() public {
        vm.prank(alice);
        engine.deposit(1000 * ONE_USDC);
        assertEq(engine.freeMargin(alice), 1000 * ONE_USDC);

        vm.prank(alice);
        engine.withdraw(500 * ONE_USDC);
        assertEq(engine.freeMargin(alice), 500 * ONE_USDC);
    }

    function test_OpenCloseLong() public {
        vm.startPrank(alice);
        engine.deposit(10_000 * ONE_USDC);
        // Long 1 ETH notional at 10x: margin = 2000/10 = 200 USDC. size = 1e8 (1 unit at 8 decimals)
        engine.openPosition(1e8, 200 * ONE_USDC, 10);
        vm.stopPrank();

        PerpetualsEngine.Position memory pos = engine.getPosition(alice);
        assertEq(pos.size, 1e8);
        assertEq(pos.margin, 200 * ONE_USDC);

        // Price up 10%: PnL = 1 * (2200 - 2000) = 200
        oracle.setPrice(2200e8);
        vm.prank(alice);
        engine.closePosition();

        // deposit 10k, used 200 margin for position; close returns margin 200 + pnl 200 (price 2000->2200) = 400. Free = 9800 + 400 = 10200
        assertEq(engine.freeMargin(alice), 10_200 * ONE_USDC);
        assertEq(engine.getPosition(alice).leverage, 0);
    }

    function test_Liquidate() public {
        vm.startPrank(alice);
        engine.deposit(1000 * ONE_USDC);
        engine.openPosition(1e8, 500 * ONE_USDC, 10); // long 1 ETH, 500 margin
        vm.stopPrank();

        // Price drops 60%: 2000 -> 800. PnL = 1 * (800 - 2000) = -1200. Margin 500, so 500 - 1200 = -700. Maintenance 50% of 500 = 250. 500 - 1200 = -700 < 250 => liquidatable
        oracle.setPrice(800e8);
        assertTrue(engine.isLiquidatable(alice));

        vm.prank(bob);
        engine.liquidate(alice);

        assertEq(engine.getPosition(alice).leverage, 0);
        assertEq(engine.freeMargin(alice), 500 * ONE_USDC); // original deposit minus margin used; margin was seized
    }
}
