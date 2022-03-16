task("getBridge", "get bridge for chain id")
    .addParam("local", "the local bridge address")
    .addParam("chainId", "the remote chainId")
    .setAction(async (taskArgs) => {
        console.log(`taskArgs: ${JSON.stringify(taskArgs)}`)

        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        console.log(`owner: ${owner.address}`)

        let Bridge = await ethers.getContractFactory("Bridge")
        let bridge = await Bridge.attach(taskArgs.local)

        let remoteBridgeAddr = await bridge.bridgeLookup(taskArgs.chainId)
        console.log(`remoteBridgeAddr for ${taskArgs.chainId}: ${remoteBridgeAddr}`)
    })
