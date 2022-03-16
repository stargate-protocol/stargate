const {
    checkTokenBalance,
    amountLDtoSD,
    amountSDtoLD,
    getRoundingDust,
    getFeesFromFeeLibraryForPool,
    ZERO_ADDRESS,
    getDefaultLzTxParams,
} = require("./helpers")
const { getPoolState, getChainPaths } = require("./poolStateHelpers")
const { ethers } = require("hardhat")
const { expect } = require("chai")
const { BigNumber } = require("ethers")

const verbose = false

addLiquidity = async (srcPoolObj, user, amountLD) => {
    const { router, pool, token } = srcPoolObj
    const amountSD = amountLDtoSD(BigNumber.from(amountLD), srcPoolObj)

    // when converting between shared and local decimals, the rounding error just stays inside the users wallet
    const unspentSrcToken = getRoundingDust(amountLD, srcPoolObj)

    // pools
    const mintFeeSD = amountSD.mul(await pool.mintFeeBP()).div(await pool.BP_DENOMINATOR())
    const amountSDMinusMint = amountSD.sub(mintFeeSD)
    const mintFeeBal = await pool.mintFeeBalance()
    const totalLiquidity = await pool.totalLiquidity()
    const totalSupply = await pool.totalSupply()
    const lpBalUser = await pool.balanceOf(user.address)
    const amountLpTokens = totalSupply.toString() !== "0" ? amountSDMinusMint.mul(totalSupply).div(totalLiquidity) : amountSDMinusMint
    // tokens
    const srcUserTokenBal = await token.balanceOf(user.address)
    const srcPoolTokenBal = await token.balanceOf(pool.address)
    await token.mint(user.address, amountLD)
    await token.connect(user).increaseAllowance(router.address, amountLD)

    await callAddLiquidity(srcPoolObj, user, amountLD)

    // pools
    expect(await pool.mintFeeBalance()).to.equal(mintFeeBal.add(mintFeeSD))
    expect(await pool.totalLiquidity()).to.equal(totalLiquidity.add(amountSDMinusMint))
    // tokens
    await checkTokenBalance(token, user.address, srcUserTokenBal.add(unspentSrcToken))
    await checkTokenBalance(token, pool.address, srcPoolTokenBal.add(amountLD.sub(unspentSrcToken)))
    await checkTokenBalance(pool, user.address, lpBalUser.add(amountLpTokens))
}

// Local                                    Remote
// -------                                  ---------
// instantRedeemLocal(amount)
removeLiquidityInstant = async (poolObj, user, amountLP) => {
    const { pool, token } = poolObj

    // pools
    const { totalLiquidity, totalSupply } = await getPoolState(poolObj)
    const amountSD = totalLiquidity.eq(0) || totalSupply.eq(0) ? BigNumber.from(0) : amountLP.mul(totalLiquidity).div(totalSupply)
    // const amountLD = amountSDtoLD(amountSD, poolObj)
    // tokens
    const tokenUser = await token.balanceOf(user.address)
    const tokenPool = await token.balanceOf(pool.address)
    const lpTokenUser = await pool.balanceOf(user.address)

    const redeemResult = await callRedeemInstant(poolObj, user, amountLP, amountSD)

    // pools
    expect(await pool.totalLiquidity()).to.equal(totalLiquidity.sub(redeemResult.redeemSD))
    // tokens
    const redeemLD = amountSDtoLD(redeemResult.redeemSD, poolObj)
    await checkTokenBalance(token, user.address, tokenUser.add(redeemLD))
    await checkTokenBalance(token, pool.address, tokenPool.sub(redeemLD))
    await checkTokenBalance(pool, user.address, lpTokenUser.sub(redeemResult.redeemLP))
}

