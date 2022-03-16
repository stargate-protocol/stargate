// deploys and connects the three primary contracts of Stargate onto one chain
// this deploy file does not connect these contracts to other contracts.
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    let router = await ethers.getContract("Router")

    // deploy Factory.sol
    await deploy("Factory", {
        from: deployer,
        args: [router.address],
        log: true,
        skipIfAlreadyDeployed: true,
        waitConfirmations: 1,
    })

    // set router params
    let bridge = await ethers.getContract("Bridge")
    let factory = await ethers.getContract("Factory")

    let currRouterBridge = await router.bridge()
    let currRouterFactory = await router.factory()
    if (bridge.address !== currRouterBridge || factory.address !== currRouterFactory) {
        let tx = await (await router.setBridgeAndFactory(bridge.address, factory.address)).wait()
        if (hre.network.name !== "hardhat") {
            console.log(bridge.address, factory.address)
            console.log(`- router.setBridgeAndFactory( ${bridge.address}, ${factory.address} ) | tx: ${tx.transactionHash}`)
        }
    } else {
        if (hre.network.name !== "hardhat") {
            console.log(`- router.setBridgeAndFactory(${bridge.address}, ${factory.address}) | *already sets*`)
        }
    }
}

module.exports.tags = ["Factory", "test"]
module.exports.dependencies = ["Bridge", "Router"]
