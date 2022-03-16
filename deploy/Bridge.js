// helper function to get the LayerZero endpoint address required by Bridge
let { getLayerZeroAddress } = require("../utils/layerzero")

function getDependencies() {
    if (hre.network.name === "hardhat") {
        return ["LZEndpointMock", "Router"]
    }
    return ["Router"]
}

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    let lzAddress
    if (hre.network.name === "hardhat") {
        lzAddress = (await deployments.get("LZEndpointMock")).address
        // console.log(`  -> LZEndpointMock: ${lzAddress}`)
    } else {
        console.log(`Network: ${hre.network.name}`)
        lzAddress = getLayerZeroAddress(hre.network.name)
        console.log(`  -> LayerZeroEndpoint: ${lzAddress}`)
    }

    let router = await ethers.getContract("Router")

    // deploy Bridge.sol
    await deploy("Bridge", {
        from: deployer,
        args: [lzAddress, router.address],
        log: true,
        skipIfAlreadyDeployed: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["Bridge", "test"]
module.exports.dependencies = getDependencies()