// Local                                    Remote
// -------                                  ---------
// redeemLocal(amount)   ->               withdrawRemote
// redeemLocalCallback             <-
removeLiquidityLocal = async (srcPoolObj, dstPoolObj, user, amountLP, lzTxParams = {}, endpoints = [], pools = [], delta = true) => {
    const { pool: srcPool, token: srcToken, router: srcRouter } = srcPoolObj
    const { pool: dstPool } = dstPoolObj
    lzTxParams = getDefaultLzTxParams(lzTxParams)

    // call delta ahead of state check, so we do not need to worry about this calculation
    if (delta) await srcRouter.callDelta(srcPoolObj.id, false)

    // pools
    const { totalLiquidity: srcTotalLiquidity, totalSupply: srcTotalSupply, deltaCredit: srcDeltaCredit } = await getPoolState(srcPoolObj)
    // const { totalLiquidity: dstTotalLiquidity } = await getPoolState(dstPoolObj)
    const srcAmountSD = srcTotalLiquidity.eq(0) || srcTotalSupply.eq(0) ? amountLP : amountLP.mul(srcTotalLiquidity).div(srcTotalSupply)
    // chain paths
    const { srcChainPath, dstChainPath } = await getChainPaths(srcPoolObj, dstPoolObj)
    // const srcIdealBalance = srcTotalLiquidity.sub(srcAmountSD).mul(srcChainPath.weight).div(await srcPool.totalWeight())
    // misc
    const srcLpTokenUser = await srcPool.balanceOf(user.address)
    // const srcTokenUser = await srcToken.balanceOf(user.address)

    await callRedeemLocal(srcPoolObj, dstPoolObj, user, amountLP, lzTxParams)

    // call audit before we go back from dst -> src
    // try {
    //     await audit(endpoints, pools)
    // } catch(e) {
    //     console.log('\n Audit failed before we went back dst -> src on redeemLocal')
    //     throw(e)
    // }

    // pools
    const { totalLiquidity: _srcTotalLiquidity, totalSupply: _srcTotalSupply } = await getPoolState(srcPoolObj)
    // const _dstDeltaCredit = await dstPool.deltaCredit()
    const _srcLpTokenUser = await srcPool.balanceOf(user.address)
    expect(_srcTotalLiquidity).to.equal(srcTotalLiquidity.sub(srcAmountSD))
    expect(_srcTotalSupply).to.equal(srcTotalSupply.sub(amountLP))
    expect(_srcLpTokenUser).to.equal(srcLpTokenUser.sub(amountLP))
    // chain paths
    const { dstChainPath: _dstChainPath } = await getChainPaths(srcPoolObj, dstPoolObj)
    // misc
    // let dstMintAmountSD = BigNumber.from(0)
    // let dstSwapAmountSD = BigNumber.from(0)
    // instant redeem, should only sendCredits
    if (srcAmountSD !== BigNumber.from(0)) {
        if (srcAmountSD.gt(dstChainPath.balance.add(srcChainPath.credits))) {
            // dstMintAmountSD = srcAmountSD.sub(dstChainPath.balance)
            // dstSwapAmountSD = dstChainPath.balance
            expect(_dstChainPath.balance).to.equal(0)
        } else {
            // dstSwapAmountSD = srcAmountSD
            // dstMintAmount = 0
        }
    }

    // const userTokensSD = (await srcToken.balanceOf(user.address)).sub(srcTokenUser)
    await callRevertRedeemLocal(srcPoolObj, dstPoolObj, user, lzTxParams)
}

