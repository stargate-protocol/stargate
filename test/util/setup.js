const { deployNew } = require("./helpers")
const { CHAIN_ID_TO_NAME, POOL_ID_TO_NAME } = require("./constants")

setup = async (numOfChains, numOfTokens, random = false) => {
    const config = generateConfig(numOfChains, numOfTokens, random)

    // deploy the stargate instances on each "chain"
    let endpoints = Object.fromEntries(
        await Promise.all(Object.values(config).map(async (endpoint) => [endpoint.chainId, await deployStargateEndpoint(endpoint)]))
    )
    await bridgeEndpoints(endpoints)
    await deployPoolsOnChains(endpoints)
    await createChainPaths(endpoints)
    await activateChainPaths(endpoints)
    return endpoints
}

generateConfig = (numOfChains, numOfTokens, random) => {
    const endpoints = {}
    const lds = {}

    for (let chainId = 1; chainId <= numOfChains; chainId++) {
        const config = { chainId, name: CHAIN_ID_TO_NAME[chainId], pools: {} }

        for (let tokenId = 11; tokenId <= numOfTokens * 11; tokenId += 11) {
            const ld = random ? Math.floor(Math.random() * 18) : 18

            if (lds[tokenId]) {
                lds[tokenId].push(ld)
            } else {
                lds[tokenId] = [ld]
            }

            const pool = { id: tokenId, chainId, name: POOL_ID_TO_NAME[tokenId], ld, dstChainWeights: {} }

            for (let dstChainId = 1; dstChainId <= numOfChains; dstChainId++) {
                if (dstChainId !== chainId) {
                    pool.dstChainWeights[dstChainId] = {}
                    for (let dstTokenId = 11; dstTokenId <= numOfTokens * 11; dstTokenId += 11) {
                        pool.dstChainWeights[dstChainId][dstTokenId] = random ? Math.floor(Math.random() * 99) + 1 : 1
                    }
                }
            }
            config.pools[tokenId] = pool
        }
        endpoints[chainId] = config
    }

    for (const [_tokenId, _lds] of Object.entries(lds)) {
        lds[_tokenId] = Math.min(..._lds)
    }

    for (const endpoint of Object.values(endpoints)) {
        for (const pool of Object.values(endpoint.pools)) {
            pool["sd"] = lds[pool.id]
        }
    }

    return endpoints
}

deployStargateEndpoint = async (endpoint) => {
    const lzEndpoint = await deployNew("LZEndpointMock", [endpoint.chainId])
    const router = await deployNew("Router")
    const bridge = await deployNew("Bridge", [lzEndpoint.address, router.address])
    const factory = await deployNew("Factory", [router.address])
    const feeLibrary = await deployNew("StargateFeeLibraryV02", [factory.address])

    // set deploy params
    await factory.setDefaultFeeLibrary(feeLibrary.address)
    await router.setBridgeAndFactory(bridge.address, factory.address)

    return { factory, router, bridge, lzEndpoint, feeLibrary, ...endpoint }
}

bridgeEndpoints = async (endpoints) => {
    for (const src of Object.values(endpoints)) {
        for (const dst of Object.values(endpoints)) {
            await src.bridge.setBridge(dst.chainId, dst.bridge.address)
            await src.lzEndpoint.setDestLzEndpoint(dst.bridge.address, dst.lzEndpoint.address)
        }
    }
}

deployPoolsOnChains = async (endpoints) => {
    for (const endpoint of Object.values(endpoints)) {
        endpoint.pools = Object.fromEntries(
            await Promise.all(
                Object.values(endpoint.pools).map(async (pool) => {
                    const poolObj = {
                        ...pool,
                        lzEndpoint: endpoint.lzEndpoint,
                        router: endpoint.router,
                        bridge: endpoint.bridge,
                        dstChainWeights: pool.dstChainWeights,
                        ...(await deployPool(endpoint, pool.name, pool.ld, pool.sd, pool.id)),
                    }

                    return [pool.id, poolObj]
                })
            )
        )
    }
}

deployPool = async (sgEndpoint, name, ld, sd, id) => {
    let tokenName = `${name}-${sgEndpoint.name}`
    const token = await deployNew("MockToken", [tokenName, tokenName, ld])

    await sgEndpoint.router.createPool(id, token.address, sd, ld, "x", "x*")
    let poolAddress = await sgEndpoint.factory.getPool(id)
    const Pool = await ethers.getContractFactory("Pool")
    let pool = await Pool.attach(poolAddress)

    return { token, pool, name: tokenName, id, ld, sd, chainPaths: {} }
}

createChainPaths = async (endpoints) => {
    for (const endpoint of Object.values(endpoints)) {
        for (const pool of Object.values(endpoint.pools)) {
            pool.chainPaths = {}
            for (const [chainId, pathWeights] of Object.entries(pool.dstChainWeights)) {
                pool.chainPaths[chainId] = {}
                for (const [tokenId, weight] of Object.entries(pathWeights)) {
                    await endpoint.router.createChainPath(pool.id, chainId, tokenId, weight)
                    pool.chainPaths[chainId][tokenId] = false
                }
            }
        }
    }
}

activateChainPaths = async (endpoints) => {
    for (const endpoint of Object.values(endpoints)) {
        for (const pool of Object.values(endpoint.pools)) {
            for (const [chainId, chainPaths] of Object.entries(pool.chainPaths)) {
                for (const tokenId of Object.keys(chainPaths)) {
                    await endpoint.router.activateChainPath(pool.id, chainId, tokenId)
                    pool.chainPaths[chainId][tokenId] = true
                }
            }
        }
    }
}

module.exports = {
    setup,
    deployPool,
}
