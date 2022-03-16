task("setWeightForChainPath", "setWeightForChainPath function of a stargate router for initialization")
    .addParam("router", "The stargate Router address")
    .addParam("poolId", "the poolId")
    .addParam("destChainId", "the destination chainId")
    .addParam("weight", "the pool weight for this path (default: 1)")
    .setAction(async (taskArgs) => {
        console.log(`taskArgs: ${JSON.stringify(taskArgs)}`)

        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let Router = await ethers.getContractFactory("Router")
        let router = await Router.attach(taskArgs.router)

        let tx = await router.setWeightForChainPath(taskArgs.poolId, taskArgs.destChainId, taskArgs.weight, { gasLimit: 1000000 })
        console.log(`tx: ${JSON.stringify(tx)}`)
    })
