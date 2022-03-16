task("deployToken", "deploy a MockToken")
    .addParam("name", "the token name")
    .addParam("symbol", "the symbol")

    .setAction(async (taskArgs) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let MockToken = await ethers.getContractFactory("MockToken")
        let mockToken = await MockToken.deploy(taskArgs.name, taskArgs.symbol)
        console.log(`mockToken.address: ${mockToken.address}`)
        console.log(`name: ${await mockToken.name()} | symbol: ${await mockToken.symbol()}`)
    })
