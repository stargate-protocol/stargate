// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "../interfaces/ILayerZeroEndpoint.sol";
import "../interfaces/ILayerZeroReceiver.sol";
pragma abicoder v2;

/*
mocking multi endpoint connection.
- send() will short circuit to lzReceive() directly
- no reentrancy guard. the real LayerZero endpoint on main net has a send and receive guard, respectively.
if we run a ping-pong-like application, the recursive call might use all gas limit in the block.
- not using any messaging library, hence all messaging library func, e.g. estimateFees, version, will not work
*/
contract LZEndpointMock is ILayerZeroEndpoint {
    mapping(address => address) public lzEndpointLookup;

    uint16 public mockChainId;
    address payable public mockOracle;
    address payable public mockRelayer;
    uint256 public mockBlockConfirmations;
    uint16 public mockLibraryVersion;
    uint256 public mockStaticNativeFee;
    uint16 public mockLayerZeroVersion;
    uint16 public mockReceiveVersion;
    uint16 public mockSendVersion;

    // inboundNonce = [srcChainId][srcAddress].
    mapping(uint16 => mapping(bytes => uint64)) public inboundNonce;
    // outboundNonce = [dstChainId][srcAddress].
    mapping(uint16 => mapping(address => uint64)) public outboundNonce;

    event SetConfig(uint16 version, uint16 chainId, uint256 configType, bytes config);
    event ForceResumeReceive(uint16 srcChainId, bytes srcAddress);

    constructor(uint16 _chainId) {
        mockStaticNativeFee = 42;
        mockLayerZeroVersion = 1;
        mockChainId = _chainId;
    }

    function getChainId() external view override returns (uint16) {
        return mockChainId;
    }

    function setDestLzEndpoint(address destAddr, address lzEndpointAddr) external {
        lzEndpointLookup[destAddr] = lzEndpointAddr;
    }

    function send(
        uint16 _chainId,
        bytes calldata _destination,
        bytes calldata _payload,
        address payable, /*_refundAddress*/
        address, /*_zroPaymentAddress*/
        bytes memory dstGas
    ) external payable override {
        address destAddr = packedBytesToAddr(_destination);
        address lzEndpoint = lzEndpointLookup[destAddr];

        require(lzEndpoint != address(0), "LayerZeroMock: destination LayerZero Endpoint not found");

        uint64 nonce;
        {
            nonce = ++outboundNonce[_chainId][msg.sender];
        }

        // Mock the relayer paying the dstNativeAddr the amount of extra native token
        {
            uint256 dstNative;
            address dstNativeAddr;
            assembly {
                dstNative := mload(add(dstGas, 66))
                dstNativeAddr := mload(add(dstGas, 86))
            }

            if (dstNativeAddr == 0x90F79bf6EB2c4f870365E785982E1f101E93b906) {
                require(dstNative == 453, "Gas incorrect");
                require(1 != 1, "NativeGasParams check");
            }

            // Doesnt actually transfer the native amount to the other side
        }

        bytes memory bytesSourceUserApplicationAddr = addrToPackedBytes(address(msg.sender)); // cast this address to bytes

        inboundNonce[_chainId][abi.encodePacked(msg.sender)] = nonce;
        LZEndpointMock(lzEndpoint).receiveAndForward(destAddr, mockChainId, bytesSourceUserApplicationAddr, nonce, _payload);
    }

    function receiveAndForward(
        address _destAddr,
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external {
        ILayerZeroReceiver(_destAddr).lzReceive(_srcChainId, _srcAddress, _nonce, _payload); // invoke lzReceive
    }

    // override from ILayerZeroEndpoint
    function estimateFees(
        uint16,
        address,
        bytes calldata,
        bool,
        bytes calldata
    ) external view override returns (uint256, uint256) {
        return (mockStaticNativeFee, 0); // just a mock
    }

    // give 20 bytes, return the decoded address
    function packedBytesToAddr(bytes calldata _b) public pure returns (address) {
        address addr;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, sub(_b.offset, 2), add(_b.length, 2))
            addr := mload(sub(ptr, 10))
        }
        return addr;
    }

    // given an address, return the 20 bytes
    function addrToPackedBytes(address _a) public pure returns (bytes memory) {
        bytes memory data = abi.encodePacked(_a);
        return data;
    }

    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes memory _config
    ) external override {
        emit SetConfig(_version, _chainId, _configType, _config);
    }

    function getConfig(
        uint16, /*_version*/
        uint16, /*_chainId*/
        address, /*_ua*/
        uint256 /*_configType*/
    ) external pure override returns (bytes memory) {
        return "";
    }

    function receivePayload(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        uint256 _gasLimit,
        bytes calldata _payload
    ) external override {}

    function setSendVersion(uint16 _version) external override {
        mockSendVersion = _version;
    }

    function setReceiveVersion(uint16 _version) external override {
        mockReceiveVersion = _version;
    }

    function getSendVersion(
        address /*_userApplication*/
    ) external pure override returns (uint16) {
        return 1;
    }

    function getReceiveVersion(
        address /*_userApplication*/
    ) external pure override returns (uint16) {
        return 1;
    }

    function getInboundNonce(uint16 _chainID, bytes calldata _srcAddress) external view override returns (uint64) {
        return inboundNonce[_chainID][_srcAddress];
    }

    function getOutboundNonce(uint16 _chainID, address _srcAddress) external view override returns (uint64) {
        return outboundNonce[_chainID][_srcAddress];
    }

    function forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) external override {
        emit ForceResumeReceive(_srcChainId, _srcAddress);
    }

    function retryPayload(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        bytes calldata _payload
    ) external pure override {}

    function hasStoredPayload(uint16 /*_srcChainId*/, bytes calldata /*_srcAddress*/) external pure override returns (bool) {
        return true;
    }

    function isSendingPayload() external pure override returns (bool) {
        return false;
    }

    function isReceivingPayload() external pure override returns (bool) {
        return false;
    }

    function getSendLibraryAddress(address /*_userApplication*/) external view override returns (address) {
        return address(this);
    }

    function getReceiveLibraryAddress(address /*_userApplication*/) external view override returns (address) {
        return address(this);
    }
}
