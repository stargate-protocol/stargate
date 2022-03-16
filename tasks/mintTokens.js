task("mintTokens", "mint tokens to an address if it has a mint() function")
    .addParam("token", "the token address")
    .addParam("addr", "mint to this address")
    .addParam("qty", "the the qty to mint")
    .setAction(async (taskArgs) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let MockToken = await ethers.getContractFactory("MockToken")
        let mockToken = await MockToken.attach(taskArgs.token)

        let tx = await mockToken.mint(taskArgs.addr, taskArgs.qty)
        console.log(`tx: ${JSON.stringify(tx)}`)
    })
