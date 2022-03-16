module.exports = async ({ ethers, getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const stargateToken = await deployments.get("StargateToken")
    const blockNumber = (await ethers.provider.getBlock()).number // get block number
    const emissionPerBlock = ethers.utils.parseEther("1.0").toString() // emissions in StargateToken per block;
    const startBlock = blockNumber + 100 // start block must be after the currentBlock
    const bonusEndBlock = startBlock + 1

    if (hre.network.name !== "hardhat") {
        console.log(`deployer: ${(await ethers.getSigners())[0].address}`)
        console.log(`STG token: ${stargateToken.address}`)
        console.log(`current blockNumber: ${blockNumber}`)
        console.log(`deploying [${hre.network.name}] LPStaking:`)
        console.log(
            "stargateToken",
            stargateToken.address,
            "emissionPerBlock",
            emissionPerBlock,
            "startBlock",
            startBlock,
            "bonusEndBlock",
            bonusEndBlock
        )
    }

    await deploy("LPStaking", {
        from: deployer,
        args: [stargateToken.address, emissionPerBlock, startBlock, bonusEndBlock],
        skipIfAlreadyDeployed: true,
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["LPStaking", "test"]
module.exports.dependencies = ["StargateToken"]
