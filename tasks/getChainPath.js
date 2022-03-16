const { ChainId } = require("@layerzerolabs/core-sdk")
const { PoolId } = require("@layerzerolabs/stargate-sdk")

task("getChainPath", "get chain path from the chainpaths map")
    .addParam("poolId", "the poolId")
    .setAction(async (taskArgs) => {
        // console.log(`taskArgs: ${JSON.stringify(taskArgs)}`);

        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)
        //
        // let Factory = await ethers.getContractFactory("Factory")
        // let factory = await Factory.attach(taskArgs.factory)
        //
        // let Router = await ethers.getContractFactory("Router")
        // let router = await Router.attach(taskArgs.router)
        // const Factory = await ethers.getContractFactory("Factory")
        // const factoryAddr = (await hre.deployments.get("Factory")).address
        // const factory = await Factory.attach(factoryAddr)

        const factory = await hre.ethers.getContract("Factory")

        let poolAddr = await factory.getPool(taskArgs.poolId)

        let Pool = await ethers.getContractFactory("Pool")
        let pool = await Pool.attach(poolAddr)

        const chainId = await getChainId(hre.network.name)

        console.log("chainId", chainId)

        const chainPathIndex = await pool.chainPathIndexLookup(ChainId.BSC_TESTNET, PoolId.USDC)
        console.log(`chainPathIndex: ${chainPathIndex}`)

        console.log(await pool.chainPaths(chainPathIndex))

        console.log(`poolAddr: ${poolAddr}`)
        console.log(`pool.poolId: ${await pool.poolId()}`)
        console.log(`pool.token: ${await pool.token()}`)
        console.log(`pool.sharedDecmals: ${await pool.sharedDecimals()}`)
        console.log(`pool.localDecimals: ${await pool.localDecimals()}`)
        console.log(`pool.totalLiquidity: ${await pool.totalLiquidity()}`)
        console.log(await pool.name(), await pool.symbol())
    })
