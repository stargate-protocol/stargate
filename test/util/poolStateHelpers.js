const { ethers } = require("hardhat")
const { expect } = require("chai")
const { BigNumber } = require("ethers")
const { CHAIN_ID_TO_NAME, POOL_ID_TO_NAME } = require("./constants")
const util = require("util")

printEndpoints = (endpoints) => {
    let printFriendly = JSON.parse(JSON.stringify(endpoints))
    for (const [endpointId, endpoint] of Object.entries(printFriendly)) {
        endpoint.factory = endpoint.factory.address
        endpoint.router = endpoint.router.address
        endpoint.bridge = endpoint.bridge.address
        endpoint.lzEndpoint = endpoint.lzEndpoint.address
        endpoint.feeLibrary = endpoint.feeLibrary.address
        endpoint.pools = Object.fromEntries(
            Object.entries(endpoint.pools).map(([poolId, value]) => {
                const chainPaths = {}
                for (const [chainId, _chainPaths] of Object.entries(value.chainPaths)) {
                    chainPaths[CHAIN_ID_TO_NAME[chainId]] = Object.fromEntries(
                        Object.entries(_chainPaths).map(([x, y]) => [POOL_ID_TO_NAME[x], y])
                    )
                }
                delete value.dstChainWeights
                return [poolId, { ...value, token: value.token.address, pool: value.pool.address, chainPaths }]
            })
        )
        delete Object.assign(printFriendly, { [CHAIN_ID_TO_NAME[endpointId]]: printFriendly[endpointId] })[endpointId]
    }
    console.log(util.inspect(printFriendly, { showHidden: false, depth: null, colors: true }))
}

stringifyBigNumbers = (resp) => {
    if (resp instanceof Array) {
        return resp.map((x) => stringifyBigNumbers(x))
    } else if (BigNumber.isBigNumber(resp)) {
        return resp.toString()
    } else if (resp instanceof Object) {
        return Object.fromEntries(Object.entries(resp).map(([k, v]) => [k, stringifyBigNumbers(v)]))
    } else {
        return resp
    }
}

getPoolState = async (poolObj) => {
    return {
        actualLiquidity: await poolObj.token.balanceOf(poolObj.pool.address),
        totalLiquidity: await poolObj.pool.totalLiquidity(),
        totalSupply: await poolObj.pool.totalSupply(),
        protocolFeeBalance: await poolObj.pool.protocolFeeBalance(),
        eqFeePool: await poolObj.pool.eqFeePool(),
        mintFeeBalance: await poolObj.pool.mintFeeBalance(),
        deltaCredit: await poolObj.pool.deltaCredit(),
        convertRate: await poolObj.pool.convertRate(),
    }
}

getPoolStates = async (endpoints, poolIds) => {
    let resp = []
    for (const chainId of Object.keys(endpoints)) {
        let chain = endpoints[chainId]
        for (const poolId of poolIds) {
            let poolObj = chain.pools[poolId]
            resp.push(await getPoolState(poolObj))
        }
    }
    return resp
}

getTokenState = async (endpoints, tokenId) => {
    let resp = {}
    for (const endpoint of Object.values(endpoints)) {
        for (const [k, v] of Object.entries(await getPoolState(endpoint.pools[tokenId]))) {
            resp[k] = (resp[k] || BigNumber.from(0)).add(v)
        }
    }
    return resp
}

getPooledTokenState = async (endpoints, tokenIds) => {
    const resp = {}
    for (const tokenId of tokenIds) {
        for (const [k, v] of Object.entries(await getTokenState(endpoints, tokenId))) {
            resp[k] = (resp[k] || BigNumber.from(0)).add(v)
        }
    }
    return resp
}

// only pass token ids that are sharing pools of liquidity
// for individual tokens, just pass a list of 1
checkTokenState = async (endpoints, tokenIds) => {
    const tokenState = await getPooledTokenState(endpoints, tokenIds)
    const { actualLiquidity, totalLiquidity, protocolFeeBalance, eqFeePool, mintFeeBalance, deltaCredit } = tokenState

    const inferredLiquidity = totalLiquidity.add(protocolFeeBalance).add(eqFeePool).add(mintFeeBalance).add(deltaCredit)
    const diff = actualLiquidity.sub(inferredLiquidity)
    if (diff > 0) throw `Mismatched liquidity/fee balances -> ${diff}`

    return tokenState
}

getTokenBalances = async (listOfTokens, user) => {
    const resp = []
    for (const u of Array.isArray(user) ? user : [user]) {
        for (const [tokenName, token] of Object.entries(listOfTokens)) {
            const balance = await token.balanceOf(u.address)
            resp.push({ name: tokenName, balance })
        }
    }
    return resp
}

