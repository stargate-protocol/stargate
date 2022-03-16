const { expect } = require("chai")
const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")
const { setup } = require("./util/setup")
const {
    encodePackedParams,
    getAddr,
    deployNew,
    callAsContract,
    encodeParams,
    amountSDtoLD,
    amountLDtoSD,
    getPoolFromFactory,
} = require("./util/helpers")
const {
    ZERO_ADDRESS,
    USDC,
    DAI,
    ETHEREUM,
    AVAX,
    TYPE_REDEEM_LOCAL_RESPONSE,
    TYPE_REDEEM_LOCAL_CALLBACK_RETRY,
    TYPE_SWAP_REMOTE_RETRY,
} = require("./util/constants")
const { addLiquidity, equalize, mintAndSwap, removeLiquidityLocal, removeLiquidityRemote, removeLiquidityInstant } = require("./util/actions")
const { audit, getPoolState } = require("./util/poolStateHelpers")

describe("Pool State: ", function () {
    this.timeout(600000000)
    let eth_endpoint, avax_endpoint, endpoints, tokens, pools
    let eth_usdc_pool, eth_dai_pool, avax_usdc_pool, avax_dai_pool
    let alice, bob, badUser1, fakeContract, emptyLzTxObj, defaultSwapObj

    before(async function () {
        ;({ alice, bob, badUser1, fakeContract } = await getAddr(ethers))
    })

    beforeEach(async function () {
        endpoints = await setup(2, 2)
        eth_endpoint = endpoints[ETHEREUM]
        avax_endpoint = endpoints[AVAX]
        ;({ [DAI]: eth_dai_pool, [USDC]: eth_usdc_pool } = eth_endpoint.pools)
        ;({ [DAI]: avax_dai_pool, [USDC]: avax_usdc_pool } = avax_endpoint.pools)

        endpoints = [eth_endpoint, avax_endpoint]
        pools = [eth_dai_pool, avax_dai_pool, eth_usdc_pool, avax_usdc_pool]
        tokens = [DAI]
        emptyLzTxObj = { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" }
        defaultSwapObj = { amount: 1, eqFee: 1, eqReward: 1, lpFee: 1, protocolFee: 1, lkbRemove: 1 }
    })

    it("swap() - lzTxParams transfers extra gas", async function () {
        await addLiquidity(avax_dai_pool, alice, BigNumber.from("1000"))
        await equalize(endpoints, alice, false)

        const nativeAmt = 453
        const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
        const lzTxParams = { dstGasForCall: 0, dstNativeAmount: nativeAmt, dstNativeAddr: encodedDstNativeAddr }

        // mock is design to throw if this does not pass
        await expect(mintAndSwap(eth_dai_pool, avax_dai_pool, bob, BigNumber.from("500"), lzTxParams)).to.be.revertedWith(
            "NativeGasParams check"
        )
    })

    it("swap() - reverts with 0 amount", async function () {
        const lzTxParams = { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" }
        await expect(
            eth_dai_pool.router
                .connect(alice)
                .swap(avax_dai_pool.chainId, eth_dai_pool.id, avax_dai_pool.id, alice.address, 0, 0, lzTxParams, alice.address, "0x")
        ).to.revertedWith("Stargate: cannot swap 0")
    })

    it("swap() - reverts when cp balance is not high enough for swap", async function () {
        await addLiquidity(avax_dai_pool, alice, BigNumber.from("10000000"), {})
        await addLiquidity(eth_dai_pool, alice, BigNumber.from("10000000"), {})
        await equalize(endpoints, bob, false)

        // amount sd and ld are the same for this state
        const amountSD = BigNumber.from("2500000")
        const lzTxParams = { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" }

        // mint and swap enough that it makes eqReward larger than the lp fee
        await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, amountSD, lzTxParams)
        await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, amountSD, lzTxParams)
        // when we try to swap the other way the total amount of the chain path, it tries to deduct more than the amountSD
        await expect(mintAndSwap(eth_dai_pool, avax_dai_pool, bob, amountSD.mul(3), lzTxParams)).to.revertedWith("Stargate: dst balance too low")
    })

    it("swap() - reverts when cp balance is not high enough for swap", async function () {
        await addLiquidity(avax_dai_pool, alice, BigNumber.from("10000000"), {})
        await addLiquidity(eth_dai_pool, alice, BigNumber.from("10000000"), {})
        await equalize(endpoints, bob, false)

        // amount sd and ld are the same for this state
        const amountSD = BigNumber.from("2500000")
        const lzTxParams = { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" }

        // mint and swap enough that it makes eqReward larger than the lp fee
        await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, amountSD, lzTxParams)
        await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, amountSD, lzTxParams)
        // when we try to swap the other way the total amount of the chain path, it tries to deduct more than the amountSD
        await expect(mintAndSwap(eth_dai_pool, avax_dai_pool, bob, amountSD.mul(3), lzTxParams)).to.revertedWith("Stargate: dst balance too low")
    })

    it("swap() - using loop back mock, revert on sgReceive when paused", async function () {
        const minAmountLD = BigNumber.from("1")
        const amountLD = BigNumber.from("66")
        const loopBackMock = await deployNew("LoopBackMock", [avax_dai_pool.router.address])
        const encodedDstNativeAddr = encodePackedParams(["address"], [loopBackMock.address])
        const lzTxParams = { dstGasForCall: 500000, dstNativeAmount: 123400, dstNativeAddr: encodedDstNativeAddr }
        const payload = encodeParams(["uint256", "uint256"], [avax_dai_pool.id, eth_dai_pool.id])

        // give the loop back some ether to transfer via lzTxParams
        await alice.sendTransaction({
            to: loopBackMock.address,
            value: 1000000,
        })

        // ensure liquidity in pools for swap
        await addLiquidity(eth_dai_pool, alice, BigNumber.from("1000000"))
        await addLiquidity(avax_dai_pool, alice, BigNumber.from("1000000"))
        // update the chain path balances
        await equalize(endpoints, bob, false)

        // check the loop back has no tokens yet
        expect(await avax_dai_pool.token.balanceOf(loopBackMock.address)).to.equal(0)

        // give alice tokens to spend
        await eth_dai_pool.token.mint(alice.address, amountLD)
        // allow the eth router to spend them
        await eth_dai_pool.token.connect(alice).increaseAllowance(eth_dai_pool.router.address, amountLD)
        expect(await eth_dai_pool.token.balanceOf(alice.address)).to.equal(amountLD)
        // allow the loopback mock to send back half of the original amount back
        await callAsContract(avax_dai_pool.token, loopBackMock.address, "increaseAllowance(address,uint256)", [
            avax_dai_pool.router.address,
            amountLD.div(2),
        ])

        // pause the loop back contract
        await loopBackMock.pause(true)

        // increase the nonce by 1 because it is the next one
        const nonce = (await eth_endpoint.lzEndpoint.inboundNonce(avax_endpoint.chainId, eth_dai_pool.bridge.address)).add(1)

        await expect(
            eth_dai_pool.router
                .connect(alice)
                .swap(
                    avax_dai_pool.chainId,
                    eth_dai_pool.id,
                    avax_dai_pool.id,
                    alice.address,
                    amountLD,
                    minAmountLD,
                    lzTxParams,
                    loopBackMock.address,
                    payload
                )
        ).to.emit(avax_dai_pool.router, "CachedSwapSaved")

        // can not clear the swap because it is paused
        await expect(avax_dai_pool.router.clearCachedSwap(eth_dai_pool.chainId, eth_dai_pool.bridge.address, nonce)).to.revertedWith(
            "Failed sgReceive due to pause"
        )

        // unpause
        await loopBackMock.pause(false)

        // unpaused, should clear
        await avax_dai_pool.router.clearCachedSwap(eth_dai_pool.chainId, eth_dai_pool.bridge.address, nonce)

        expect(await avax_dai_pool.token.balanceOf(loopBackMock.address)).to.equal(amountLD.div(2))
        // _srcAddress is where the tokens pass back to after LoopBackMock.sol
        expect(await eth_dai_pool.token.balanceOf(eth_dai_pool.bridge.address)).to.equal(amountLD.div(2))
    })

    it("swap() - using loop back mock, can send on sgReceive", async function () {
        const minAmountLD = BigNumber.from("1")
        const amountLD = BigNumber.from("66")
        const loopBackMock = await deployNew("LoopBackMock", [avax_dai_pool.router.address])
        const encodedDstNativeAddr = encodePackedParams(["address"], [loopBackMock.address])
        const lzTxParams = { dstGasForCall: 500000, dstNativeAmount: 123400, dstNativeAddr: encodedDstNativeAddr }
        const payload = encodeParams(["uint256", "uint256"], [avax_dai_pool.id, eth_dai_pool.id])

        // give the loop back some ether to transfer via lzTxParams
        await alice.sendTransaction({
            to: loopBackMock.address,
            value: 1000000,
        })

        // ensure liquidity in pools for swap
        await addLiquidity(eth_dai_pool, alice, BigNumber.from("1000000"))
        await addLiquidity(avax_dai_pool, alice, BigNumber.from("1000000"))
        // update the chain path balances
        await equalize(endpoints, bob, false)

        // check the loop back has no tokens yet
        expect(await avax_dai_pool.token.balanceOf(loopBackMock.address)).to.equal(0)

        // give alice tokens to spend
        await eth_dai_pool.token.mint(alice.address, amountLD)
        // allow the eth router to spend them
        await eth_dai_pool.token.connect(alice).increaseAllowance(eth_dai_pool.router.address, amountLD)
        expect(await eth_dai_pool.token.balanceOf(alice.address)).to.equal(amountLD)
        // allow the loopback mock to send back half of the original amount back
        await callAsContract(avax_dai_pool.token, loopBackMock.address, "increaseAllowance(address,uint256)", [
            avax_dai_pool.router.address,
            amountLD.div(2),
        ])

        // initial swap tx can call send again and loop back in the same tx
        await expect(
            eth_dai_pool.router
                .connect(alice)
                .swap(
                    avax_dai_pool.chainId,
                    eth_dai_pool.id,
                    avax_dai_pool.id,
                    alice.address,
                    amountLD,
                    minAmountLD,
                    lzTxParams,
                    loopBackMock.address,
                    payload
                )
        )
            .to.emit(loopBackMock, "LoopBack")
            .withArgs(eth_dai_pool.bridge.address.toLowerCase(), avax_dai_pool.id, eth_dai_pool.id, amountLD.div(2))

        expect(await avax_dai_pool.token.balanceOf(loopBackMock.address)).to.equal(amountLD.div(2))
        // _srcAddress is where the tokens pass back to after LoopBackMock.sol
        expect(await eth_dai_pool.token.balanceOf(eth_dai_pool.bridge.address)).to.equal(amountLD.div(2))
    })

    describe("LP pools are filled and fees set:", async function () {
        const amount = BigNumber.from("100000")

        beforeEach(async function () {
            // setting these fees allow delta credit to accumulate
            avax_endpoint.router.setFees(avax_dai_pool.id, 2)
            eth_endpoint.router.setFees(eth_dai_pool.id, 2)
            avax_endpoint.router.setDeltaParam(
                avax_dai_pool.id,
                true,
                500, // 5%
                500, // 5%
                true, //default
                true //default
            )
            eth_endpoint.router.setDeltaParam(
                eth_dai_pool.id,
                true,
                500, // 5%
                500, // 5%
                true, //default
                true //default
            )

            await addLiquidity(avax_dai_pool, alice, amount)
            await addLiquidity(eth_dai_pool, alice, amount)
            await addLiquidity(avax_dai_pool, bob, amount)
            await addLiquidity(avax_dai_pool, bob, amount)
            await equalize(endpoints, bob, false)

            await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, BigNumber.from(123), {}, false)
        })

        it("delta() - run a series of tests NOT in fullMode and ensure audit still works", async function () {
            const bigAmount = BigNumber.from("100000000000000")
            // turn full mode off
            avax_endpoint.router.setDeltaParam(
                avax_dai_pool.id,
                true,
                500, // 5%
                500, // 5%
                false, // non-default
                false // non-default
            )
            eth_endpoint.router.setDeltaParam(
                eth_dai_pool.id,
                true,
                500, // 5%
                500, // 5%
                false, // non-default
                false // non-default
            )

            // arbitrary set of actions
            await addLiquidity(avax_dai_pool, alice, bigAmount)
            await addLiquidity(eth_dai_pool, alice, bigAmount)
            await addLiquidity(avax_dai_pool, bob, bigAmount)
            await addLiquidity(eth_dai_pool, bob, bigAmount)
            await addLiquidity(avax_usdc_pool, bob, bigAmount)
            await addLiquidity(eth_usdc_pool, bob, bigAmount)
            await equalize(endpoints, bob, false)
            await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, BigNumber.from(10000000000000), {})
            await removeLiquidityRemote(eth_dai_pool, avax_dai_pool, alice, BigNumber.from(100000000000))
            await mintAndSwap(eth_dai_pool, avax_dai_pool, alice, BigNumber.from(10000000000000), {})
            await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, BigNumber.from(10000000000000), {})
            await mintAndSwap(avax_dai_pool, eth_usdc_pool, bob, BigNumber.from(10000000000000), {})
            await removeLiquidityRemote(eth_dai_pool, avax_usdc_pool, alice, BigNumber.from(100000000000))

            await audit(endpoints, pools)
        })

        it("redeemRemote() - add eqReward to the deltaCredits", async function () {
            const bigAmount = BigNumber.from("100000000000000")
            await addLiquidity(avax_dai_pool, alice, bigAmount)
            await addLiquidity(eth_dai_pool, alice, bigAmount)
            await equalize(endpoints, bob, false)

            // create an eq fee reward deficit so reward is generated on remove liquidity remote
            await mintAndSwap(avax_dai_pool, eth_dai_pool, bob, BigNumber.from(10000000000000), {}, true)
            const deltaCredit = await eth_dai_pool.pool.deltaCredit()
            await removeLiquidityRemote(eth_dai_pool, avax_dai_pool, alice, BigNumber.from(100000000000))
            // delta credits increases because the eq reward is added to it
            expect((await eth_dai_pool.pool.deltaCredit()).gt(deltaCredit)).to.equal(true)
        })

        it("redeemRemote() - nativeGasParams blocks", async function () {
            const nativeAmt = 453
            const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
            const lzTxParams = { dstGasForCall: 0, dstNativeAmount: nativeAmt, dstNativeAddr: encodedDstNativeAddr }
            const dstChainId = eth_endpoint.chainId

            // remove gas object so it gets stored properly, Passing ZERO_ADDRESS causes it to revert
            await expect(
                avax_endpoint.router.connect(bob).redeemRemote(dstChainId, DAI, DAI, bob.address, 1000, 1, ZERO_ADDRESS, lzTxParams)
            ).to.be.revertedWith("NativeGasParams check")
        })

        it("redeemRemote() - calls delta when lpDeltaBP is 0", async function () {
            avax_endpoint.router.setDeltaParam(
                avax_dai_pool.id,
                true,
                0, // 0%
                0, // 0%
                true, //default
                true //default
            )
            const deltaCredit = await avax_dai_pool.pool.deltaCredit()

            await removeLiquidityRemote(avax_dai_pool, eth_dai_pool, bob, BigNumber.from(1))
            expect((await avax_dai_pool.pool.deltaCredit()).lt(deltaCredit)).to.equal(true)
        })

        it("redeemRemote() - reverts when not enough lp", async function () {
            await expect(
                callAsContract(avax_dai_pool.pool, avax_endpoint.router.address, "redeemRemote(uint16,uint256,address,uint256)", [
                    eth_dai_pool.chainId,
                    eth_dai_pool.id,
                    fakeContract.address,
                    amount.add(1),
                ])
            ).to.revertedWith("Stargate: not enough LP tokens to burn")
        })

        it("redeemRemote() - lzTxParams transfers extra gas", async function () {
            const nativeAmt = 453
            const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
            const lzTxParams = { dstGasForCall: 0, dstNativeAmount: nativeAmt, dstNativeAddr: encodedDstNativeAddr }
            await expect(removeLiquidityRemote(avax_dai_pool, eth_dai_pool, bob, BigNumber.from("50"), lzTxParams)).to.be.revertedWith(
                "NativeGasParams check"
            )
        })

        it("redeemLocal()", async function () {
            const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
            const lzTxParams = { dstGasForCall: 1000000, dstNativeAmount: 0, dstNativeAddr: encodedDstNativeAddr }

            await removeLiquidityLocal(avax_dai_pool, eth_dai_pool, alice, BigNumber.from("200"), lzTxParams, [], [], false)
        })

        it("redeemLocal() - lzTxParams transfers extra gas", async function () {
            const nativeAmt = 453
            const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
            const lzTxParams = { dstGasForCall: 0, dstNativeAmount: nativeAmt, dstNativeAddr: encodedDstNativeAddr }
            const srcChainId = avax_endpoint.chainId
            const dstChainId = eth_endpoint.chainId

            await expect(
                avax_endpoint.router.connect(bob).redeemLocal(dstChainId, DAI, DAI, bob.address, 1000, bob.address, lzTxParams)
            ).to.be.revertedWith("NativeGasParams check")

            // nonce is actually the next one, hence +1
            const expectedNonce = (await avax_dai_pool.lzEndpoint.outboundNonce(dstChainId, avax_dai_pool.bridge.address)).add(1)

            // remove gas object so it gets stored properly, then try to send it back the other way and hopefully get a revert
            await expect(avax_endpoint.router.connect(bob).redeemLocal(dstChainId, DAI, DAI, bob.address, 1000, bob.address, emptyLzTxObj))
                .to.emit(eth_endpoint.router, "RevertRedeemLocal")
                .withArgs(srcChainId, DAI, DAI, bob.address.toLowerCase(), 1000, 0, expectedNonce, avax_dai_pool.bridge.address.toLowerCase())

            await expect(
                eth_endpoint.router
                    .connect(bob)
                    .revertRedeemLocal(srcChainId, avax_endpoint.bridge.address, expectedNonce, bob.address, lzTxParams)
            ).to.be.revertedWith("NativeGasParams check")
        })

        it("retryRevert() - reverts when you try to send an invalid function", async function () {
            const srcChainId = avax_endpoint.chainId
            const dstChainId = eth_endpoint.chainId

            // remove gas object so it gets stored properly, then try to send it back the other way and hopefully get a revert
            await expect(avax_endpoint.router.connect(bob).redeemLocal(dstChainId, DAI, DAI, bob.address, 1000, bob.address, emptyLzTxObj))

            // nonce is actually the next one, hence +1
            const expectedNonce = (await avax_dai_pool.lzEndpoint.outboundNonce(dstChainId, avax_dai_pool.bridge.address)).add(1)
            await expect(
                eth_endpoint.router.connect(bob).retryRevert(srcChainId, avax_endpoint.bridge.address, expectedNonce)
            ).to.be.revertedWith("Stargate: invalid function type")
        })

        it("addLiquidity() - reverts when the safeTransferFrom fails", async function () {
            // pause transfers
            await avax_dai_pool.token.pauseTransfers(true)
            await expect(avax_dai_pool.router.addLiquidity(avax_dai_pool.id, 1, bob.address)).to.revertedWith("Stargate: TRANSFER_FROM_FAILED")
        })

        it("redeemLocalCheckOnRemote() - stores a payload on failed msg, then clears upon pool creation", async function () {
            const nonce = 1
            const srcChainId = 5
            const srcPoolId = 55
            const amountSD = BigNumber.from(69) // always keep it

            // simulate a situation where the user has already burned these lp tokens on the source side, and we are trying to complete the cycle on the other
            await expect(
                callAsContract(
                    avax_dai_pool.router,
                    avax_endpoint.bridge.address,
                    "redeemLocalCheckOnRemote(uint16,bytes,uint256,uint256,uint256,uint256,bytes)",
                    [srcChainId, eth_dai_pool.bridge.address, nonce, srcPoolId, avax_dai_pool.id, amountSD, bob.address]
                )
            )
                .to.emit(avax_dai_pool.router, "Revert")
                .withArgs(TYPE_REDEEM_LOCAL_RESPONSE, srcChainId, eth_dai_pool.bridge.address.toLowerCase(), nonce)

            // create and setup a pool for this to be sent to now
            await avax_endpoint.router.createChainPath(avax_dai_pool.id, srcChainId, srcPoolId, 1)
            await avax_endpoint.router.activateChainPath(avax_dai_pool.id, srcChainId, srcPoolId)
            await avax_endpoint.bridge.setBridge(srcChainId, eth_endpoint.bridge.address)

            await eth_endpoint.router.createPool(srcPoolId, eth_dai_pool.token.address, 18, 18, "x", "xx")
            await eth_endpoint.router.createChainPath(srcPoolId, avax_dai_pool.chainId, avax_dai_pool.id, 1)
            await eth_endpoint.router.activateChainPath(srcPoolId, avax_dai_pool.chainId, avax_dai_pool.id)
            const srcPool = await getPoolFromFactory(eth_endpoint.factory, srcPoolId)

            await expect(avax_dai_pool.router.retryRevert(srcChainId, eth_endpoint.bridge.address, nonce)).to.revertedWith(
                "Stargate: invalid function type"
            )

            // is a stored revert
            expect(await avax_dai_pool.router.revertLookup(srcChainId, eth_endpoint.bridge.address, nonce)).to.not.equal("0x")

            const userBalance = await srcPool.balanceOf(bob.address)

            // revert - the swap amount has been set to 0, because the deduction of chain path balances on the remote side failed
            // the full amount of lp that was attempted to burn, is minted back to the user, as if nothing happened
            await expect(
                avax_dai_pool.router.revertRedeemLocal(srcChainId, eth_endpoint.bridge.address, nonce, fakeContract.address, emptyLzTxObj)
            )
                .to.emit(srcPool, "RedeemLocalCallback")
                .withArgs(bob.address, 0, amountSD)

            // user gets minted back the full amount upon completion
            expect(await srcPool.balanceOf(bob.address)).to.equal(userBalance.add(amountSD))
            // make sure the payload is cleared
            expect(await avax_dai_pool.router.revertLookup(srcChainId, eth_endpoint.bridge.address, nonce)).to.equal("0x")
            // can not send another one
            await expect(avax_dai_pool.router.retryRevert(srcChainId, eth_endpoint.bridge.address, nonce)).to.revertedWith(
                "Stargate: no retry revert"
            )
        })

        it("redeemLocalCallback() - stores a payload on failed msg", async function () {
            const nonce = 1

            // pause transfers
            await avax_dai_pool.token.pauseTransfers(true)

            await expect(
                callAsContract(
                    avax_dai_pool.router,
                    avax_endpoint.bridge.address,
                    "redeemLocalCallback(uint16,bytes,uint256,uint256,uint256,address,uint256,uint256)",
                    [eth_dai_pool.chainId, eth_dai_pool.bridge.address, nonce, eth_dai_pool.id, avax_dai_pool.id, bob.address, 1, 1]
                )
            )
                .to.emit(avax_dai_pool.router, "Revert")
                .withArgs(TYPE_REDEEM_LOCAL_CALLBACK_RETRY, eth_dai_pool.chainId, eth_dai_pool.bridge.address.toLowerCase(), nonce)

            await expect(
                avax_dai_pool.router.revertRedeemLocal(
                    eth_dai_pool.chainId,
                    eth_endpoint.bridge.address,
                    nonce,
                    fakeContract.address,
                    emptyLzTxObj
                )
            ).to.revertedWith("Stargate: invalid function type")

            // unpause transfers and revert
            await avax_dai_pool.token.pauseTransfers(false)
            await avax_dai_pool.router.retryRevert(eth_dai_pool.chainId, eth_endpoint.bridge.address, nonce)

            // make sure the payload is cleared
            expect(await avax_dai_pool.router.revertLookup(eth_dai_pool.chainId, eth_endpoint.bridge.address, nonce)).to.equal("0x")
            // can not send another one
            await expect(avax_dai_pool.router.retryRevert(eth_dai_pool.chainId, eth_endpoint.bridge.address, nonce)).to.revertedWith(
                "Stargate: no retry revert"
            )
        })

        it("swapRemote() - stores a payload on failed msg", async function () {
            const nonce = 1

            // pause transfers
            await avax_dai_pool.token.pauseTransfers(true)

            await expect(
                callAsContract(
                    avax_dai_pool.router,
                    avax_endpoint.bridge.address,
                    "swapRemote(uint16,bytes,uint256,uint256,uint256,uint256,address,(uint256,uint256,uint256,uint256,uint256,uint256),bytes)",
                    [
                        avax_dai_pool.chainId,
                        avax_dai_pool.bridge.address,
                        nonce,
                        avax_dai_pool.id,
                        eth_dai_pool.id,
                        0,
                        bob.address,
                        defaultSwapObj,
                        "0x",
                    ]
                )
            )
                .to.emit(avax_dai_pool.router, "Revert")
                .withArgs(TYPE_SWAP_REMOTE_RETRY, avax_dai_pool.chainId, avax_dai_pool.bridge.address.toLowerCase(), nonce)

            await expect(
                avax_dai_pool.router.revertRedeemLocal(
                    avax_dai_pool.chainId,
                    avax_endpoint.bridge.address,
                    nonce,
                    fakeContract.address,
                    emptyLzTxObj
                )
            ).to.revertedWith("Stargate: invalid function type")

            // unpause transfers and revert
            await avax_dai_pool.token.pauseTransfers(false)
            await avax_dai_pool.router.retryRevert(avax_dai_pool.chainId, avax_endpoint.bridge.address, nonce)

            // make sure the payload is cleared
            expect(await avax_dai_pool.router.revertLookup(avax_dai_pool.chainId, avax_endpoint.bridge.address, nonce)).to.equal("0x")
            // can not send another one
            await expect(avax_dai_pool.router.retryRevert(avax_dai_pool.chainId, avax_endpoint.bridge.address, nonce)).to.revertedWith(
                "Stargate: no retry revert"
            )
        })

        it("instantRedeemLocal() - redeems less than the cap", async function () {
            const deltaCredit = await avax_dai_pool.pool.deltaCredit()
            const userBal = await avax_dai_pool.token.balanceOf(bob.address)
            await removeLiquidityInstant(avax_dai_pool, bob, deltaCredit.sub(1))
            expect(await avax_dai_pool.token.balanceOf(bob.address)).to.equal(userBal.add(deltaCredit.sub(1)))
        })

        it("instantRedeemLocal() - only burns/redeems the cap", async function () {
            const deltaCredit = await avax_dai_pool.pool.deltaCredit()
            const userBal = await avax_dai_pool.token.balanceOf(bob.address)
            // try to redeem 1 more than delta credits, should only get the max amount od delta credits back
            await removeLiquidityInstant(avax_dai_pool, bob, deltaCredit.add(1))
            expect(await avax_dai_pool.token.balanceOf(bob.address)).to.equal(userBal.add(deltaCredit))
        })

        it("instantRedeemLocal() - reverts when from address is 0x0", async function () {
            await addLiquidity(avax_dai_pool, alice, BigNumber.from(100))
            await expect(
                callAsContract(avax_dai_pool.pool, avax_dai_pool.router.address, "instantRedeemLocal(address,uint256,address)", [
                    ZERO_ADDRESS,
                    1,
                    alice.address,
                ])
            ).to.revertedWith("Stargate: _from cannot be 0x0")
        })

        it("redeemLocalCallback() - mints to user", async function () {
            const amountSD = BigNumber.from(1000)
            const amountToMintSD = BigNumber.from(435)
            let amountLP = amountLDtoSD(amountSDtoLD(amountToMintSD, avax_dai_pool), avax_dai_pool)

            const { totalSupply, totalLiquidity } = await getPoolState(avax_dai_pool)
            if (totalSupply.gt(0)) amountLP = amountLP.mul(totalSupply).div(totalLiquidity)

            const userLpBalance = await avax_dai_pool.pool.balanceOf(bob.address)

            await expect(
                callAsContract(avax_dai_pool.pool, avax_endpoint.router.address, "redeemLocalCallback(uint16,uint256,address,uint256,uint256)", [
                    eth_dai_pool.chainId,
                    eth_dai_pool.id,
                    bob.address,
                    amountSD,
                    amountToMintSD,
                ])
            )
                .to.emit(avax_dai_pool.pool, "RedeemLocalCallback")
                .withArgs(bob.address, amountSD, amountToMintSD)

            // make sure the user got the expected amount of lp
            expect(await avax_dai_pool.pool.balanceOf(bob.address)).to.equal(userLpBalance.add(amountLP))
        })

        it("redeemLocal() - reverts when amountSD is 0", async function () {
            const storageLocationTotalLiquidity = "0xe" // position in contract storage
            const setTotalLiquidityValue = "0x0000000000000000000000000000000000000000000000000000000000000001" // totalLiquidity = 1

            // set totalLiquidity to 1
            await network.provider.send("hardhat_setStorageAt", [
                avax_dai_pool.pool.address,
                storageLocationTotalLiquidity,
                setTotalLiquidityValue,
            ])

            await expect(callRedeemLocal(avax_dai_pool, eth_dai_pool, bob, 1000, emptyLzTxObj)).to.revertedWith(
                "Stargate: not enough lp to redeem with amountSD"
            )
        })
    })

    it("redeemLocal() - reverts when lp isnt enough", async function () {
        const nativeAmt = 100
        const encodedDstNativeAddr = encodePackedParams(["address"], [alice.address])
        const lzTxParams = { dstGasForCall: 0, dstNativeAmount: nativeAmt, dstNativeAddr: encodedDstNativeAddr }

        await addLiquidity(avax_dai_pool, alice, BigNumber.from("1"))

        await expect(removeLiquidityLocal(avax_dai_pool, eth_dai_pool, alice, BigNumber.from("0"), lzTxParams)).to.be.revertedWith(
            "Stargate: not enough lp to redeem"
        )
    })

    it("instantRedeemLocal() - reverts when totalLiquidity is 0", async function () {
        await expect(avax_dai_pool.router.connect(alice).instantRedeemLocal(avax_dai_pool.id, 1, ZERO_ADDRESS)).to.revertedWith(
            "Stargate: cant convert SDtoLP when totalLiq == 0'"
        )
    })
})
