const { expect } = require("chai")
const { ethers } = require("hardhat")
const { getAddr, deployNew, callAsContract } = require("./util/helpers")
const { ZERO_ADDRESS } = require("./util/constants")

describe("Factory:", function () {
    let owner, alice, poolId, chainId, sharedDecimals, localDecimals, router, factory, mockToken, fakeContract

    before(async function () {
        ;({ owner, alice, fakeContract } = await getAddr(ethers))
        poolId = 1
        chainId = 1
        sharedDecimals = 18
        localDecimals = sharedDecimals
    })

    beforeEach(async function () {
        router = await deployNew("Router")
        factory = await deployNew("Factory", [router.address])
        mockToken = await deployNew("MockToken", ["Token", "TKN", 18])
    })

    it("constructor() - reverts when router is 0x0", async function () {
        await expect(deployNew("Factory", [ZERO_ADDRESS])).to.revertedWith("Stargate: _router cant be 0x0")
    })

    it("setDefaultFeelLibrary() - reverts when router is 0x0", async function () {
        await expect(factory.setDefaultFeeLibrary(ZERO_ADDRESS)).to.revertedWith("Stargate: fee library cant be 0x0")
    })

    it("allPoolsLength()", async function () {
        expect(await factory.allPoolsLength()).to.equal(0)
    })

    it("createPool() - reverts if creatPair() is called for existing _poolId", async function () {
        await callAsContract(factory, router.address, "createPool(uint256,address,uint8,uint8,string,string)", [
            poolId,
            mockToken.address,
            sharedDecimals,
            localDecimals,
            "USDC Pool",
            "S*USDC",
        ])
        await expect(
            callAsContract(factory, router.address, "createPool(uint256,address,uint8,uint8,string,string)", [
                poolId,
                mockToken.address,
                sharedDecimals,
                localDecimals,
                "USDC Pool",
                "S*USDC",
            ])
        ).to.be.revertedWith("Stargate: Pool already created")
    })

    it("createPool() - increments allPoolsLength()", async function () {
        for (let _poolId = 1; _poolId < 10; ++_poolId) {
            await callAsContract(factory, router.address, "createPool(uint256,address,uint8,uint8,string,string)", [
                _poolId,
                mockToken.address,
                sharedDecimals,
                localDecimals,
                "USDC Pool",
                "S*USDC",
            ])

            expect(await factory.allPoolsLength()).to.equal(_poolId)
        }
    })

    it("createPool() - reverts when called by non router", async function () {
        await expect(factory.createPool(poolId, mockToken.address, sharedDecimals, localDecimals, "USDC Pool", "S*USDC")).to.be.revertedWith(
            "Stargate: caller must be Router."
        )
    })

    it("renounceOwnership() doesnt affect ownership", async function () {
        expect(await factory.owner()).to.equal(owner.address)
        await factory.renounceOwnership()
        expect(await factory.owner()).to.equal(owner.address)
    })
})