// Local                                    Remote
// -------                                  ---------
// swap             ->                      swapRemote
removeLiquidityRemote = async (srcPoolObj, dstPoolObj, user, amountLP, lzTxParams = {}) => {
    const { pool: srcPool } = srcPoolObj
    const { pool: dstPool, token: dstToken } = dstPoolObj
    lzTxParams = getDefaultLzTxParams(lzTxParams)

    // call delta ahead of state checks, so we do not need to worry about this calculation
    // await callDelta(srcPoolObj, dstPoolObj, await srcPool.defaultLPMode())

    // pools
    const { totalLiquidity: srcTotalLiquidity, eqFeePool: srcEqFeePool, totalSupply: srcTotalSupply } = await getPoolState(srcPoolObj)
    const {
        totalLiquidity: dstTotalLiquidity,
        eqFeePool: dstEqFeePool,
        protocolFeeBalance: dstProtocolFeeBalance,
    } = await getPoolState(dstPoolObj)
    const srcAmountSD = srcTotalLiquidity.eq(0) || srcTotalSupply.eq(0) ? amountLP : amountLP.mul(srcTotalLiquidity).div(srcTotalSupply)

    // fees. to assert the view function return == the actual amount sent over chain and got applied to the ledger.
    const fees = await getFeesFromFeeLibraryForPool(srcPoolObj, dstPoolObj, user, srcAmountSD)
    const { eqFee: srcEqFee, protocolFee: srcProtocolFee, lpFee: srcLpFee, eqReward: srcEqReward } = fees

    // const logString = `redeemRemote Fee : eq ${srcEqFee} | protocol ${srcProtocolFee} | lp ${srcLpFee} | reward ${srcEqReward}`
    // require('fs').writeSync(process.stdout.fd, `        ${logString} \n`);

    const srcAmountToReceive = srcAmountSD.sub(srcEqFee).sub(srcProtocolFee).sub(srcLpFee)
    // tokens
    const dstTokenBalance = await dstToken.balanceOf(user.address)

    await callRedeemRemote(srcPoolObj, dstPoolObj, user, amountLP, srcAmountToReceive, lzTxParams)

    // pools
    await checkSrcGlobals(srcPool, srcTotalLiquidity.sub(srcAmountSD), srcEqFeePool.sub(srcEqReward))
    await checkDstGlobals(dstPool, dstTotalLiquidity.add(srcLpFee), dstEqFeePool.add(srcEqFee), dstProtocolFeeBalance.add(srcProtocolFee))
    // tokens
    const dstAmountLD = amountSDtoLD(srcAmountToReceive.add(srcEqReward), dstPoolObj)
    await checkTokenBalance(dstToken, user.address, dstTokenBalance.add(dstAmountLD))
}

// internal function used in mintSwapSafe
mintAndSwap = async (srcPoolObj, dstPoolObj, user, amountLD, lzTxParams = {}, delta = true) => {
    const { pool: srcPool, token: srcToken, router: srcRouter } = srcPoolObj
    const { pool: dstPool, token: dstToken } = dstPoolObj
    lzTxParams = getDefaultLzTxParams(lzTxParams)

    // call delta ahead of state checks so we dont need to worry about this calculation
    if (delta) await callDelta(srcPoolObj, dstPoolObj, await srcPool.defaultSwapMode())

    // misc
    const minAmountLD = BigNumber.from("1") //
    const srcAmountSD = amountLDtoSD(amountLD, srcPoolObj)
    // when converting between shared and local decimals, the rounding error just stays inside the users wallet
    const unspentSrcToken = getRoundingDust(amountLD, srcPoolObj)
    // pools
    const { totalLiquidity: srcTotalLiquidity, eqFeePool: srcEqFeePool } = await getPoolState(srcPoolObj)
    const {
        totalLiquidity: dstTotalLiquidity,
        eqFeePool: dstEqFeePool,
        protocolFeeBalance: dstProtocolFeeBalance,
    } = await getPoolState(dstPoolObj)
    // fees
    const {
        eqFee: srcEqFee,
        protocolFee: srcProtocolFee,
        lpFee: srcLpFee,
        eqReward: srcEqReward,
    } = await getFeesFromFeeLibraryForPool(srcPoolObj, dstPoolObj, user, srcAmountSD)
    const srcAmountToReceiveSD = srcAmountSD.sub(srcEqFee).sub(srcProtocolFee).sub(srcLpFee).add(srcEqReward)

    // tokens
    const srcUserTokenBal = await srcToken.balanceOf(user.address)
    const dstUserTokenBal = await dstToken.balanceOf(user.address)
    const srcPoolTokenBal = await srcToken.balanceOf(srcPool.address)
    await srcToken.mint(user.address, amountLD) // so that the user has money to swap
    await srcToken.connect(user).increaseAllowance(srcRouter.address, amountLD)

    const tx = await callSwap(srcPoolObj, dstPoolObj, user, amountLD, minAmountLD, lzTxParams)

    // pools
    await checkSrcGlobals(srcPool, srcTotalLiquidity, srcEqFeePool.sub(srcEqReward))
    await checkDstGlobals(dstPool, dstTotalLiquidity.add(srcLpFee), dstEqFeePool.add(srcEqFee), dstProtocolFeeBalance.add(srcProtocolFee))
    // tokens
    const dstAmountToReceive = amountSDtoLD(srcAmountToReceiveSD, dstPoolObj)
    await checkTokenBalance(srcToken, user.address, srcUserTokenBal.add(unspentSrcToken))
    await checkTokenBalance(dstToken, user.address, dstUserTokenBal.add(dstAmountToReceive))
    await checkTokenBalance(srcToken, srcPool.address, srcPoolTokenBal.add(amountLD.sub(unspentSrcToken)))

    return tx
}

