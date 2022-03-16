module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const factory = await ethers.getContract("Factory")

    const { address } = await deploy("StargateFeeLibraryV01", {
        from: deployer,
        args: [factory.address],
        log: true,
        waitConfirmations: 1,
        skipIfAlreadyDeployed: true,
    })

    if (hre.network.name !== "hardhat") {
        let tx
        let currFeeLibrary = await factory.defaultFeeLibrary()
        if (address !== currFeeLibrary) {
            tx = await (await factory.setDefaultFeeLibrary(address)).wait()
            console.log(`factory.setDefaultFeeLibrary(${address}) | tx: ${tx.transactionHash}`)
        } else {
            console.log(`factory.setDefaultFeeLibrary(${address}) | *already set*`)
        }
    }
}

module.exports.tags = ["StargateFeeLibraryV01", "test"]
module.exports.dependencies = ["Factory"]
