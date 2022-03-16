// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/IStargateReceiver.sol";
import "../interfaces/IStargateRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

contract LoopBackMock is IStargateReceiver {
    IStargateRouter public immutable router;

    event LoopBack(bytes srcAddress, uint256 srcPoolId, uint256 dstPoolId, uint256 amount);

    constructor(address _router) {
        router = IStargateRouter(_router);
    }

    bool paused;

    function sgReceive(
        uint16 _chainId,
        bytes memory _srcAddress,
        uint256, /*_nonce*/
        address _token,
        uint256 amountLD,
        bytes memory payload
    ) external override {
        require(!paused, "Failed sgReceive due to pause");

        require(msg.sender == address(router), "only router");
        uint256 halfAmount = amountLD / 2;
        bytes memory srcAddress = _srcAddress;

        // approve the router to spend the halfAmount;
        IERC20(_token).approve(address(router), halfAmount);
        IStargateRouter.lzTxObj memory txObj = IStargateRouter.lzTxObj(500000, 0, "");
        (uint256 srcPoolId, uint256 dstPoolId) = abi.decode(payload, (uint256, uint256));

        (uint256 nativeFee, ) = router.quoteLayerZeroFee(_chainId, 1, srcAddress, "", txObj);
        router.swap{value: nativeFee}(_chainId, srcPoolId, dstPoolId, address(this), halfAmount, 0, txObj, srcAddress, bytes("0x"));

        emit LoopBack(srcAddress, srcPoolId, dstPoolId, halfAmount);
    }

    function pause(bool _paused) external {
        paused = _paused;
    }

    // be able to receive ether
    fallback() external payable {}

    receive() external payable {}
}