callDelta = async (srcPoolObj, dstPoolObj, fullMode) => {
    await dstPoolObj.router.callDelta(dstPoolObj.id, fullMode)
    await dstPoolObj.router.callDelta(srcPoolObj.id, fullMode)
    await srcPoolObj.router.callDelta(dstPoolObj.id, fullMode)
    await srcPoolObj.router.callDelta(srcPoolObj.id, fullMode)
}

callAddLiquidity = async (poolObj, user, amountLd) => {
    await poolObj.router.connect(user).addLiquidity(poolObj.id, amountLd, user.address)
}

callRedeemInstant = async (poolObj, user, amountLP, amountSD) => {
    const { totalSupply, totalLiquidity, deltaCredit } = await getPoolState(poolObj)

    let redeemLP
    let redeemSD

    // may not redeem in full
    if (totalSupply.eq(0) || totalLiquidity.eq(0)) {
        redeemLP = BigNumber.from(0)
        redeemSD = BigNumber.from(0)
    } else {
        const capAmountLP = deltaCredit.mul(totalSupply).div(totalLiquidity)
        redeemLP = amountLP.gt(capAmountLP) ? capAmountLP : amountLP
        redeemSD = redeemLP.mul(totalLiquidity).div(totalSupply)
    }
    await expect(poolObj.router.connect(user).instantRedeemLocal(poolObj.id, amountLP, user.address))
        .to.emit(poolObj.pool, "InstantRedeemLocal")
        .withArgs(user.address, redeemLP, redeemSD, user.address)

    // return the actual amount got redeemed
    return { redeemSD, redeemLP }
}

callRedeemLocal = async (srcPoolObj, dstPoolObj, user, amount, lzTxParams) => {
    // due to async race conditions, when figuring out the nonce to pass to revertRedeemLocal,
    // should always query it via the event thats emitted on redeemLocal via the bridge contract
    await expect(
        srcPoolObj.router
            .connect(user)
            .redeemLocal(dstPoolObj.chainId, srcPoolObj.id, dstPoolObj.id, user.address, amount, user.address, lzTxParams)
    ).to.emit(dstPoolObj.router, "RevertRedeemLocal")
    // .withArgs(srcPoolObj.chainId, srcPoolObj.id, dstPoolObj.id, user.address.toLowerCase(), redeemAmount, mintBackAmount)

    await callDelta(srcPoolObj, dstPoolObj, false)
}

callRevertRedeemLocal = async (srcPoolObj, dstPoolObj, user, lzTxParams) => {
    // due to async race conditions, when figuring out the nonce to pass to revertRedeemLocal,
    // should always query it via the event thats emitted on redeemLocal via the bridge contract
    const nonce = await srcPoolObj.lzEndpoint.outboundNonce(dstPoolObj.chainId, srcPoolObj.bridge.address)

    await expect(
        dstPoolObj.router.connect(user).revertRedeemLocal(srcPoolObj.chainId, srcPoolObj.bridge.address, nonce, user.address, lzTxParams)
    ).to.emit(srcPoolObj.pool, "RedeemLocalCallback")

    // check the revert is consumed
    expect(await dstPoolObj.router.revertLookup(srcPoolObj.chainId, srcPoolObj.bridge.address, nonce)).to.equal("0x")
}

