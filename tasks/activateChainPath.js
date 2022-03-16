task("activateChainPath", "given a Stargate router, activate chainPaths that owner knows have been created remotely")
    .addParam("router", "the stargate router address")
    .addParam("poolId", "the local pool id")
    .addParam("dstChainId", "dst chain id")
    .addParam("dstPoolId", "the pool id on the destination")

    .setAction(async (taskArgs) => {
        let router = await ethers.getContract("Router")
        console.log(`router.address: ${router.address}`)

        let tx = await (await router.activateChainPath(taskArgs.poolId, taskArgs.dstChainId, taskArgs.dstPoolId)).wait()
        console.log(
            `activateChainPath: poolId: ${taskArgs.poolId} dstChainId: ${taskArgs.dstChainId} dstPoolId: ${taskArgs.dstPoolId} | tx.transactionHash:${tx.transactionHash}`
        )
    })
