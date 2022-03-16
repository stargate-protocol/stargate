task("createChainPath", "createChainPath function of a stargate router for initialization")
    .addParam("router", "The stargate Router address")
    .addParam("poolId", "the poolId")
    .addParam("dstChainId", "the destination chainId")
    .addParam("dstPoolId", "the destination poolId")
    .addParam("weight", "the pool weight for this path (default: 1)")
    .setAction(async (taskArgs) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let Router = await ethers.getContractFactory("Router")
        let router = await Router.attach(taskArgs.router)

        let tx = await (await router.createChainPath(taskArgs.poolId, taskArgs.dstChainId, taskArgs.dstPoolId, taskArgs.weight)).wait()
        console.log(`tx.transactionHash: ${tx.transactionHash}`)
    })