callRedeemRemote = async (srcPoolObj, dstPoolObj, user, amount, srcAmountToReceive, lzTxParams) => {
    await expect(
        srcPoolObj.router
            .connect(user)
            .redeemRemote(dstPoolObj.chainId, srcPoolObj.id, dstPoolObj.id, user.address, amount, 1, user.address, lzTxParams)
    ).to.emit(srcPoolObj.pool, "Swap")
}

callSwap = async (srcPoolObj, dstPoolObj, user, amountLD, minAmountLD, lzTxParams) => {
    return await srcPoolObj.router
        .connect(user)
        .swap(dstPoolObj.chainId, srcPoolObj.id, dstPoolObj.id, user.address, amountLD, minAmountLD, lzTxParams, user.address, "0x")
}

getRandomNumberFromBigNum = (amountBN) => {
    const bp = 100000000
    const numerator = Math.floor(Math.random() * bp)
    const randomVal = amountBN.mul(numerator).div(bp).toString()
    const index = Math.floor(Math.random() * randomVal.length)
    return BigNumber.from(randomVal.substring(0, index === 0 ? 1 : index))
}

withdrawFees = async (endpoints, user) => {
    // const logString =   `withdrawFees() Endpoints: ${endpoints.map(x => x.name)}  User: ${user.name}`
    // require('fs').writeSync(process.stdout.fd, `        ${logString} \n`);
    // console.log(
    //     `withdrawFees()          `,
    //     `Endpoints: ${endpoints.map(x => x.name)}           `,
    //     `User: ${user.name}`,
    // )
    for (const endpoint of Object.values(endpoints)) {
        for (const pool of Object.values(endpoint.pools)) {
            await endpoint.router.setMintFeeOwner(user.address)
            await endpoint.router.connect(user).withdrawMintFee(pool.id, user.address)

            await endpoint.router.setProtocolFeeOwner(user.address)
            await endpoint.router.connect(user).withdrawProtocolFee(pool.id, user.address)
        }
    }
}

equalize = async (endpoints, user = { address: ZERO_ADDRESS }, print = false) => {
    if (print) {
        const logString = `sendCredits() Endpoints: ${endpoints.map((x) => x.name)} User: ${user.name}`
        require("fs").writeSync(process.stdout.fd, `        ${logString} \n`)

        // console.log(
        //     `sendCredits()           `,
        //     `Endpoints: ${endpoints.map(x => x.name)}         `,
        //     `User: ${user.name}`,
        // )
    }

    for (const endpoint of Object.values(endpoints)) {
        for (const pool of Object.values(endpoint.pools)) {
            for (const [dstChainId, chainPaths] of Object.entries(pool.chainPaths)) {
                for (const dstPoolId of Object.keys(chainPaths)) {
                    await endpoint.router.sendCredits(dstChainId, pool.id, dstPoolId, user.address)
                }
            }
        }
    }
}

addLiquiditySafe = async (srcPoolObj, user) => {
    const decimals = await srcPoolObj.token.decimals()
    const amountLd = getRandomNumberFromBigNum(ethers.utils.parseUnits("100", decimals))
    // const logString =  `addLiquidity() Pool: ${srcPoolObj.name} User: ${user.name}  Amount: ${amountLd.toString()}`
    // require('fs').writeSync(process.stdout.fd, `        ${logString} \n`);
    // console.log(
    //     `addLiquidity()          `,
    //     `Pool: ${srcPoolObj.name}              `,
    //     `User: ${user.name} `,
    //     `Amount: ${amountLd.toString()}`,
    // )
    await addLiquidity(srcPoolObj, user, amountLd)
}

