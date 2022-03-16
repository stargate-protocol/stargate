task("swap", "swap using stargate")
    .addParam("router", "The stargate Router address (locally)")
    .addParam("factory", "The stargate Factory address (locally)")
    .addParam("poolId", "the poolId")
    .addParam("dstChainId", "the destination chainId")
    .addParam("qty", "the quantity to swap")
    .addParam("minQtyOut", "the minimum qty you want to get out")

    .setAction(async (taskArgs) => {
        console.log(`taskArgs: ${JSON.stringify(taskArgs)}`)

        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let Factory = await ethers.getContractFactory("Factory")
        let factory = await Factory.attach(taskArgs.factory)

        let Router = await ethers.getContractFactory("Router")
        let router = await Router.attach(taskArgs.router)

        // get the token address from the router for the pool id so we know the address to approve
        let Pool = await ethers.getContractFactory("Pool")
        let poolData = await factory.getPool(taskArgs.poolId)
        let pool = await Pool.attach(poolData)
        let poolTokenAddr = await pool.token()
        console.log(`swap() poolTokenAddr: ${poolTokenAddr}`)
        let MockToken = await ethers.getContractFactory("MockToken") // erc20
        let mockToken = await MockToken.attach(poolTokenAddr)
        await (await mockToken.approve(router.address, taskArgs.qty)).wait(1)

        let tx = await (
            await router.swap(
                taskArgs.dstChainId,
                taskArgs.poolId,
                owner.address,
                taskArgs.qty,
                taskArgs.minQtyOut,
                0,
                owner.address,
                "0x",
                { value: ethers.utils.parseEther("0.1") } // guess a value high enough , it refunds extra
            )
        ).wait()
        console.log(`tx.transactionHash: ${tx.transactionHash}`)
    })
