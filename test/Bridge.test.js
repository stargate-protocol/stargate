const { expect } = require("chai")
const { ethers } = require("hardhat")
const { TYPE_SWAP_REMOTE, TYPE_ADD_LIQUIDITY, TYPE_REDEEM_LOCAL_CALL_BACK, TYPE_WITHDRAW_REMOTE, ZERO_ADDRESS } = require("./util/constants")
const { callAsContract, getAddr, deployNew, encodeParams } = require("./util/helpers")

describe("Bridge:", function () {
    let owner, alice, badUser1, fakeContract, router, mockToken, lzEndpoint, bridge
    let chainId, nonce, defaultGasAmount, transferAndCallPayload, defaultCreditObj, defaulSwapObject, defaultLzTxObj

    before(async function () {
        ;({ owner, alice, badUser1, fakeContract } = await getAddr(ethers))
        chainId = 1
        nonce = 1
        defaultGasAmount = 123
        transferAndCallPayload = "0x"
        defaultCreditObj = { credits: 0, idealBalance: 0 }
        defaulSwapObject = { amount: 0, eqFee: 0, eqReward: 0, lpFee: 0, protocolFee: 0, lkbRemove: 0 }
        defaultLzTxObj = { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" }
    })

    beforeEach(async function () {
        router = await deployNew("Router")
        mockToken = await deployNew("MockToken", ["Token", "TKN", 18])
        lzEndpoint = await deployNew("LZEndpointMock", [chainId])
        bridge = await deployNew("Bridge", [lzEndpoint.address, router.address])
    })

    it("constructor() - reverts for 0x0 LZ endpoint", async function () {
        await expect(deployNew("Bridge", [ZERO_ADDRESS, ZERO_ADDRESS])).to.be.revertedWith("Stargate: _layerZeroEndpoint cannot be 0x0")
    })

    it("constructor() - reverts for 0x0 router endpoint", async function () {
        await expect(deployNew("Bridge", [fakeContract.address, ZERO_ADDRESS])).to.be.revertedWith("Stargate: _router cannot be 0x0")
    })

    it("renounceOwnership() - does not affect ownership", async function () {
        expect(await bridge.owner()).to.equal(owner.address)
        await bridge.renounceOwnership()
        expect(await bridge.owner()).to.equal(owner.address)
    })

    it("swap() - reverts when non owner", async function () {
        await expect(bridge.swap(1, 1, 1, ZERO_ADDRESS, defaultCreditObj, defaulSwapObject, defaultLzTxObj, "0x", "0x")).to.revertedWith(
            "Stargate: caller must be Router."
        )
    })

    it("redeemLocalCallback() - reverts when non owner", async function () {
        await expect(bridge.redeemLocalCallback(1, ZERO_ADDRESS, defaultCreditObj, defaultLzTxObj, "0x")).to.revertedWith(
            "Stargate: caller must be Router."
        )
    })

    it("lzReceive() - reverts for non LZ endpoint", async function () {
        await expect(bridge.lzReceive(chainId, alice.address, nonce, alice.address)).to.be.revertedWith(
            "Stargate: only LayerZero endpoint can call lzReceive"
        )
    })

    it("lzReceive() - does NOT revert if invalid function type passed", async function () {
        const payload = encodeParams(["uint256", "uint8"], [123, 123])
        await expect(
            callAsContract(bridge, lzEndpoint.address, "lzReceive(uint16,bytes,uint64,bytes)", [chainId, "0x", nonce, payload])
        ).to.not.be.revertedWith()
    })

    it("lzReceive() - reverts for mismatched bridgeLookup", async function () {
        await bridge.setBridge(chainId, fakeContract.address)
        await expect(
            callAsContract(bridge, lzEndpoint.address, "lzReceive(uint16,bytes,uint64,bytes)", [chainId, alice.address, nonce, alice.address])
        ).to.be.revertedWith("Stargate: bridge does not match")
    })

    it("setBridge()", async function () {
        expect(await bridge.bridgeLookup(chainId)).to.equal("0x")
        await bridge.setBridge(chainId, fakeContract.address)
        expect(await bridge.bridgeLookup(chainId)).to.equal(fakeContract.address.toLowerCase()) // lowerCase because it returns bytes
    })

    it("setBridge() - reverts when bridge already set ", async function () {
        await bridge.setBridge(chainId, fakeContract.address) // set it first
        await expect(bridge.setBridge(chainId, fakeContract.address)).to.be.revertedWith("Stargate: Bridge already set!")
    })

    it("setBridge() - reverts for non owner", async function () {
        await expect(bridge.connect(badUser1).setBridge(chainId, fakeContract.address)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("setGasAmount() - reverts for non owner", async function () {
        await expect(bridge.connect(badUser1).setGasAmount(chainId, TYPE_SWAP_REMOTE, defaultGasAmount)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("setGasAmount() - reverts for invalid function type", async function () {
        const invalidFunctionType = 0
        await expect(bridge.setGasAmount(chainId, invalidFunctionType, defaultGasAmount)).to.be.revertedWith("Stargate: invalid _functionType")
    })

    it("setGasAmount()", async function () {
        await expect(bridge.setGasAmount(chainId, TYPE_SWAP_REMOTE, defaultGasAmount)).to.not.be.revertedWith("Stargate: invalid _functionType")
        expect(await bridge.gasLookup(chainId, TYPE_SWAP_REMOTE)).to.equal(defaultGasAmount)
    })

    it("approveTokenSpender() - reverts for non owner", async function () {
        await expect(bridge.connect(badUser1).approveTokenSpender(alice.address, badUser1.address, 0)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("approveTokenSpender() - approves amount", async function () {
        expect(await mockToken.allowance(bridge.address, alice.address)).to.equal(0)
        const approveAmount = 1
        await bridge.approveTokenSpender(mockToken.address, alice.address, approveAmount)
        expect(await mockToken.allowance(bridge.address, alice.address)).to.equal(approveAmount)
    })

    it("setUseLayerZeroToken() - reverts for non owner", async function () {
        await expect(bridge.connect(badUser1).setUseLayerZeroToken(true)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("setUseLayerZeroToken()", async function () {
        expect(await bridge.useLayerZeroToken()).to.equal(false)
        await bridge.setUseLayerZeroToken(true)
        expect(await bridge.useLayerZeroToken()).to.equal(true)
    })

    it("quoteLayerZeroFee() - TYPE_SWAP_REMOTE returns valid fee", async function () {
        expect(
            await bridge.quoteLayerZeroFee(chainId, TYPE_SWAP_REMOTE, fakeContract.address, transferAndCallPayload, {
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: "0x",
            })
        ).to.deep.equal(await lzEndpoint.estimateFees(chainId, fakeContract.address, transferAndCallPayload, true, "0x"))
    })

    it("quoteLayerZeroFee() - TYPE_ADD_LIQUIDITY returns valid fee", async function () {
        expect(
            await bridge.quoteLayerZeroFee(chainId, TYPE_ADD_LIQUIDITY, fakeContract.address, transferAndCallPayload, {
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: "0x",
            })
        ).to.deep.equal(await lzEndpoint.estimateFees(chainId, fakeContract.address, transferAndCallPayload, true, "0x"))
    })

    it("quoteLayerZeroFee() - TYPE_REDEEM_LOCAL_CALL_BACK returns valid fee", async function () {
        expect(
            await bridge.quoteLayerZeroFee(chainId, TYPE_REDEEM_LOCAL_CALL_BACK, fakeContract.address, transferAndCallPayload, {
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: "0x",
            })
        ).to.deep.equal(await lzEndpoint.estimateFees(chainId, fakeContract.address, "0x", true, "0x"))
    })

    it("quoteLayerZeroFee() - TYPE_WITHDRAW_REMOTE returns valid fee", async function () {
        expect(
            await bridge.quoteLayerZeroFee(chainId, TYPE_WITHDRAW_REMOTE, fakeContract.address, transferAndCallPayload, {
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: "0x",
            })
        ).to.deep.equal(await lzEndpoint.estimateFees(chainId, fakeContract.address, transferAndCallPayload, true, "0x"))
    })

    it("quoteLayerZeroFee() - reverts with unsupported tx type is sent", async function () {
        await expect(
            bridge.quoteLayerZeroFee(chainId, TYPE_WITHDRAW_REMOTE + 1, fakeContract.address, transferAndCallPayload, {
                dstGasForCall: 0,
                dstNativeAmount: 0,
                dstNativeAddr: "0x",
            })
        ).to.revertedWith("Stargate: unsupported function type")
    })

    it("setSendVersion()", async function () {
        const version = 22
        await bridge.setSendVersion(version)
        expect(await lzEndpoint.mockSendVersion()).to.equal(version)
    })

    it("setReceiveVersion()", async function () {
        const version = 23
        await bridge.setReceiveVersion(version)
        expect(await lzEndpoint.mockReceiveVersion()).to.equal(version)
    })

    it("setSendVersion() - reverts when non owner", async function () {
        const version = 22
        await expect(bridge.connect(badUser1).setSendVersion(version)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("setReceiveVersion() - reverts when non owner", async function () {
        const version = 23
        await expect(bridge.connect(badUser1).setReceiveVersion(version)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("setConfig()", async function () {
        const version = 22
        const configType = 0
        const config = "0x1234"
        await expect(bridge.setConfig(version, chainId, configType, config))
            .to.emit(lzEndpoint, "SetConfig")
            .withArgs(version, chainId, configType, config)
    })

    it("setConfig() - reverts when non owner", async function () {
        const version = 22
        const configType = 0
        const config = "0x1234"
        await expect(bridge.connect(badUser1).setConfig(version, chainId, configType, config)).to.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("forceResumeReceive()", async function () {
        const bytesAddr = "0x1234"
        await expect(bridge.forceResumeReceive(chainId, bytesAddr)).to.emit(lzEndpoint, "ForceResumeReceive").withArgs(chainId, bytesAddr)
    })

    it("forceResumeReceive() - reverts when non owner", async function () {
        const bytesAddr = "0x1234"
        await expect(bridge.connect(badUser1).forceResumeReceive(chainId, bytesAddr)).to.revertedWith("Ownable: caller is not the owner")
    })
})