removeLiquidityInstantSafe = async (poolObj, user) => {
    const randomAmountLp = getRandomNumberFromBigNum(await poolObj.pool.deltaCredit())
    // console.log(
    //     `redeemLiquidityInstant()  `,
    //     `Pool: ${poolObj.name}  `,
    //     `User: ${user.name} `,
    //     `Amount: ${randomAmountLp.toString()}`,
    // )

    try {
        await removeLiquidityInstant(poolObj, user, randomAmountLp)
    } catch (e) {
        const { totalLiquidity, totalSupply } = await getPoolState(poolObj)
        const noLiquidity = totalLiquidity.eq(0)
        const noSupply = totalSupply.eq(0)
        const notEnoughLp = randomAmountLp.eq(0)
        const notEnoughLpToBurn = (await poolObj.pool.balanceOf(user.address)).lte(randomAmountLp)

        if (notEnoughLp && e.message.includes("Stargate: not enough lp to redeem")) {
            if (verbose) console.log(`        => cannot redeem 0 lp, failed as intended\n`)
        } else if (notEnoughLpToBurn && e.message.includes("Stargate: not enough LP tokens to burn")) {
            if (verbose) console.log(`        => cannot burn more lp than user has, failed as intended\n`)
        } else if (noLiquidity && e.message.includes("Stargate: cant convert SDtoLP when totalLiq == 0")) {
            if (verbose) console.log(`        => cannot convert SDtoLP when no totalLiquidity, failed as intended\n`)
        } else if (noSupply && e.message.includes("Stargate: cant burn when totalSupply == 0")) {
            if (verbose) console.log(`        => cannot burn when no totalSupply, failed as intended\n`)
        } else {
            const logString = `redeemLiquidityInstant()  Pool: ${poolObj.name}  User: ${user.name} Amount: ${randomAmountLp.toString()}`
            require("fs").writeSync(process.stdout.fd, `        ${logString} \n`)
            throw e
        }
    }
}

removeLiquidityLocalSafe = async (srcPoolObj, dstPoolObj, user, endpoints, pools) => {
    const randomAmountLp = getRandomNumberFromBigNum(await srcPoolObj.pool.balanceOf(user.address))
    // console.log(
    //     `redeemLiquidityLocal()  `,
    //     `Pools: ${srcPoolObj.name} -> ${dstPoolObj.name}  `,
    //     `User: ${user.name} `,
    //     `Amount: ${randomAmountLp.toString()}`,
    // )

    const notEnoughLp = randomAmountLp.eq(0)

    try {
        await removeLiquidityLocal(srcPoolObj, dstPoolObj, user, randomAmountLp, {}, endpoints, pools)
    } catch (e) {
        if (notEnoughLp && e.message.includes("Stargate: not enough lp to redeem")) {
            if (verbose) console.log(`        => cannot redeem 0 lp, failed as intended\n`)
        } else {
            const logString = `redeemLiquidityLocal()  Pools: ${srcPoolObj.name} -> ${dstPoolObj.name} User: ${
                user.name
            } Amount: ${randomAmountLp.toString()}`
            require("fs").writeSync(process.stdout.fd, `        ${logString} \n`)
            throw e
        }
    }
}

