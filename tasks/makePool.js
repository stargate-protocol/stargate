const POOLS = require("../constants/pools.json")

task("makePool", "createPair on it as owner (this adds a new token for swap()ing)")
    .addParam("poolId", "the desired poolId for the new Pool being created")
    .addParam("sharedDecimals", "the least common amount of decimals for the token across chains")

    .setAction(async (taskArgs, hre) => {
        const Router = await ethers.getContractFactory("Router")
        const routerAddr = (await hre.deployments.get("Router")).address
        const router = await Router.attach(routerAddr)

        // make sure the token exists
        let Token = await ethers.getContractFactory("MockToken") // its an ERC20
        let tokenAddr = POOLS[taskArgs.poolId][hre.network.name]
        // console.log(POOLS)
        // console.log(taskArgs.poolId, hre.network.name)
        let token = await Token.attach(tokenAddr)
        let name = await token.name()
        let symbol = await token.symbol()
        let decimals = await token.decimals()

        let poolName = `${name}-LP`
        let poolSymbol = `S*${symbol}`

        try {
            let tx = await (
                await router.createPool(
                    taskArgs.poolId,
                    tokenAddr,
                    taskArgs.sharedDecimals, // Stargate pairs shared decimals across chains
                    decimals, // the tokens real decimals
                    poolName,
                    poolSymbol
                )
            ).wait(10)
            console.log(
                `✅ ${hre.network.name} > ${poolName} (${poolSymbol}) | createPair poolId[${taskArgs.poolId}] name:${name} symbol:${symbol} decimals:${decimals} address:${token.address}]`
            )
            console.log(`    -> tx.transactionHash: ${tx.transactionHash}`)
        } catch (e) {
            console.log(
                `✅ ${hre.network.name} > ${poolName} (${poolSymbol}) | createPair poolId[${taskArgs.poolId}] name:${name} symbol:${symbol} decimals:${decimals} address:${token.address}] | *already created*`
            )
        }
    })
