// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@layerzerolabs/contracts/contracts/interfaces/ILayerZeroEndpoint.sol";
import "@layerzerolabs/contracts/contracts/interfaces/ILayerZeroReceiver.sol";
import "@layerzerolabs/contracts/contracts/interfaces/ILayerZeroUserApplicationConfig.sol";

contract OmnichainFungibleToken is ERC20, Ownable, ILayerZeroReceiver, ILayerZeroUserApplicationConfig {
    // the only endpointId these tokens will ever be minted on
    // required: the LayerZero endpoint which is passed in the constructor
    ILayerZeroEndpoint immutable public endpoint;
    // a map of our connected contracts
    mapping(uint16 => bytes) public dstContractLookup;
    // pause the sendTokens()
    bool public paused;
    bool public isMain;

    event Paused(bool isPaused);
    event SendToChain(uint16 dstChainId, bytes to, uint256 qty);
    event ReceiveFromChain(uint16 srcChainId, uint64 nonce, uint256 qty);

    constructor(
        string memory _name,
        string memory _symbol,
        address _endpoint,
        uint16 _mainChainId,
        uint256 initialSupplyOnMainEndpoint
    ) ERC20(_name, _symbol) {
        if (ILayerZeroEndpoint(_endpoint).getChainId() == _mainChainId) {
            _mint(msg.sender, initialSupplyOnMainEndpoint);
            isMain = true;
        }
        // set the LayerZero endpoint
        endpoint = ILayerZeroEndpoint(_endpoint);
    }

    function pauseSendTokens(bool _pause) external onlyOwner {
        paused = _pause;
        emit Paused(_pause);
    }

    function setDestination(uint16 _dstChainId, bytes calldata _destinationContractAddress) public onlyOwner {
        dstContractLookup[_dstChainId] = _destinationContractAddress;
    }

    function chainId() external view returns (uint16){
        return endpoint.getChainId();
    }

    function sendTokens(
        uint16 _dstChainId, // send tokens to this chainId
        bytes calldata _to, // where to deliver the tokens on the destination chain
        uint256 _qty, // how many tokens to send
        address zroPaymentAddress, // ZRO payment address
        bytes calldata adapterParam // txParameters
    ) public payable {
        require(!paused, "OFT: sendTokens() is currently paused");

        // lock if leaving the safe chain, otherwise burn
        if (isMain) {
            // ... transferFrom the tokens to this contract for locking purposes
            _transfer(msg.sender, address(this), _qty);
        } else {
            _burn(msg.sender, _qty);
        }

        // abi.encode() the payload with the values to send
        bytes memory payload = abi.encode(_to, _qty);

        // send LayerZero message
        endpoint.send{value: msg.value}(
            _dstChainId, // destination chainId
            dstContractLookup[_dstChainId], // destination UA address
            payload, // abi.encode()'ed bytes
            msg.sender, // refund address (LayerZero will refund any extra gas back to caller of send()
            zroPaymentAddress, // 'zroPaymentAddress' unused for this mock/example
            adapterParam // 'adapterParameters' unused for this mock/example
        );
        emit SendToChain(_dstChainId, _to, _qty);
    }

    function lzReceive(
        uint16 _srcChainId,
        bytes memory _fromAddress,
        uint64 nonce,
        bytes memory _payload
    ) external override {
        require(msg.sender == address(endpoint)); // boilerplate! lzReceive must be called by the endpoint for security
        require(
            _fromAddress.length == dstContractLookup[_srcChainId].length && keccak256(_fromAddress) == keccak256(dstContractLookup[_srcChainId]),
            "OFT: invalid source sending contract"
        );

        // decode
        (bytes memory _to, uint256 _qty) = abi.decode(_payload, (bytes, uint256));
        address toAddress;
        // load the toAddress from the bytes
        assembly {
            toAddress := mload(add(_to, 20))
        }

        // mint the tokens back into existence, to the receiving address
        if (isMain) {
            _transfer(address(this), toAddress, _qty);
        } else {
            _mint(toAddress, _qty);
        }

        emit ReceiveFromChain(_srcChainId, nonce, _qty);
    }

    function estimateSendTokensFee(uint16 _dstChainId, bool _useZro, bytes calldata txParameters) external view returns (uint256 nativeFee, uint256 zroFee) {
        return endpoint.estimateFees(_dstChainId, address(this), bytes(""), _useZro, txParameters);
    }

    //---------------------------DAO CALL----------------------------------------
    // generic config for user Application
    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes calldata _config
    ) external override onlyOwner {
        endpoint.setConfig(_version, _chainId, _configType, _config);
    }

    function setSendVersion(uint16 version) external override onlyOwner {
        endpoint.setSendVersion(version);
    }

    function setReceiveVersion(uint16 version) external override onlyOwner {
        endpoint.setReceiveVersion(version);
    }

    function forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) external override onlyOwner {
        endpoint.forceResumeReceive(_srcChainId, _srcAddress);
    }

    function renounceOwnership() public override onlyOwner {}
}
