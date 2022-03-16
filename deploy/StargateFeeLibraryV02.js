module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    const factory = await ethers.getContract("Factory")

    const { address } = await deploy("StargateFeeLibraryV02", {
        from: deployer,
        args: [factory.address],
        log: true,
        waitConfirmations: 1,
    })

    let tx
    let currFeeLibrary = await factory.defaultFeeLibrary()
    if (address !== currFeeLibrary) {
        tx = await (await factory.setDefaultFeeLibrary(address)).wait()
        if (hre.network.name !== "hardhat") {
            console.log(`factory.setDefaultFeeLibrary(${address}) | tx: ${tx.transactionHash}`)
        }
    } else {
        if (hre.network.name !== "hardhat") {
            console.log(`factory.setDefaultFeeLibrary(${address}) | *already set*`)
        }
    }
}

module.exports.tags = ["StargateFeeLibraryV02", "test"]
module.exports.dependencies = ["Factory"]