getTokenBalancesFromPools = async (listOfPoolObj, user) => {
    const listOfLpPools = Object.fromEntries(listOfPoolObj.map((poolObj) => [poolObj.name, poolObj.token]))
    return await getTokenBalances(listOfLpPools, user)
}

getLpBalancesFromPools = async (listOfPoolObj, user) => {
    const listOfTokens = Object.fromEntries(listOfPoolObj.map((poolObj) => [poolObj.name, poolObj.pool]))
    return await getTokenBalances(listOfTokens, user)
}

getChainPath = async (srcPoolObj, dstPoolObj) => {
    const cpIndex = await srcPoolObj.pool.chainPathIndexLookup(dstPoolObj.chainId, dstPoolObj.id)
    const deltaCredit = await srcPoolObj.pool.deltaCredit()
    let { dstChainId, dstPoolId, weight, balance, credits, lkb, idealBalance } = await srcPoolObj.pool.chainPaths(cpIndex)
    return { dstChainId, dstPoolId, weight, balance, credits, lkb, deltaCredit, idealBalance }
}

getChainPaths = async (srcPoolObj, dstPoolObj) => {
    return {
        srcChainPath: await getChainPath(srcPoolObj, dstPoolObj),
        dstChainPath: await getChainPath(dstPoolObj, srcPoolObj),
    }
}

getAllChainPaths = async (LisOfPoolObj) => {
    const resp = {}
    for (let a = 0; a < LisOfPoolObj.length; a++) {
        for (let b = 0; b < LisOfPoolObj.length; b++) {
            const srcPoolObj = LisOfPoolObj[a]
            const dstPoolObj = LisOfPoolObj[b]
            if (srcPoolObj.chainId === dstPoolObj.chainId) continue
            const chainPathName = `${srcPoolObj.name}->${dstPoolObj.name}`
            resp[chainPathName] = await getChainPath(srcPoolObj, dstPoolObj)
        }
    }
    return resp
}

printPoolStates = async (poolObjs) => {
    console.log("\nPool States: ")
    let totals = {}
    for (const poolObj of poolObjs) {
        const poolState = stringifyBigNumbers(await getPoolState(poolObj))

        for (const [k, v] of Object.entries(poolState)) {
            totals[k] = (totals[k] || BigNumber.from(0)).add(v)
        }

        console.log(
            `${poolObj.name} ->  `,
            `actualLiquidity: ${poolState.actualLiquidity} `,
            `totalLiquidity: ${poolState.totalLiquidity} `,
            `totalSupply: ${poolState.totalSupply} `,
            `protocolFeeBalance: ${poolState.protocolFeeBalance} `,
            `eqFeePool: ${poolState.eqFeePool} `,
            `mintFeeBalance: ${poolState.mintFeeBalance} `,
            `deltaCredit: ${poolState.deltaCredit} `,
            `convertRate: ${poolState.convertRate}`
        )
    }

    console.log(
        `      TOTALS:     `,
        `TotalActualLiquidity: ${totals.actualLiquidity} `,
        `TotalTotalLiquidity: ${totals.totalLiquidity} `,
        `TotalTotalSupply: ${totals.totalSupply} `,
        `TotalProtocolFeeBalance: ${totals.protocolFeeBalance} `,
        `TotalEqFeePool: ${totals.eqFeePool} `,
        `TotalMintFeeBalance: ${totals.mintFeeBalance} `,
        `TotalDeltaCredit: ${totals.deltaCredit} `
    )
}

printTokenStates = async (endpoints, tokenIds) => {
    console.log("\nToken States: ")
    for (const tokenId of tokenIds) {
        const tokenState = stringifyBigNumbers(await getTokenState(endpoints, tokenId))
        console.log(
            `actualLiquidity: ${tokenState.actualLiquidity} `,
            `totalLiquidity: ${tokenState.totalLiquidity} `,
            `totalSupply: ${tokenState.totalSupply} `,
            `deltaCredit: ${tokenState.deltaCredit} `
        )
    }
}

printPooledTokenStates = async (endpoints, tokenIds) => {
    console.log("\nPooled Token States:")
    const tokenState = stringifyBigNumbers(await getPooledTokenState(endpoints, tokenIds))
    console.log(
        `actualLiquidity: ${tokenState.actualLiquidity} `,
        `totalLiquidity: ${tokenState.totalLiquidity} `,
        `totalSupply: ${tokenState.totalSupply} `,
        `deltaCredit: ${tokenState.deltaCredit} `
    )
}

