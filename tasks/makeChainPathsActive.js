const { getEndpointIdByName } = require("@layerzerolabs/lz-sdk")

task("makeChainPathsActive", "activate the chainPaths for a pool")
    .addParam("poolId", "the pool id to create chain paths for")
    .addParam("targetNetworks", "csv network names to connect the local pool to remotely")
    .addParam("dstPoolIds", "csv of dstPoolIds to create chain paths for")

    .setAction(async (taskArgs) => {
        const Router = await ethers.getContractFactory("Router")
        const routerAddr = (await hre.deployments.get("Router")).address
        const router = await Router.attach(routerAddr)

        // get Factory to get pool
        const Factory = await ethers.getContractFactory("Factory")
        const factoryAddr = (await hre.deployments.get("Factory")).address
        const factory = await Factory.attach(factoryAddr)
        // get Pool
        let Pool = await ethers.getContractFactory("Pool")
        let poolData = await factory.getPool(taskArgs.poolId)
        let pool = await Pool.attach(poolData)

        let dstPoolIds = taskArgs.dstPoolIds.split(",")

        let targetNetworks = taskArgs.targetNetworks.split(",")
        for (let targetNetwork of targetNetworks) {
            let dstChainId = getEndpointIdByName(targetNetwork)

            for (let dstPoolId of dstPoolIds) {
                let chainPathIndex = await pool.chainPathIndexLookup(dstChainId, dstPoolId)
                let chainPath = await pool.chainPaths(chainPathIndex)
                if (chainPath.ready == true) {
                    console.log(
                        `✅ ${hre.network.name} > activateChainPath: poolId:${taskArgs.poolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId} | *already active* `
                    )
                    continue
                }

                let tx = await (await router.activateChainPath(taskArgs.poolId, dstChainId, dstPoolId)).wait()

                console.log(
                    `✅ ${hre.network.name} > activateChainPath: poolId:${taskArgs.poolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId}`
                )
                console.log(`    -> tx: ${tx.transactionHash}`)
            }
        }
    })
