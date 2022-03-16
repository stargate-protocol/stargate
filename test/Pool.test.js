const { expect } = require("chai")
const { ethers } = require("hardhat")
const { ZERO_ADDRESS } = require("./util/constants")
const { getAddr, deployNew } = require("./util/helpers")

describe("Pool", function () {
    let owner, alice, badUser1, fakeContract, feeLibrary, lzEndpoint, factory, tokenOne, tokenTwo, pool
    let chainId, stargateTokenSpender, poolId, decimals, maxInt256Str, maxInt256, initSupplyMainEndpoint
    let mainEndpointId, name, symbol, dstPoolId, dstChainId, defaultChainPathWeight, nonDefaultChainPathWeight
    let defaultAmountLD, defaultMinAmountLD

    before(async function () {
        ;({ owner, alice, badUser1, fakeContract } = await getAddr(ethers))
        poolId = 1
        chainId = 11
        dstPoolId = 2
        dstChainId = 22
        decimals = 18
        mainEndpointId = 1
        defaultChainPathWeight = 1
        nonDefaultChainPathWeight = 4
        defaultAmountLD = 1
        defaultMinAmountLD = 1
        maxInt256Str = "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        maxInt256 = ethers.BigNumber.from(maxInt256Str)
        initSupplyMainEndpoint = ethers.utils.parseEther("1000000000")
        name = "Pool1"
        symbol = "S*P1"
    })

    beforeEach(async function () {
        // contracts
        lzEndpoint = await deployNew("LZEndpointMock", [chainId])
        tokenOne = await deployNew("MockToken", ["One", "ONE", 18])
        tokenTwo = await deployNew("MockToken", ["Two", "TWO", 18])
        stargateTokenSpender = await deployNew("StargateToken", ["SGTest", "SGTEST", lzEndpoint.address, mainEndpointId, initSupplyMainEndpoint])
        factory = await deployNew("Factory", [fakeContract.address])
        feeLibrary = await deployNew("StargateFeeLibraryV02", [factory.address])
        pool = await deployNew("Pool", [
            poolId,
            owner.address,
            tokenOne.address,
            decimals,
            await tokenOne.decimals(),
            feeLibrary.address,
            name,
            symbol,
        ])

        // setup
        await factory.setDefaultFeeLibrary(feeLibrary.address)
    })

    it("constructor() - reverts for 0x0 params", async function () {
        const Pool = await ethers.getContractFactory("Pool")
        await expect(
            deployNew("Pool", [
                poolId,
                fakeContract.address,
                ZERO_ADDRESS,
                decimals,
                await tokenOne.decimals(),
                feeLibrary.address,
                name,
                symbol,
            ])
        ).to.be.revertedWith("Stargate: _token cannot be 0x0")
        await expect(
            Pool.deploy(poolId, ZERO_ADDRESS, tokenOne.address, decimals, await tokenOne.decimals(), feeLibrary.address, name, symbol)
        ).to.be.revertedWith("Stargate: _router cannot be 0x0")
    })

    it("constructor() - globals are set properly", async function () {
        expect(await pool.poolId()).to.equal(poolId)
        expect(await pool.token()).to.equal(tokenOne.address)
        expect(await pool.token()).to.not.equal(tokenTwo.address)
        expect(await pool.decimals()).to.equal(decimals)
        expect(await pool.localDecimals()).to.equal(await tokenOne.decimals())
        expect(await pool.name()).to.equal(name)
        expect(await pool.symbol()).to.equal(symbol)
    })

    it("createChainPath() - creates a proper pool connection", async function () {
        // verify there are no chains
        await expect(pool.chainPaths(0)).to.be.reverted

        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)

        expect((await pool.chainPaths(0)).dstChainId).to.equal(dstChainId)
        expect((await pool.chainPaths(0)).dstPoolId).to.equal(dstPoolId)

        // verify there is only 1 chain path existing
        await expect(pool.chainPaths(1)).to.be.reverted
    })

    it("mint() - reverts when called by non Router ", async function () {
        await expect(pool.connect(badUser1).mint(alice.address, 1)).to.be.revertedWith("Stargate: only the router can call this method")
    })

    it("mint() - reverts if there are no chain paths", async function () {
        await expect(pool.chainPaths(0)).to.be.reverted // verify there are no chains
        await expect(pool.mint(alice.address, 1)).to.be.reverted
    })

    it("mint() - reverts with no weights for chainpaths", async function () {
        await pool.createChainPath(dstChainId, dstPoolId, 0) // 0 weight
        await expect(pool.mint(alice.address, 1)).to.be.reverted
    })

    it("mint() - mints to user", async function () {
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)
        await pool.mint(alice.address, 100)
        expect(await pool.balanceOf(alice.address)).to.equal(100)
    })

    it("transferFrom()", async function () {
        const amount = ethers.utils.parseEther("100")
        const amount2 = ethers.utils.parseEther("50")
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)

        await pool.mint(alice.address, amount)
        expect(await pool.balanceOf(alice.address)).to.equal(amount)
        await expect(pool.connect(alice).transfer(alice.address, amount2)).to.emit(pool, "Transfer")
        await pool.connect(alice).approve(alice.address, amount2)
        await expect(pool.connect(alice).transferFrom(alice.address, alice.address, amount2)).to.emit(pool, "Transfer")
    })

    it("transferFrom() - reverts if the transfer is not approved", async function () {
        const amount = ethers.utils.parseEther("100")
        const amount2 = ethers.utils.parseEther("50")
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)

        await pool.mint(alice.address, amount)
        expect(await pool.balanceOf(alice.address)).to.equal(amount)
        await expect(pool.connect(alice).transfer(alice.address, amount2)).to.emit(pool, "Transfer")
        await pool.connect(alice).approve(alice.address, maxInt256)
        await expect(pool.connect(alice).transferFrom(alice.address, alice.address, amount2.add(1))).to.emit(pool, "Transfer")
    })

    it("createChainPath() - weights are set", async function () {
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)
        expect((await pool.chainPaths(0)).weight).to.equal(defaultChainPathWeight)
        await pool.setWeightForChainPath(dstChainId, dstPoolId, nonDefaultChainPathWeight)
        expect((await pool.chainPaths(0)).weight).to.equal(nonDefaultChainPathWeight)
    })

    it("getChainPathsLength()", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)
        expect(await pool.getChainPathsLength()).to.equal(2)
    })

    it("setWeightForChainPath() - properly allocate to two pools based on weights", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await pool.createChainPath(dstChainId, dstPoolId, nonDefaultChainPathWeight)

        await pool.mint(alice.address, 100)
        expect(await pool.balanceOf(alice.address)).to.equal(100)

        expect((await pool.chainPaths(0)).credits).to.equal(20)
        expect((await pool.chainPaths(1)).credits).to.equal(80)

        // change the weight back to 50/ 50
        await pool.setWeightForChainPath(chainId, poolId, nonDefaultChainPathWeight)
        await pool.mint(alice.address, 60)
        expect((await pool.chainPaths(0)).credits).to.equal(80)
        expect((await pool.chainPaths(1)).credits).to.equal(80)
    })

    it("creditChainPath() - adds to balance for remote chain", async function () {
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)
        await pool.creditChainPath(dstChainId, dstPoolId, { credits: 100, idealBalance: 100 })
        expect((await pool.chainPaths(0)).balance).to.equal(100)
        await pool.creditChainPath(dstChainId, dstPoolId, { credits: 100, idealBalance: 100 })
        expect((await pool.chainPaths(0)).balance).to.equal(200)
    })

    it("amountLPtoLD() - reverts when totalSupply is 0", async function () {
        const amountLP = 100
        await expect(pool.amountLPtoLD(amountLP)).to.revertedWith("Stargate: cant convert LPtoSD when totalSupply == 0")
    })

    it("getChainPath() - reverts when local chain path does not exist", async function () {
        await pool.createChainPath(dstChainId, dstPoolId, defaultChainPathWeight)
        await expect(pool.getChainPath(dstChainId, dstPoolId + 1)).to.revertedWith("Stargate: local chainPath does not exist")
    })

    it("redeemLocal() ", async function () {
        const amountLP = 100
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight) // setup chain path
        await pool.activateChainPath(chainId, poolId)
        await pool.mint(alice.address, amountLP) // give them some LP tokens
        await expect(pool.redeemLocal(alice.address, amountLP, chainId, poolId, alice.address)).to.emit(pool, "RedeemLocal")
    })

    it("redeemLocal() - reverts if path is not activated", async function () {
        const amountLP = 100
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight) // setup chain path
        await pool.mint(alice.address, amountLP) // give them some LP tokens
        await expect(pool.redeemLocal(alice.address, amountLP, chainId, poolId, alice.address)).to.revertedWith(
            "Stargate: counter chainPath is not ready"
        )
    })

    it("creditChainPath() - emits event", async function () {
        const amountSD = 99

        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(
            pool.creditChainPath(chainId, poolId, {
                credits: amountSD,
                idealBalance: amountSD,
            })
        )
            .to.emit(pool, "CreditChainPath")
            .withArgs(chainId, poolId, amountSD, amountSD)
    })

    it("swapRemote() - emits event", async function () {
        const amountToMintSD = 99
        const srcReward = 5
        const protocolFee = 6
        const dstFee = 7
        const lpFee = 3
        const lkbRemove = 0

        await tokenOne.mint(pool.address, 10000000)
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        const swapObj = {
            amount: amountToMintSD,
            eqFee: dstFee,
            eqReward: srcReward,
            lpFee,
            protocolFee: protocolFee,
            lkbRemove,
        }
        await expect(pool.swapRemote(chainId, poolId, alice.address, swapObj))
            .to.emit(pool, "SwapRemote")
            .withArgs(alice.address, amountToMintSD + srcReward, protocolFee, dstFee)

        await expect(pool.connect(owner).withdrawProtocolFeeBalance(alice.address)).to.emit(pool, "WithdrawProtocolFeeBalance")
    })

    it("withdrawMintFeeBalance() - emits event", async function () {
        const amountLD = 12341234
        const amountToMintSD = 10000000
        const mintFeeFP = 789

        // give the pool some tokens so the inner _safeTransfer works
        await tokenOne.mint(pool.address, amountToMintSD)
        await pool.setFee(mintFeeFP)
        await pool.createChainPath(chainId, poolId, nonDefaultChainPathWeight)
        await pool.mint(alice.address, amountLD)
        await expect(pool.withdrawMintFeeBalance(alice.address)).to.emit(pool, "WithdrawMintFeeBalance")
    })

    it("withdrawMintFeeBalance() - reverts when to address is 0x0", async function () {
        const amountLD = 12341234
        const amountToMintSD = 10000000
        const mintFeeFP = 789

        // give the pool some tokens so the inner _safeTransfer works
        await tokenOne.mint(pool.address, amountToMintSD)
        await pool.setFee(mintFeeFP)
        await pool.createChainPath(chainId, poolId, nonDefaultChainPathWeight)
        await pool.mint(alice.address, amountLD)
        await expect(pool.withdrawMintFeeBalance(ZERO_ADDRESS)).to.revertedWith("Stargate: TRANSFER_FAILED")
    })

    it("redeemLocalCallback() - emits event when _amountToMintSD is > 0", async function () {
        const amountLD = 12341234
        const amountToMintSD = 10000000
        const mintFeeFP = 789

        // give the pool some of the token so the inner _safeTransfer works
        await tokenOne.mint(pool.address, amountToMintSD)
        await pool.setFee(mintFeeFP)
        await pool.createChainPath(chainId, poolId, nonDefaultChainPathWeight)
        await pool.mint(alice.address, amountLD)
        await expect(pool.redeemLocalCallback(chainId, poolId, alice.address, 0, 0)).to.emit(pool, "RedeemLocalCallback")
    })

    it("redeemLocalCallback() - setup to call _delta() where total > _amountSD", async function () {
        const chainId = 6543
        const poolId = 1
        const chainId1 = 6544
        const chainId2 = 6545
        const chainId3 = 6546
        const weight = 1234
        const amountLD = 12341234
        const amountToMintSD = 10000000
        const mintFeeFP = 789

        // give the pool some of the token so the inner _safeTransfer works
        await tokenOne.mint(pool.address, amountToMintSD)
        await pool.setFee(mintFeeFP)
        await pool.createChainPath(chainId, poolId, weight)
        await pool.createChainPath(chainId1, poolId, weight)
        await pool.createChainPath(chainId2, poolId, weight)
        await pool.createChainPath(chainId3, poolId, weight)
        await pool.mint(alice.address, amountLD)
        await expect(pool.redeemLocalCallback(chainId, poolId, alice.address, 0, 0)).to.emit(pool, "RedeemLocalCallback")
    })

    it("redeemLocalCheckOnRemote() - emits event", async function () {
        const amountSD = 12
        const swapAmount = 0
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(pool.redeemLocalCheckOnRemote(chainId, poolId, amountSD))
            .to.emit(pool, "WithdrawRemote")
            .withArgs(chainId, poolId, swapAmount, amountSD)
    })

    it("createChainPath() - emit correct event", async function () {
        await expect(pool.createChainPath(chainId, poolId, defaultChainPathWeight))
            .to.emit(pool, "ChainPathUpdate")
            .withArgs(chainId, poolId, defaultChainPathWeight)
    })

    it("setWeightForChainPath() - emit correct event", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(pool.setWeightForChainPath(chainId, poolId, nonDefaultChainPathWeight))
            .to.emit(pool, "ChainPathUpdate")
            .withArgs(chainId, poolId, nonDefaultChainPathWeight)
    })

    it("setFee() - emits correct event", async function () {
        const mintFeeFP = 789
        await expect(pool.setFee(mintFeeFP)).to.emit(pool, "FeesUpdated").withArgs(mintFeeFP)
    })

    it("swap() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).swap(dstChainId, poolId, alice.address, defaultAmountLD, defaultMinAmountLD, true)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("swap() - reverts if swapStop called", async function () {
        await pool.setSwapStop(true)
        await expect(pool.swap(dstChainId, poolId, alice.address, defaultAmountLD, defaultMinAmountLD, true)).to.be.revertedWith(
            "Stargate: swap func stopped"
        )
    })

    it("swap() - reverts if chainPath not active", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(pool.swap(chainId, poolId, alice.address, defaultAmountLD, defaultMinAmountLD, true)).to.be.revertedWith(
            "Stargate: counter chainPath is not ready"
        )
    })

    it("sendCredits() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).sendCredits(dstChainId, poolId)).to.be.revertedWith("Stargate: only the router can call this method")
    })

    it("sendCredits() - emits event", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)

        // it fails because the chainPath not yet activatged
        await expect(pool.connect(owner).sendCredits(chainId, poolId)).to.be.revertedWith("Stargate: counter chainPath is not ready")

        // activate it
        await pool.connect(owner).activateChainPath(chainId, poolId)

        // input wrong chain id
        await expect(pool.connect(owner).sendCredits(17856, poolId)).to.be.revertedWith("Stargate: local chainPath does not exist")

        // this would succeed
        await expect(pool.connect(owner).sendCredits(chainId, poolId)).to.emit(pool, "SendCredits").withArgs(chainId, poolId, 0, 0)
    })

    it("redeemRemote() - reverts when _from is 0x0", async function () {
        await expect(pool.redeemRemote(chainId, poolId, ZERO_ADDRESS, 1)).to.be.revertedWith("Stargate: _from cannot be 0x0")
    })

    it("redeemLocal() - reverts when _from is 0x0", async function () {
        await expect(pool.redeemLocal(ZERO_ADDRESS, 1, dstChainId, dstPoolId, ZERO_ADDRESS)).to.be.revertedWith("Stargate: _from cannot be 0x0")
    })

    it("redeemRemote() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).redeemRemote(dstChainId, dstPoolId, alice.address, 1)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("redeemRemote() - reverts when trying to burn and totalSupply is 0", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await pool.activateChainPath(chainId, poolId)
        await expect(pool.connect(owner).redeemRemote(chainId, poolId, alice.address, 1)).to.be.revertedWith(
            "Stargate: cant burn when totalSupply == 0"
        )
    })

    it("activateChainPath() - reverts when called on already activated path", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await pool.activateChainPath(chainId, poolId)
        await expect(pool.activateChainPath(chainId, poolId)).to.be.revertedWith("Stargate: chainPath is already active")
    })

    it("createChainPath() - reverts when duplicate chainpath tried to be created", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(pool.createChainPath(chainId, poolId, 1)).to.be.revertedWith(
            "Stargate: cant createChainPath of existing dstChainId and _dstPoolId"
        )
    })

    it("activateChainPath() - reverts when called on a cp that doesnt exist", async function () {
        await pool.createChainPath(chainId, poolId, defaultChainPathWeight)
        await expect(pool.activateChainPath(chainId + 1, poolId)).to.be.revertedWith("Stargate: local chainPath does not exist")
    })

    it("redeemLocal() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).redeemLocal(alice.address, 1, dstChainId, dstPoolId, alice.address)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("creditChainPath() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).creditChainPath(dstChainId, poolId, { credits: 1, idealBalance: 1 })).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("swapRemote() - reverts when called by non Router ", async function () {
        const swapObj = { amount: 1, eqFee: 2, eqReward: 3, lpFee: 4, protocolFee: 5, lkbRemove: 6 } // dummy object for this test
        await expect(pool.connect(alice).swapRemote(chainId, poolId, alice.address, swapObj)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("redeemLocalCallback() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).redeemLocalCallback(chainId, poolId, alice.address, 1, 1)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("redeemLocalCheckOnRemote() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).redeemLocalCheckOnRemote(dstChainId, poolId, 1)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("createChainPath() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).createChainPath(chainId, poolId, 1)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("setWeightForChainPath() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).setWeightForChainPath(chainId, poolId, nonDefaultChainPathWeight)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("setWeightForChainPath() - reverts when no chainPaths have been created yet", async function () {
        await expect(pool.setWeightForChainPath(chainId, poolId, nonDefaultChainPathWeight)).to.be.revertedWith("Stargate: no chainpaths exist")
    })

    it("setFee() - reverts when called by non Router ", async function () {
        const fee = 3
        await expect(pool.connect(alice).setFee(fee)).to.be.revertedWith("Stargate: only the router can call this method")
    })

    it("setFee() - reverts cumulative fee exceeds 100%", async function () {
        const fee = 10001
        await expect(pool.setFee(fee)).to.be.revertedWith("Bridge: cum fees > 100%")
    })

    it("setFeeLibrary() - sets properly", async function () {
        await expect(pool.setFeeLibrary(fakeContract.address)).to.emit(pool, "FeeLibraryUpdated").withArgs(fakeContract.address)
    })

    it("setFeeLibrary() - reverts by non-router", async function () {
        await expect(pool.connect(alice).setFeeLibrary(fakeContract.address)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("setFeeLibrary() - reverts library address is 0x0", async function () {
        await expect(pool.setFeeLibrary(ZERO_ADDRESS)).to.be.revertedWith("Stargate: fee library cant be 0x0")
    })

    it("setSwapStop() - set / emit event", async function () {
        await expect(pool.setSwapStop(true)).to.emit(pool, "StopSwapUpdated").withArgs(true)
    })

    it("setSwapStop() - reverts by non router", async function () {
        await expect(pool.connect(alice).setSwapStop(fakeContract.address)).to.be.revertedWith("Stargate: only the router can call this method")
    })

    it("setDeltaParam() - reverts by non-router", async function () {
        const swapDeltaBP = 1
        const lpDeltaBP = 1
        await expect(pool.connect(alice).setDeltaParam(true, swapDeltaBP, lpDeltaBP, true, true)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("setDeltaParam() - reverts if basis points are wrong", async function () {
        const swapDeltaBP = 10001
        const lpDeltaBP = 10001
        await expect(pool.setDeltaParam(true, swapDeltaBP, lpDeltaBP, true, true)).to.be.revertedWith("Stargate: wrong Delta param")
    })

    it("setDeltaParam() - emits event", async function () {
        const swapDeltaBP = 100
        const lpDeltaBP = 100
        await expect(pool.setDeltaParam(true, swapDeltaBP, lpDeltaBP, true, true))
            .to.emit(pool, "DeltaParamUpdated")
            .withArgs(true, swapDeltaBP, lpDeltaBP, true, true)
    })

    it("callDelta() - reverts by non-router", async function () {
        await expect(pool.connect(alice).callDelta(true)).to.be.revertedWith("Stargate: only the router can call this method")
    })

    it("withdrawProtocolFeeBalance() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).withdrawProtocolFeeBalance(alice.address)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("withdrawMintFeeBalance() - reverts when called by non Router ", async function () {
        await expect(pool.connect(alice).withdrawMintFeeBalance(alice.address)).to.be.revertedWith(
            "Stargate: only the router can call this method"
        )
    })

    it("withdrawMintFeeBalance() - no event when mintFeeBalance equal to 0", async function () {
        await expect(pool.withdrawMintFeeBalance(alice.address)).to.not.emit(pool, "WithdrawMintFeeBalance")
    })

    it("withdrawProtocolFeeBalance() - no event when protocolFeeBalance equal to 0", async function () {
        await expect(pool.withdrawProtocolFeeBalance(alice.address)).to.not.emit(pool, "WithdrawProtocolFeeBalance")
    })

    it("createChainPath() - x6 and mint() which calls _distribute fees", async function () {
        for (let i = 1; i <= 6; ++i) {
            await pool.createChainPath(i, i, defaultChainPathWeight)
            await pool.mint(alice.address, 10000)
        }
    })

    it("createChainPath() - x10 and mint() which calls _distribute fees", async function () {
        for (let i = 1; i <= 10; ++i) {
            await pool.createChainPath(i, i, nonDefaultChainPathWeight)
            await pool.mint(alice.address, 12341234)
        }
    })

    it("createChainPath() - x50 and mint() which calls _distribute fees", async function () {
        for (let i = 0; i < 50; ++i) {
            // 50 connected chains
            await pool.createChainPath(i, i, nonDefaultChainPathWeight)
            await pool.mint(alice.address, 777)
        }
    })
})
