// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Pool.sol";

contract Factory is Ownable {
    using SafeMath for uint256;

    //---------------------------------------------------------------------------
    // VARIABLES
    mapping(uint256 => Pool) public getPool; // poolId -> PoolInfo
    address[] public allPools;
    address public immutable router;
    address public defaultFeeLibrary; // address for retrieving fee params for swaps

    //---------------------------------------------------------------------------
    // MODIFIERS
    modifier onlyRouter() {
        require(msg.sender == router, "Stargate: caller must be Router.");
        _;
    }

    constructor(address _router) {
        require(_router != address(0x0), "Stargate: _router cant be 0x0"); // 1 time only
        router = _router;
    }

    function setDefaultFeeLibrary(address _defaultFeeLibrary) external onlyOwner {
        require(_defaultFeeLibrary != address(0x0), "Stargate: fee library cant be 0x0");
        defaultFeeLibrary = _defaultFeeLibrary;
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    function createPool(
        uint256 _poolId,
        address _token,
        uint8 _sharedDecimals,
        uint8 _localDecimals,
        string memory _name,
        string memory _symbol
    ) public onlyRouter returns (address poolAddress) {
        require(address(getPool[_poolId]) == address(0x0), "Stargate: Pool already created");

        Pool pool = new Pool(_poolId, router, _token, _sharedDecimals, _localDecimals, defaultFeeLibrary, _name, _symbol);
        getPool[_poolId] = pool;
        poolAddress = address(pool);
        allPools.push(poolAddress);
    }

    function renounceOwnership() public override onlyOwner {}
}
