const { POOLS } = require("@layerzerolabs/sg-sdk")
const { getEndpointId } = require("../utils/network")

task("createPools", "create the pools for the network").setAction(async (taskArgs) => {
    let router = await ethers.getContract("Router")
    let pools = POOLS[hre.network.name]
    // console.log(pools)
    // for(let poolId in pools){
    //     console.log(pools[poolId].info)
    //     console.log(`poolId: ${poolId}`)
    //     console.table(pools[poolId].chainPaths)
    // }

    // make sure the token exists
    let tx
    for (let poolId in pools) {
        console.log(pools[poolId].info)
        console.log(`poolId: ${poolId}`)
        console.table(pools[poolId].chainPaths)
        let sharedDecimals = pools[poolId].info.sharedDecimals
        let address = pools[poolId].info.address

        let Token = await ethers.getContractFactory("MockToken")
        let token = await Token.attach(address)
        let name = await token.name()
        let symbol = await token.symbol()
        let decimals = await token.decimals()

        let poolName = `${name}-LP`
        let poolSymbol = `S*${symbol}`

        const factory = await ethers.getContract("Factory")

        try {
            tx = await (
                await router.createPool(
                    poolId,
                    token.address,
                    sharedDecimals, // Stargate pairs shared decimals across chains
                    decimals, // the tokens real decimals
                    poolName,
                    poolSymbol
                )
            ).wait()
            let poolAddr = await factory.getPool(poolId)
            console.log(`[${getEndpointId()}] createPool | name:${name} symbol:${symbol} decimals:${decimals} address:${token.address}`)
            console.log(`- tx: ${tx.transactionHash} | pool.address: ${poolAddr} name: ${poolName} symbol: ${poolSymbol}`)
        } catch (e) {
            if (e.error.message.includes("Stargate: Pool already created")) {
                let poolAddr = await factory.getPool(poolId)
                console.log(
                    `[${getEndpointId()}] createPool | name:${name} symbol:${symbol} decimals:${decimals} address:${
                        token.address
                    } | *already created*`
                )
                console.log(`- pool.address: ${poolAddr} name: ${poolName} symbol: ${poolSymbol}`)
            }
        }
    }
})
