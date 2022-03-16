const { ethers } = require("hardhat")
const { getAddr } = require("./util/helpers")
const { setup } = require("./util/setup")
const { USDC, DAI, MIM, BUSD, TETHER, ETHEREUM, AVAX, POLYGON, BSC, OPTIMISM } = require("./util/constants")
const { executeAction } = require("./util/actions")
const {
    printPoolStates,
    printPooledTokenStates,
    printChainPaths,
    printLpBalancesFromPool,
    printTokenBalancesFromPool,
} = require("./util/poolStateHelpers")
const { audit } = require("./util/poolStateHelpers")

describe.skip("ExecuteAction: ", function () {
    this.timeout(600000000)

    let pools, endpoints, tokens, users
    // endpoints
    let eth_endpoint, polygon_endpoint, avax_endpoint, bsc_endpoint, optimism_endpoint
    // pools
    let eth_usdc_pool, eth_dai_pool, eth_mim_pool, eth_busd_pool, eth_tether_pool
    let avax_usdc_pool, avax_dai_pool, avax_mim_pool, avax_busd_pool, avax_tether_pool
    let polygon_usdc_pool, polygon_dai_pool, polygon_mim_pool, polygon_busd_pool, polygon_tether_pool
    let bsc_usdc_pool, bsc_dai_pool, bsc_mim_pool, bsc_busd_pool, bsc_tether_pool
    let optimism_usdc_pool, optimism_dai_pool, optimism_mim_pool, optimism_busd_pool, optimism_tether_pool
    // users
    let alice, bob, badUser1, fakeContract

    before(async function () {
        ;({ alice, bob, badUser1, fakeContract } = await getAddr(ethers))
    })

    // beforeEach(async function () {
    //     endpoints = await setup(3, 3, true)
    //     eth_endpoint = endpoints[ETHEREUM]
    //     avax_endpoint = endpoints[AVAX]
    //     polygon_endpoint = endpoints[POLYGON]
    //     ;({ [DAI]: eth_dai_pool, [USDC]: eth_usdc_pool, [MIM]: eth_mim_pool } = eth_endpoint.pools)
    //     ;({ [DAI]: avax_dai_pool, [USDC]: avax_usdc_pool, [MIM]: avax_mim_pool } = avax_endpoint.pools)
    //     ;({ [DAI]: polygon_dai_pool, [USDC]: polygon_usdc_pool, [MIM]: polygon_mim_pool } = polygon_endpoint.pools)
    //
    //     endpoints = [eth_endpoint, avax_endpoint, polygon_endpoint]
    //     pools = [
    //         eth_usdc_pool,
    //         eth_dai_pool,
    //         eth_mim_pool,
    //         avax_usdc_pool,
    //         avax_dai_pool,
    //         avax_mim_pool,
    //         polygon_usdc_pool,
    //         polygon_dai_pool,
    //         polygon_mim_pool,
    //     ]
    //     tokens = [DAI, USDC, MIM]
    //     users = [alice, bob]
    // })

    beforeEach(async function () {
        endpoints = await setup(5, 5, true)
        eth_endpoint = endpoints[ETHEREUM]
        avax_endpoint = endpoints[AVAX]
        polygon_endpoint = endpoints[POLYGON]
        bsc_endpoint = endpoints[BSC]
        optimism_endpoint = endpoints[OPTIMISM]
        ;({
            [DAI]: eth_dai_pool,
            [USDC]: eth_usdc_pool,
            [MIM]: eth_mim_pool,
            [BUSD]: eth_busd_pool,
            [TETHER]: eth_tether_pool,
        } = eth_endpoint.pools)
        ;({
            [DAI]: avax_dai_pool,
            [USDC]: avax_usdc_pool,
            [MIM]: avax_mim_pool,
            [BUSD]: avax_busd_pool,
            [TETHER]: avax_tether_pool,
        } = avax_endpoint.pools)
        ;({
            [DAI]: polygon_dai_pool,
            [USDC]: polygon_usdc_pool,
            [MIM]: polygon_mim_pool,
            [BUSD]: polygon_busd_pool,
            [TETHER]: polygon_tether_pool,
        } = polygon_endpoint.pools)
        ;({
            [DAI]: bsc_dai_pool,
            [USDC]: bsc_usdc_pool,
            [MIM]: bsc_mim_pool,
            [BUSD]: bsc_busd_pool,
            [TETHER]: bsc_tether_pool,
        } = bsc_endpoint.pools)
        ;({
            [DAI]: optimism_dai_pool,
            [USDC]: optimism_usdc_pool,
            [MIM]: optimism_mim_pool,
            [BUSD]: optimism_busd_pool,
            [TETHER]: optimism_tether_pool,
        } = optimism_endpoint.pools)

        endpoints = [eth_endpoint, avax_endpoint, polygon_endpoint, bsc_endpoint, optimism_endpoint]
        pools = [
            eth_usdc_pool,
            eth_dai_pool,
            eth_mim_pool,
            eth_busd_pool,
            eth_tether_pool,
            avax_usdc_pool,
            avax_dai_pool,
            avax_mim_pool,
            avax_busd_pool,
            avax_tether_pool,
            polygon_usdc_pool,
            polygon_dai_pool,
            polygon_mim_pool,
            polygon_busd_pool,
            polygon_tether_pool,
            bsc_usdc_pool,
            bsc_dai_pool,
            bsc_mim_pool,
            bsc_busd_pool,
            bsc_tether_pool,
            optimism_usdc_pool,
            optimism_dai_pool,
            optimism_mim_pool,
            optimism_busd_pool,
            optimism_tether_pool,
        ]
        tokens = [DAI, USDC, MIM, BUSD, TETHER]
        users = [alice, bob]
    })

    it("executeTransaction() - randomized tests", async function () {
        await Promise.all(
            pools.map(async (poolObj) => {
                poolObj.router.setFees(poolObj.id, 2)
                poolObj.router.setDeltaParam(
                    poolObj.id,
                    true,
                    500, // 5%
                    500, // 5%
                    true, //default
                    true //default
                )
            })
        )

        for (let i = 0; i < 1000000; i++) {
            try {
                await executeAction([alice, bob], pools, endpoints)
                if (i > 0 && i % 1000 === 0) {
                    require("fs").writeSync(process.stdout.fd, `${i} auditing \n`)
                    await audit(endpoints, pools)
                }
            } catch (e) {
                console.log(`fail at action ${i}`)
                await printPoolStates(pools)
                await printChainPaths(pools)
                await printPooledTokenStates(endpoints, tokens)
                await printTokenBalancesFromPool(pools, [alice, bob])
                await printLpBalancesFromPool(pools, [alice, bob])
                throw e
            }
        }
    })
})
