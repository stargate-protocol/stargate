// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

// imports
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./StargateToken.sol";

// interfaces
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// libraries
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract LPStaking is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of STGs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accStargatePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accStargatePerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. STGs to distribute per block.
        uint256 lastRewardBlock; // Last block number that STGs distribution occurs.
        uint256 accStargatePerShare; // Accumulated STGs per share, times 1e12. See below.
    }
    // The STG TOKEN!
    StargateToken public stargate;
    // Block number when bonus STG period ends.
    uint256 public bonusEndBlock;
    // STG tokens created per block.
    uint256 public stargatePerBlock;
    // Bonus multiplier for early stargate makers.
    uint256 public constant BONUS_MULTIPLIER = 1;
    // Track which tokens have been added.
    mapping(address => bool) private addedLPTokens;

    mapping(uint256 => uint256) public lpBalances;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when STG mining starts.
    uint256 public startBlock;
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        StargateToken _stargate,
        uint256 _stargatePerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) {
        require(_startBlock >= block.number, "LPStaking: _startBlock must be >= current block");
        require(_bonusEndBlock >= _startBlock, "LPStaking: _bonusEndBlock must be > than _startBlock");
        require(address(_stargate) != address(0x0), "Stargate: _stargate cannot be 0x0");
        stargate = _stargate;
        stargatePerBlock = _stargatePerBlock;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /// @notice handles adding a new LP token (Can only be called by the owner)
    /// @param _allocPoint The alloc point is used as the weight of the pool against all other alloc points added.
    /// @param _lpToken The lp token address
    function add(uint256 _allocPoint, IERC20 _lpToken) public onlyOwner {
        massUpdatePools();
        require(address(_lpToken) != address(0x0), "StarGate: lpToken cant be 0x0");
        require(addedLPTokens[address(_lpToken)] == false, "StarGate: _lpToken already exists");
        addedLPTokens[address(_lpToken)] = true;
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({lpToken: _lpToken, allocPoint: _allocPoint, lastRewardBlock: lastRewardBlock, accStargatePerShare: 0}));
    }

    function set(uint256 _pid, uint256 _allocPoint) public onlyOwner {
        massUpdatePools();
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= bonusEndBlock) {
            return _to.sub(_from).mul(BONUS_MULTIPLIER);
        } else if (_from >= bonusEndBlock) {
            return _to.sub(_from);
        } else {
            return bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(_to.sub(bonusEndBlock));
        }
    }

    function pendingStargate(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accStargatePerShare = pool.accStargatePerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 stargateReward = multiplier.mul(stargatePerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accStargatePerShare = accStargatePerShare.add(stargateReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accStargatePerShare).div(1e12).sub(user.rewardDebt);
    }

    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 stargateReward = multiplier.mul(stargatePerBlock).mul(pool.allocPoint).div(totalAllocPoint);

        pool.accStargatePerShare = pool.accStargatePerShare.add(stargateReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accStargatePerShare).div(1e12).sub(user.rewardDebt);
            safeStargateTransfer(msg.sender, pending);
        }
        pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accStargatePerShare).div(1e12);
        lpBalances[_pid] = lpBalances[_pid].add(_amount);
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: _amount is too large");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accStargatePerShare).div(1e12).sub(user.rewardDebt);
        safeStargateTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accStargatePerShare).div(1e12);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        lpBalances[_pid] = lpBalances[_pid].sub(_amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    /// @notice Withdraw without caring about rewards.
    /// @param _pid The pid specifies the pool
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 userAmount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        pool.lpToken.safeTransfer(address(msg.sender), userAmount);
        lpBalances[_pid] = lpBalances[_pid].sub(userAmount);
        emit EmergencyWithdraw(msg.sender, _pid, userAmount);
    }

    /// @notice Safe transfer function, just in case if rounding error causes pool to not have enough STGs.
    /// @param _to The address to transfer tokens to
    /// @param _amount The quantity to transfer
    function safeStargateTransfer(address _to, uint256 _amount) internal {
        uint256 stargateBal = stargate.balanceOf(address(this));
        if (_amount > stargateBal) {
            IERC20(stargate).safeTransfer(_to, stargateBal);
        } else {
            IERC20(stargate).safeTransfer(_to, _amount);
        }
    }

    function setStargatePerBlock(uint256 _stargatePerBlock) external onlyOwner {
        massUpdatePools();
        stargatePerBlock = _stargatePerBlock;
    }

    // Override the renounce ownership inherited by zeppelin ownable
    function renounceOwnership() public override onlyOwner {}
}
