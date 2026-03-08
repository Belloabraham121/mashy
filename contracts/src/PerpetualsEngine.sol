// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPriceOracle } from "./interfaces/IPriceOracle.sol";

/// @title PerpetualsEngine
/// @notice In-house perpetuals (futures) engine: positions, margin, funding, liquidation.
/// @dev Single market (one asset, e.g. ETH). Price from oracle (e.g. Chainlink).
contract PerpetualsEngine {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant PRICE_DECIMALS = 8;
    /// @dev Factor to convert PnL (8 decimals) to collateral token units (e.g. 6 decimals) = 10^(8-6)=100
    uint256 public constant PNL_TO_COLLATERAL = 100;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_LEVERAGE = 100;
    uint256 public constant MIN_MARGIN = 1e6; // 1 USDC (6 decimals) or similar
    /// @dev Maintenance margin: position can be liquidated when margin + PnL < margin * MAINTENANCE_BPS / BPS
    uint256 public constant MAINTENANCE_BPS = 5_000; // 50%

    // ============ Events ============
    event PositionOpened(address indexed user, int256 size, uint256 margin, uint256 entryPrice, uint256 leverage);
    event PositionClosed(address indexed user, int256 size, uint256 marginReturned, int256 pnl);
    event PositionLiquidated(address indexed user, address indexed liquidator, int256 size, uint256 marginSeized);
    event FundingRateUpdated(int256 fundingRateBps);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    // ============ Errors ============
    error ZeroAmount();
    error InvalidLeverage(uint256 leverage);
    error InsufficientMargin();
    error NoPosition();
    error PositionHealthy();
    error StalePrice(uint256 updatedAt, uint256 maxAge);
    error TransferFailed();

    // ============ Structs ============
    struct Position {
        int256 size;           // Asset units (1e8). Positive = long, negative = short
        uint256 margin;        // Collateral in collateral token decimals
        uint256 entryPrice;    // 8 decimals
        uint256 leverage;      // e.g. 10 = 10x
        uint256 lastFundingAt; // Timestamp of last funding applied
    }

    // ============ State ============
    IERC20 public immutable collateralToken;
    IPriceOracle public immutable priceOracle;

    /// @notice Max age of oracle price (seconds). Reject open/close if price older than this.
    uint256 public maxPriceAge = 60;

    /// @notice Funding rate in basis points per hour (positive = longs pay shorts). Can be set by owner or from CRE.
    int256 public fundingRateBps;

    mapping(address => Position) public positions;
    mapping(address => uint256) public freeMargin; // Margin not in a position (for multi-position later)

    address public owner;

    // ============ Constructor ============
    constructor(address _collateralToken, address _priceOracle) {
        if (_collateralToken == address(0) || _priceOracle == address(0)) revert ZeroAmount();
        collateralToken = IERC20(_collateralToken);
        priceOracle = IPriceOracle(_priceOracle);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Oracle ============
    function _getPrice() internal view returns (uint256 price, uint256 updatedAt) {
        (price, updatedAt) = priceOracle.latestPrice();
        if (updatedAt == 0) return (price, updatedAt);
        if (block.timestamp > updatedAt && block.timestamp - updatedAt > maxPriceAge) {
            revert StalePrice(updatedAt, maxPriceAge);
        }
    }

    // ============ Margin ============
    /// @notice Deposit collateral as free margin (or to top up before opening position).
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        freeMargin[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw free margin. Cannot withdraw margin that is in a position.
    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeMargin[msg.sender]) revert InsufficientMargin();
        freeMargin[msg.sender] -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ============ Open / Close ============
    /// @notice Open or increase a position. Uses free margin; pulls from sender if not enough.
    /// @param size Asset amount in 1e8 (positive = long, negative = short).
    /// @param margin Collateral amount (token decimals).
    /// @param leverage Leverage (1 to MAX_LEVERAGE).
    function openPosition(int256 size, uint256 margin, uint256 leverage) external {
        if (margin < MIN_MARGIN) revert InsufficientMargin();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage(leverage);
        if (size == 0) revert ZeroAmount();

        (uint256 price, ) = _getPrice();

        // Pull margin if needed
        if (freeMargin[msg.sender] < margin) {
            uint256 need = margin - freeMargin[msg.sender];
            collateralToken.safeTransferFrom(msg.sender, address(this), need);
            freeMargin[msg.sender] += need;
        }
        freeMargin[msg.sender] -= margin;

        Position storage pos = positions[msg.sender];
        if (pos.leverage == 0) {
            pos.size = size;
            pos.margin = margin;
            pos.entryPrice = price;
            pos.leverage = leverage;
            pos.lastFundingAt = block.timestamp;
        } else {
            // Increase position: volume-weighted average entry
            uint256 prevNotional = _abs(pos.size) * pos.entryPrice / (10 ** PRICE_DECIMALS);
            uint256 addNotional = _abs(size) * price / (10 ** PRICE_DECIMALS);
            pos.entryPrice = (prevNotional * pos.entryPrice + addNotional * price) / (prevNotional + addNotional);
            pos.size += size;
            pos.margin += margin;
            pos.leverage = (pos.leverage + leverage) / 2; // Simple average
            pos.lastFundingAt = block.timestamp;
        }

        emit PositionOpened(msg.sender, pos.size, pos.margin, pos.entryPrice, pos.leverage);
    }

    /// @notice Close the entire position. Settles PnL and returns margin + PnL to user (or liquidatable if negative).
    function closePosition() external {
        Position storage pos = positions[msg.sender];
        if (pos.leverage == 0) revert NoPosition();

        (uint256 price, ) = _getPrice();
        int256 pnl = _computePnL(pos.size, pos.entryPrice, price);
        uint256 pnlCollateral = pnl >= 0 ? uint256(pnl) / PNL_TO_COLLATERAL : uint256(-pnl) / PNL_TO_COLLATERAL;
        uint256 marginReturned;
        if (pnl >= 0) {
            marginReturned = pos.margin + pnlCollateral;
        } else {
            if (pos.margin <= pnlCollateral) {
                marginReturned = 0;
            } else {
                marginReturned = pos.margin - pnlCollateral;
            }
        }

        int256 size = pos.size;
        pos.size = 0;
        pos.margin = 0;
        pos.leverage = 0;
        pos.entryPrice = 0;
        pos.lastFundingAt = 0;

        if (marginReturned > 0) {
            freeMargin[msg.sender] += marginReturned;
            collateralToken.safeTransfer(msg.sender, marginReturned);
        }
        emit PositionClosed(msg.sender, size, marginReturned, pnl);
    }

    /// @notice Liquidate an underwater position. Liquidator receives a fraction of margin (incentive).
    function liquidate(address user) external {
        Position storage pos = positions[user];
        if (pos.leverage == 0) revert NoPosition();

        (uint256 price, ) = _getPrice();
        int256 pnl = _computePnL(pos.size, pos.entryPrice, price);
        uint256 pnlCollateral = pnl >= 0 ? uint256(pnl) / PNL_TO_COLLATERAL : uint256(-pnl) / PNL_TO_COLLATERAL;
        uint256 maintenance = pos.margin * MAINTENANCE_BPS / BPS;
        uint256 marginAfterPnL = pnl >= 0 ? pos.margin + pnlCollateral : (pos.margin > pnlCollateral ? pos.margin - pnlCollateral : 0);
        if (marginAfterPnL >= maintenance) revert PositionHealthy();

        uint256 marginSeized = pos.margin;
        int256 size = pos.size;
        pos.size = 0;
        pos.margin = 0;
        pos.leverage = 0;
        pos.entryPrice = 0;
        pos.lastFundingAt = 0;

        // Liquidator gets 10% of seized margin as incentive; rest stays in contract (or could burn)
        uint256 liquidatorReward = marginSeized * 1_000 / BPS; // 10% (1000 bps)
        if (liquidatorReward > 0) {
            collateralToken.safeTransfer(msg.sender, liquidatorReward);
        }
        emit PositionLiquidated(user, msg.sender, size, marginSeized);
    }

    // ============ Funding ============
    /// @notice Apply funding to a position (anyone can call). Simple model: fundingRateBps per hour.
    function applyFunding(address user) external {
        Position storage pos = positions[user];
        if (pos.leverage == 0) return;
        uint256 elapsed = block.timestamp - pos.lastFundingAt;
        if (elapsed == 0) return;
        // funding: positive rate = longs pay shorts. Position size > 0 (long) pays when rate > 0.
        int256 funding = int256(_abs(pos.size) * pos.entryPrice / (10 ** PRICE_DECIMALS)) * fundingRateBps * int256(elapsed) / (3600 * int256(BPS));
        if (funding > 0) {
            // Long pays: reduce margin
            if (uint256(funding) >= pos.margin) pos.margin = 0;
            else pos.margin -= uint256(funding);
        } else {
            pos.margin += uint256(-funding);
        }
        pos.lastFundingAt = block.timestamp;
    }

    // ============ View ============
    function getPosition(address user) external view returns (Position memory) {
        return positions[user];
    }

    /// @notice Current unrealized PnL for a position (before funding in this block).
    function getUnrealizedPnL(address user) external view returns (int256) {
        Position storage pos = positions[user];
        if (pos.leverage == 0) return 0;
        (uint256 price, ) = priceOracle.latestPrice();
        return _computePnL(pos.size, pos.entryPrice, price);
    }

    /// @notice Whether the position is liquidatable (margin + PnL < maintenance).
    function isLiquidatable(address user) external view returns (bool) {
        Position storage pos = positions[user];
        if (pos.leverage == 0) return false;
        (uint256 price, ) = priceOracle.latestPrice();
        int256 pnl = _computePnL(pos.size, pos.entryPrice, price);
        uint256 maintenance = pos.margin * MAINTENANCE_BPS / BPS;
        return int256(pos.margin) + pnl < int256(maintenance);
    }

    // ============ Internal ============
    function _computePnL(int256 size, uint256 entryPrice, uint256 currentPrice) internal pure returns (int256) {
        int256 diff = int256(currentPrice) - int256(entryPrice); // long profits when current > entry
        if (size > 0) {
            return int256(uint256(size)) * diff / int256(10 ** PRICE_DECIMALS);
        }
        // Short: size negative, profit when current < entry so diff negative, (-size)*diff positive
        return int256(uint256(-size)) * (-diff) / int256(10 ** PRICE_DECIMALS);
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    // ============ Admin ============
    function setMaxPriceAge(uint256 _maxPriceAge) external onlyOwner {
        maxPriceAge = _maxPriceAge;
    }

    function setFundingRateBps(int256 _fundingRateBps) external onlyOwner {
        fundingRateBps = _fundingRateBps;
        emit FundingRateUpdated(_fundingRateBps);
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
    }
}
