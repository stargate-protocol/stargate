task("addLiquidity", "add liquidity to stargate instance")
    .addParam("poolId", "the poolId")
    .addParam("qty", "the qty of tokens to add")
    .setAction(async (taskArgs, hre) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0]

        // factory / router
        const factory = await ethers.getContract("Factory")
        const router = await ethers.getContract("Router")

        // get the token from the router
        let Pool = await ethers.getContractFactory("Pool")
        let poolData = await factory.getPool(taskArgs.poolId) // return stg lp address
        let pool = await Pool.attach(poolData)
        let tokenAddr = await pool.token()
        console.log(`${hre.network.name} > addLiquidity poolId:${taskArgs.poolId} tokenAddr: ${tokenAddr}`)

        let MockToken = await ethers.getContractFactory("MockToken")
        let mockToken = await MockToken.attach(tokenAddr)
        let balance = await mockToken.balanceOf(owner.address)
        let allowance = await mockToken.allowance(owner.address, router.address)

        let amountInTokenDecimals = ethers.utils.parseUnits(taskArgs.qty, await mockToken.decimals())
        console.log(`amountInTokenDecimals: ${amountInTokenDecimals}`)

        await (await mockToken.mint(owner.address, amountInTokenDecimals)).wait(1)

        if (balance == 0 || balance < allowance) {
            await (await mockToken.mint(owner.address, amountInTokenDecimals)).wait(1)
            balance = await mockToken.balanceOf(owner.address)
            console.log(`    (now) we have this much to addLiquidity: ${balance}`)
        }

        let t = await mockToken.approve(router.address, amountInTokenDecimals) // give stargate router approval for this qty
        await t.wait(1)

        let tx = await (await router.addLiquidity(taskArgs.poolId, amountInTokenDecimals, owner.address)).wait(1)
        console.log(`💦 addLiquidity | tx: ${tx.transactionHash}`)
    })