removeLiquidityRemoteSafe = async (srcPoolObj, dstPoolObj, user) => {
    const randomAmountLp = getRandomNumberFromBigNum(await srcPoolObj.pool.balanceOf(user.address))
    // console.log(
    //     `redeemLiquidityRemote() `,
    //     `Pools: ${srcPoolObj.name} -> ${dstPoolObj.name}  `,
    //     `User: ${user.name} `,
    //     `Amount: ${randomAmountLp.toString()}`,
    // )

    const { totalSupply } = await getPoolState(srcPoolObj)
    // const noLiquidity = totalLiquidity.eq(0)
    const noSupply = totalSupply.eq(0)

    let dstBalanceTooLow = false
    let feeTooHigh = false

    try {
        const { totalLiquidity, totalSupply } = await getPoolState(srcPoolObj)
        const srcAmountSD = totalLiquidity.eq(0) || totalSupply.eq(0) ? randomAmountLp : randomAmountLp.mul(totalLiquidity).div(totalSupply)
        const { protocolFee, eqFee, lpFee, eqReward } = await getFeesFromFeeLibraryForPool(srcPoolObj, dstPoolObj, user, srcAmountSD)
        // swap amount < total Fee
        if (eqFee.add(protocolFee).add(lpFee).gt(srcAmountSD)) {
            feeTooHigh = true
        }
        const srcLkbRemove = srcAmountSD.sub(lpFee).add(eqReward)
        const { srcChainPath } = await getChainPaths(srcPoolObj, dstPoolObj)
        dstBalanceTooLow = srcChainPath.balance.lt(srcLkbRemove)
    } catch (e) {
        if (e.message.includes("Stargate: not enough balance")) {
            dstBalanceTooLow = true
        } else {
            throw e
        }
    }

    try {
        await removeLiquidityRemote(srcPoolObj, dstPoolObj, user, randomAmountLp, {})
    } catch (e) {
        if (dstBalanceTooLow && e.message.includes("Stargate: not enough balance")) {
            if (verbose) console.log(`        => cp.balance and fees are not high enough, failed as intended\n`)
            return
        } else if (dstBalanceTooLow && e.message.includes("Stargate: dst balance too low")) {
            if (verbose) console.log(`        => cp.balance was not high enough, failed as intended\n`)
            return
        } else if (noSupply && e.message.includes("Stargate: cant convert LPtoSD when totalSupply == 0")) {
            if (verbose) console.log(`        => cant convert LPtoSD when totalSupply == 0, failed as intended\n`)
            return
        } else if (randomAmountLp.eq(0) && e.message.includes("Stargate: not enough lp to redeemRemote")) {
            if (verbose) console.log(`        => amount of lp to redeem was 0, failed as intended\n`)
            return
        } else if (feeTooHigh && e.message.includes("SafeMath: subtraction overflow")) {
            if (verbose) console.log("       fee > total swap amount. failed as intended")
            return
        } else {
            const logString = `redeemLiquidityRemote() Pools: ${srcPoolObj.name} -> ${dstPoolObj.name} User: ${
                user.name
            }  Amount: ${randomAmountLp.toString()}`
            require("fs").writeSync(process.stdout.fd, `        ${logString} \n`)
            throw e
        }
    }

    if (dstBalanceTooLow) throw "Tx should have failed with: dst balance too low"
}

mintAndSwapSafe = async (srcPoolObj, dstPoolObj, user) => {
    const decimals = await srcPoolObj.token.decimals()
    const amountLd = getRandomNumberFromBigNum(ethers.utils.parseUnits("100", decimals))

    // console.log(
    //     `swap()                  `,
    //     `Pools: ${srcPoolObj.name} -> ${dstPoolObj.name}  `,
    //     `User: ${user.name} `,
    //     `Amount: ${amountLd.toString()}`,
    // )

    let feeTooHigh = false
    let dstBalanceTooLow = false
    const srcAmountSD = amountLDtoSD(amountLd, srcPoolObj)
    try {
        const { lpFee, eqFee, eqReward, protocolFee } = await getFeesFromFeeLibraryForPool(srcPoolObj, dstPoolObj, user, srcAmountSD)
        if (eqFee.add(protocolFee).add(lpFee).gt(srcAmountSD)) {
            feeTooHigh = true
        }
        const srcLkbRemove = srcAmountSD.sub(lpFee).add(eqReward)
        const { srcChainPath } = await getChainPaths(srcPoolObj, dstPoolObj)
        dstBalanceTooLow = srcChainPath.balance.lt(srcLkbRemove)
    } catch (e) {
        if (e.message.includes("Stargate: not enough balance")) {
            dstBalanceTooLow = true
        } else {
            throw e
        }
    }

    try {
        await mintAndSwap(srcPoolObj, dstPoolObj, user, amountLd, {})
    } catch (e) {
        if (dstBalanceTooLow && e.message.includes("Stargate: not enough balance")) {
            if (verbose) console.log(`        => cp.balance and fees are not high enough, failed as intended\n`)
            return
        } else if (dstBalanceTooLow && e.message.includes("Stargate: dst balance too low")) {
            if (verbose) console.log(`        => cp.balance is not high enough, failed as intended\n`)
            return
        } else if (feeTooHigh && e.message.includes("SafeMath: subtraction overflow")) {
            if (verbose) console.log("       fee > total swap amount. failed as intended")
            return
        } else {
            const logString = `swap() Pools: ${srcPoolObj.name} -> ${dstPoolObj.name} User: ${user.name} Amount: ${amountLd.toString()}`
            require("fs").writeSync(process.stdout.fd, `        ${logString} \n`)
            throw e
        }
    }

    if (dstBalanceTooLow) throw "Tx should have failed with: dst balance too low"
}

