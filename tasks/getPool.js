task("getPool", "get Pool info from a Stargate Router ")
    // .addParam("router", "The stargate Router address (locally)")
    // .addParam("factory", "The stargate Factory address (locally)")
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
        console.log(`poolAddr: ${poolAddr}`)

        let Pool = await ethers.getContractFactory("Pool")
        let pool = await Pool.attach(poolAddr)

        console.log(`pool.poolId: ${await pool.poolId()}`)
        console.log(`pool.feeLibrary: ${await pool.feeLibrary()}`)
        console.log(`pool.token: ${await pool.token()}`)
        console.log(`pool.sharedDecmals: ${await pool.sharedDecimals()}`)
        console.log(`pool.localDecimals: ${await pool.localDecimals()}`)
        console.log(`pool.totalLiquidity: ${await pool.totalLiquidity()}`)
        console.log(await pool.name(), await pool.symbol())
    })
