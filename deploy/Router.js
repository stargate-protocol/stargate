// deploys router and connects the three primary contracts of Stargate onto one chain
// this deploy file does not connect these contracts to other contracts.
module.exports = async ({ ethers, getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    await deploy("Router", {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["Router", "test"]