mintAndSwapUnsafe = async (srcPoolObj, dstPoolObj, user, amountSD, lzTxParams) => {
    await srcPoolObj.token.mint(user.address, amountSD)
    await srcPoolObj.token.connect(user).increaseAllowance(srcPoolObj.router.address, amountSD)
    await callSwap(srcPoolObj, dstPoolObj, user, amountSD, 0, lzTxParams)
}

executeAction = async (users, pools, endpoints) => {
    const user = getRandomUser(users)
    const [srcPoolObj, dstPoolObj] = getRandomSrcAndDstPool(pools)
    const [actionName, action] = getRandomAction()

    switch (actionName) {
        case "addLiquidity":
            await action(srcPoolObj, user)
            break
        case "removeLiquidityInstant":
            await action(srcPoolObj, user)
            break
        case "removeLiquidityLocal":
            await action(srcPoolObj, dstPoolObj, user, endpoints, pools) // special params because we audit mid tx
            break
        case "removeLiquidityRemote":
            await action(srcPoolObj, dstPoolObj, user)
            break
        case "swap":
            await action(srcPoolObj, dstPoolObj, user)
            break
        case "equalize":
            await action(endpoints, user)
            break
        case "withdrawFees":
            await action(endpoints, user)
            break
    }

    // await audit(endpoints, pools)
}

getRandomFromList = (list) => {
    return list[Math.floor(Math.random() * list.length)]
}

getRandomUser = (users) => {
    return getRandomFromList(users)
}

getRandomEndpoint = (endpoints) => {
    return getRandomFromList(endpoints)
}

getRandomAction = function () {
    const funcName = getRandomFromList(Object.keys(actions))
    const func = actions[funcName]
    return [funcName, func]
}

getRandomSrcAndDstPool = (pools) => {
    const shuffled = pools.sort(() => 0.5 - Math.random())
    const [src, dst] = shuffled.slice(0, 2)

    // try again if we get a local chain
    if (src.chainId === dst.chainId) {
        return getRandomSrcAndDstPool(pools)
    } else {
        return [src, dst]
    }
}

actions = {
    addLiquidity: addLiquiditySafe,
    removeLiquidityInstant: removeLiquidityInstantSafe,
    removeLiquidityLocal: removeLiquidityLocalSafe,
    removeLiquidityRemote: removeLiquidityRemoteSafe,
    swap: mintAndSwapSafe,
    equalize: equalize,
    withdrawFees: withdrawFees,
}

checkSrcGlobals = async (srcPool, expectedLiq, expectedEqFee) => {
    expect(await srcPool.totalLiquidity()).to.equal(expectedLiq)
    expect(await srcPool.eqFeePool()).to.equal(expectedEqFee)
}

checkDstGlobals = async (dstPool, expectedLiq, expectedEqFee, expectedProtocolFee) => {
    expect(await dstPool.totalLiquidity()).to.equal(expectedLiq)
    expect(await dstPool.eqFeePool()).to.equal(expectedEqFee)
    expect(await dstPool.protocolFeeBalance()).to.equal(expectedProtocolFee)
}

module.exports = {
    mintAndSwap,
    mintAndSwapUnsafe,
    addLiquidity,
    removeLiquidityInstant,
    removeLiquidityLocal,
    removeLiquidityRemote,
    withdrawFees,
    equalize,
    executeAction,
    callSwap,
    callRedeemLocal,
}