printChainPaths = async (listOfPoolObj) => {
    console.log("\nChain Paths: ")
    let totals = {}
    let a = await getAllChainPaths(listOfPoolObj)
    const chainPaths = stringifyBigNumbers(a)
    for (const [name, chainPath] of Object.entries(chainPaths)) {
        for (const [k, v] of Object.entries(chainPath)) {
            totals[k] = (totals[k] || BigNumber.from(0)).add(v)
        }

        console.log(
            `${name}:  `,
            `balance: ${chainPath.balance}  `,
            `credits: ${chainPath.credits}  `,
            `lkb: ${chainPath.lkb}  `,
            `weight: ${chainPath.weight}`,
            `ideal balance: ${chainPath.idealBalance}`
        )
    }

    console.log(
        `       TOTALS:       `,
        `balance: ${totals.balance}  `,
        `credits: ${totals.credits}  `,
        `lkb: ${totals.lkb}  `,
        `weight: ${totals.weight}`
    )
}

printLpBalancesFromPool = async (listOfPoolObj, users) => {
    console.log("\nLp Balances:")
    for (const user of users) {
        let a = await getLpBalancesFromPools(listOfPoolObj, user)
        const lpBalances = stringifyBigNumbers(a)
        for (const lpBalance of lpBalances) {
            console.log(`${user.name}: lp-${lpBalance.name} -> ${lpBalance.balance}`)
        }
    }
}

printTokenBalancesFromPool = async (listOfPoolObj, users) => {
    console.log("\nToken Balances: ")
    for (const user of users) {
        let a = await getTokenBalancesFromPools(listOfPoolObj, user)
        const tokenBalances = stringifyBigNumbers(a)
        for (const tokenBalance of tokenBalances) {
            console.log(`${user.name}: ${tokenBalance.name} -> ${tokenBalance.balance}`)
        }
    }
}

audit = async (endpoints, poolObjs) => {
    /*
  compute global metrics across all chains
  - globalBookedLiquidity = (pool.totalLiquidity) sum by chains
  - globalPromisedLiquidity = (unallocated liquidity (deltaCredits)
                                + allocated liquidity (lkb + credits)) sum by chains
 */
    let globalBookedLiquidity = ethers.BigNumber.from(0)
    let globalPromisedLiquidity = ethers.BigNumber.from(0)

    // for each chain
    for (const endpoint of endpoints) {
        let { chainId: srcChainId } = endpoint
        // filter for pools that are on this endpoint
        const srcPoolObjs = poolObjs.filter((pool) => pool.chainId == srcChainId)
        for (const srcPoolObj of srcPoolObjs) {
            //loop over chain paths of pool
            const { pool: srcPool, token, chainPaths, id: srcPoolId } = srcPoolObj

            let totalQueryBalance = (await token.balanceOf(srcPool.address))
                .div(await srcPool.convertRate())
                .sub(await srcPool.eqFeePool())
                .sub(await srcPool.protocolFeeBalance())
                .sub(await srcPool.mintFeeBalance())

            let totalPromisedBalance = await srcPool.deltaCredit()
            globalBookedLiquidity = globalBookedLiquidity.add(await srcPool.totalLiquidity())

            // for each iterate by destination chain
            for (const [dstChainId, dstPools] of Object.entries(chainPaths)) {
                for (const dstPoolId of Object.keys(dstPools)) {
                    const srcCP = await srcPool.chainPaths(await srcPool.chainPathIndexLookup(dstChainId, dstPoolId))

                    const dstPoolObjs = poolObjs.filter((pool) => pool.chainId == dstChainId && pool.id == dstPoolId)
                    for (const dstPoolObj of dstPoolObjs) {
                        const dstCP = await dstPoolObj.pool.chainPaths(await dstPoolObj.pool.chainPathIndexLookup(srcChainId, srcPoolId))

                        // if no msg inFlight, dstCp.lkb === srcCp.balance
                        const transactionInbound = srcCP.lkb.sub(dstCP.balance)
                        const promisedBalance = dstCP.balance.add(srcCP.credits)

                        totalPromisedBalance = totalPromisedBalance.add(transactionInbound).add(promisedBalance)
                    }
                }
            }
            if (totalPromisedBalance.toString() !== totalQueryBalance.toString()) {
                console.log("\n\n", "totalPromise: ", totalPromisedBalance.toString(), "totalQueryBalance: ", totalQueryBalance.toString())
            }
            /*
                    ASSERT - IFG constraints for Pool to all its associated chainPaths
             */
            expect(totalPromisedBalance).to.equal(totalQueryBalance)

            globalPromisedLiquidity = globalPromisedLiquidity.add(totalPromisedBalance)
        }
    }
    // this can only be asserted globally, as any transaction would temporarily make the pool imbalanced
    expect(globalPromisedLiquidity).to.equal(globalBookedLiquidity)
}

module.exports = {
    getPoolState,
    getPoolStates,
    printEndpoints,
    getTokenBalancesFromPools,
    getLpBalancesFromPools,
    getChainPath,
    getChainPaths,
    getAllChainPaths,
    stringifyBigNumbers,
    printPoolStates,
    printPooledTokenStates,
    printTokenStates,
    getTokenState,
    printChainPaths,
    printLpBalancesFromPool,
    printTokenBalancesFromPool,
    audit,
}
