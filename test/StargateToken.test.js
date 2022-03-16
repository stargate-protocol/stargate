const { expect } = require("chai")
const { ethers } = require("hardhat")
const CONFIG = require("../constants/config.json")
const { callAsContract } = require("../test/util/helpers")
const { ZERO_ADDRESS } = require("./util/constants")
const { getAddr, deployNew, encodeParams } = require("./util/helpers")

describe("StargateToke:", function () {
    let owner, alice, badUser1, fakeContract, lzEndpoint
    let chainId, chainIdB, nonce, symbol, decimals, name, initSupplyEndpoint, stargateToken, lzVersion

    before(async function () {
        ;({ owner, alice, badUser1, fakeContract } = await getAddr(ethers))
        name = CONFIG.stargateToken.name
        symbol = CONFIG.stargateToken.name
        decimals = 18
        chainId = 1
        chainIdB = 2
        nonce = 1
        lzVersion = 1
        initSupplyEndpoint = ethers.utils.parseEther("1000000000")
    })

    beforeEach(async function () {
        lzEndpoint = await deployNew("LZEndpointMock", [chainId])
        initSupplyEndpoint = ethers.utils.parseEther("1000000000")
        stargateToken = await deployNew("StargateToken", [name, symbol, lzEndpoint.address, chainId, initSupplyEndpoint])
    })

    it("name()", async function () {
        expect(await stargateToken.name()).to.equal(name)
    })

    it("symbol()", async function () {
        expect(await stargateToken.symbol()).to.equal(symbol)
    })

    it("decimals()", async function () {
        expect(await stargateToken.decimals()).to.equal(decimals)
    })

    it("constructor() - mints to deployer", async function () {
        expect(await stargateToken.balanceOf(owner.address)).to.equal(initSupplyEndpoint)
    })

    // it("mint() reverts when called by non Owner ", async function () {
    //   await expect(
    //     stargateToken.connect(bob).mint(alice.address, 1)
    //   ).to.be.revertedWith("Ownable: caller is not the owner");
    // });

    it("renounceOwnership() - doesnt affect ownership", async function () {
        expect(await stargateToken.owner()).to.equal(owner.address)
        await stargateToken.renounceOwnership()
        expect(await stargateToken.owner()).to.equal(owner.address)
    })

    it("lzReceive() - can mint to an address once wired", async function () {
        const qty = ethers.utils.parseEther("1")
        const payload = encodeParams(["bytes", "uint256"], [alice.address, qty.toString()])

        // deploy an oft contract that is not master by using the non 'mainEndpoint' chain id on deployment
        const StargateToken = await ethers.getContractFactory("StargateToken")
        const stargateTokenB = await StargateToken.deploy(name, symbol, lzEndpoint.address, chainIdB, initSupplyEndpoint)

        // should revert before we wire
        await expect(
            callAsContract(stargateTokenB, lzEndpoint.address, "lzReceive(uint16,bytes,uint64,bytes)", [
                chainIdB,
                stargateTokenB.address,
                nonce,
                payload,
            ])
        ).to.be.revertedWith("OFT: invalid source sending contract")
        expect(await stargateTokenB.balanceOf(alice.address)).to.equal(0)

        // set the destination contract address to enable this chain to receive from this address
        await stargateTokenB.setDestination(chainIdB, stargateTokenB.address)
        expect(await stargateTokenB.dstContractLookup(chainIdB)).to.equal(stargateTokenB.address.toLowerCase())

        // can now receive due to wiring
        await callAsContract(stargateTokenB, lzEndpoint.address, "lzReceive(uint16,bytes,uint64,bytes)", [
            chainIdB,
            stargateTokenB.address,
            nonce,
            payload,
        ])
        expect(await stargateTokenB.balanceOf(alice.address)).to.equal(qty)
    })

    it("setConfig() - reverts when non owner", async function () {
        const payload = encodeParams(["uint16", "address"], [1, ZERO_ADDRESS])
        await expect(stargateToken.connect(alice).setConfig(lzVersion, chainId, 1, payload)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("setDestination() - reverts with non owner", async function () {
        await expect(stargateToken.connect(alice).setDestination(1, stargateToken.address)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("sendTokens()", async function () {
        const qty = ethers.utils.parseEther("1")
        const txParameters = "0x"

        // initial values
        expect(await stargateToken.totalSupply()).to.equal(initSupplyEndpoint)
        expect(await stargateToken.balanceOf(owner.address)).to.equal(initSupplyEndpoint)
        expect(await stargateToken.balanceOf(alice.address)).to.equal(0)

        // wire
        await stargateToken.setDestination(chainId, stargateToken.address)
        await lzEndpoint.setDestLzEndpoint(stargateToken.address, lzEndpoint.address)

        await stargateToken.connect(owner).sendTokens(chainId, alice.address, qty, ZERO_ADDRESS, txParameters, {
            value: ethers.utils.parseEther("0.1"),
        })

        expect(await stargateToken.balanceOf(owner.address)).to.equal(initSupplyEndpoint.sub(qty))
        expect(await stargateToken.balanceOf(alice.address)).to.equal(qty)
    })

    it("pauseSendTokens() - reverts with non owner", async function () {
        await expect(stargateToken.connect(alice).pauseSendTokens(true)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("pauseSendTokens()", async function () {
        expect(await stargateToken.paused()).to.equal(false)
        await stargateToken.connect(owner).pauseSendTokens(true)
        expect(await stargateToken.paused()).to.equal(true)
        await stargateToken.connect(owner).pauseSendTokens(false)
        expect(await stargateToken.paused()).to.equal(false)
    })

    it("pauseSendTokens() - cant transfer", async function () {
        await stargateToken.connect(owner).pauseSendTokens(true)
        const qty = ethers.utils.parseEther("1")
        const txParameters = "0x"
        // wire
        await stargateToken.setDestination(chainId, stargateToken.address)
        await lzEndpoint.setDestLzEndpoint(stargateToken.address, lzEndpoint.address)

        // cant send
        await expect(
            stargateToken.connect(owner).sendTokens(chainId, alice.address, qty, ZERO_ADDRESS, txParameters, {
                value: ethers.utils.parseEther("0.1"),
            })
        ).to.be.revertedWith("OFT: sendTokens() is currently paused")
        await expect(
            stargateToken.connect(alice).sendTokens(chainId, alice.address, qty, ZERO_ADDRESS, txParameters, {
                value: ethers.utils.parseEther("0.1"),
            })
        ).to.be.revertedWith("OFT: sendTokens() is currently paused")

        // unpause
        await stargateToken.connect(owner).pauseSendTokens(false)

        // can send
        await expect(
            stargateToken.connect(owner).sendTokens(chainId, alice.address, qty, ZERO_ADDRESS, txParameters, {
                value: ethers.utils.parseEther("0.1"),
            })
        ).to.not.be.revertedWith
        await expect(
            stargateToken.connect(alice).sendTokens(chainId, alice.address, qty, ZERO_ADDRESS, txParameters, {
                value: ethers.utils.parseEther("0.1"),
            })
        ).to.not.be.revertedWith
    })
})
