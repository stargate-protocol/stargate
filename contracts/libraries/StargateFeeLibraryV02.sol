// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/IStargateFeeLibrary.sol";
import "../Pool.sol";
import "../Factory.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StargateFeeLibraryV02 is IStargateFeeLibrary, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    //---------------------------------------------------------------------------
    // VARIABLES

    // equilibrium func params. all in BPs * 10 ^ 2, i.e. 1 % = 10 ^ 6 units
    uint256 public constant DENOMINATOR = 1e18;
    uint256 public constant DELTA_1 = 6000 * 1e14;
    uint256 public constant DELTA_2 = 500 * 1e14;
    uint256 public constant LAMBDA_1 = 40 * 1e14;
    uint256 public constant LAMBDA_2 = 9960 * 1e14;
    uint256 public constant LP_FEE = 45 * 1e13;
    uint256 public constant PROTOCOL_FEE = 15 * 1e13;
    uint256 public constant PROTOCOL_SUBSIDY = 3 * 1e13;

    Factory public immutable factory;

    constructor(address _factory) {
        require(_factory != address(0x0), "FeeLibrary: Factory cannot be 0x0");
        factory = Factory(_factory);
    }

    function getFees(
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        uint16 _dstChainId,
        address, /*_from*/
        uint256 _amountSD
    ) external view override returns (Pool.SwapObj memory s) {
        // calculate the protocol fee
        s.protocolFee = _amountSD.mul(PROTOCOL_FEE).div(DENOMINATOR);

        // calculate the equilibrium Fee
        Pool pool = factory.getPool(_srcPoolId);
        Pool.ChainPath memory chainPath = pool.getChainPath(_dstChainId, _dstPoolId);

        // calculate the equilibrium fee
        (uint256 eqFee, uint256 protocolSubsidy) = _getEquilibriumFee(chainPath.idealBalance, chainPath.balance, _amountSD);
        s.eqFee = eqFee;
        s.protocolFee = s.protocolFee.sub(protocolSubsidy);

        // calculate the equilibrium reward
        address tokenAddress = pool.token();
        uint256 currentAssetSD = IERC20(tokenAddress).balanceOf(address(pool)).div(pool.convertRate());
        uint256 lpAsset = pool.totalLiquidity();
        if (lpAsset > currentAssetSD) {
            // in deficit
            uint256 poolDeficit = lpAsset.sub(currentAssetSD);
            uint256 rewardPoolSize = pool.eqFeePool();
            // reward capped at rewardPoolSize
            uint256 eqRewards = rewardPoolSize.mul(_amountSD).div(poolDeficit);
            if (eqRewards > rewardPoolSize) {
                eqRewards = rewardPoolSize;
            }
            s.eqReward = eqRewards;
        }

        // calculate the LP fee.
        s.lpFee = _amountSD.mul(LP_FEE).div(DENOMINATOR);

        return s;
    }

    function getEquilibriumFee(
        uint256 idealBalance,
        uint256 beforeBalance,
        uint256 amountSD
    ) external pure returns (uint256, uint256) {
        return _getEquilibriumFee(idealBalance, beforeBalance, amountSD);
    }

    function getTrapezoidArea(
        uint256 lambda,
        uint256 yOffset,
        uint256 xUpperBound,
        uint256 xLowerBound,
        uint256 xStart,
        uint256 xEnd
    ) external pure returns (uint256) {
        return _getTrapezoidArea(lambda, yOffset, xUpperBound, xLowerBound, xStart, xEnd);
    }

    function _getEquilibriumFee(
        uint256 idealBalance,
        uint256 beforeBalance,
        uint256 amountSD
    ) internal pure returns (uint256, uint256) {
        require(beforeBalance >= amountSD, "Stargate: not enough balance");
        uint256 afterBalance = beforeBalance.sub(amountSD);

        uint256 safeZoneMax = idealBalance.mul(DELTA_1).div(DENOMINATOR);
        uint256 safeZoneMin = idealBalance.mul(DELTA_2).div(DENOMINATOR);

        uint256 eqFee = 0;
        uint256 protocolSubsidy = 0;

        if (afterBalance >= safeZoneMax) {
            // no fee zone, protocol subsidize it.
            eqFee = amountSD.mul(PROTOCOL_SUBSIDY).div(DENOMINATOR);
            protocolSubsidy = eqFee;
        } else if (afterBalance >= safeZoneMin) {
            // safe zone
            uint256 proxyBeforeBalance = beforeBalance < safeZoneMax ? beforeBalance : safeZoneMax;
            eqFee = _getTrapezoidArea(LAMBDA_1, 0, safeZoneMax, safeZoneMin, proxyBeforeBalance, afterBalance);
        } else {
            // danger zone
            if (beforeBalance >= safeZoneMin) {
                // across 2 or 3 zones
                // part 1
                uint256 proxyBeforeBalance = beforeBalance < safeZoneMax ? beforeBalance : safeZoneMax;
                eqFee = eqFee.add(_getTrapezoidArea(LAMBDA_1, 0, safeZoneMax, safeZoneMin, proxyBeforeBalance, safeZoneMin));
                // part 2
                eqFee = eqFee.add(_getTrapezoidArea(LAMBDA_2, LAMBDA_1, safeZoneMin, 0, safeZoneMin, afterBalance));
            } else {
                // only in danger zone
                // part 2 only
                eqFee = eqFee.add(_getTrapezoidArea(LAMBDA_2, LAMBDA_1, safeZoneMin, 0, beforeBalance, afterBalance));
            }
        }
        return (eqFee, protocolSubsidy);
    }

    function _getTrapezoidArea(
        uint256 lambda,
        uint256 yOffset,
        uint256 xUpperBound,
        uint256 xLowerBound,
        uint256 xStart,
        uint256 xEnd
    ) internal pure returns (uint256) {
        require(xEnd >= xLowerBound && xStart <= xUpperBound, "Stargate: balance out of bound");
        uint256 xBoundWidth = xUpperBound.sub(xLowerBound);

        // xStartDrift = xUpperBound.sub(xStart);
        uint256 yStart = xUpperBound.sub(xStart).mul(lambda).div(xBoundWidth).add(yOffset);

        // xEndDrift = xUpperBound.sub(xEnd)
        uint256 yEnd = xUpperBound.sub(xEnd).mul(lambda).div(xBoundWidth).add(yOffset);

        // compute the area
        uint256 deltaX = xStart.sub(xEnd);
        return yStart.add(yEnd).mul(deltaX).div(2).div(DENOMINATOR);
    }

    function getVersion() external pure override returns (string memory) {
        return "2.0.0";
    }
}
