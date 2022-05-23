const { getLayerZeroAddress } = require("../utils/layerzero")
const CONFIG = require("../constants/config.json")
const { isTestnet, isLocalhost } = require("../utils/network")
const { getEndpointIdByName } = require("@layerzerolabs/lz-sdk")

function getDependencies() {
    if (hre.network.name === "hardhat") {
        return ["LZEndpointMock"]
    }
}

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    let lzAddress
    if (hre.network.name === "hardhat") {
        lzAddress = (await deployments.get("LZEndpointMock")).address
        // console.log(`  -> StargateToken needs LayerZero: ${hre.network.name} LZEndpointMock: ${lzAddress}`)
    } else {
        console.log(hre.network.name)
        lzAddress = getLayerZeroAddress(hre.network.name)
        console.log(`  -> StargateToken needs LayerZero: ${hre.network.name} LayerZeroEndpoint: ${lzAddress}`)
    }

    let mainEndpointId = CONFIG.stargateToken.mainEndpointId // ETH
    if (isTestnet() && !isLocalhost()) {
        // for testnet, mint a bunch of tokens on every chain
        mainEndpointId = getEndpointIdByName(hre.network.name)
    }

    let tokenName = CONFIG.stargateToken.name
    let tokenSymbol = CONFIG.stargateToken.symbol
    if (hre.network.name !== "hardhat") {
        console.log(`StargateToken name: ${tokenName}, symbol:${tokenSymbol} | mainEndpointId: ${mainEndpointId} | isTestnet: ${isTestnet()}`)
    }
    await deploy("StargateToken", {
        from: deployer,
        args: [tokenName, tokenSymbol, lzAddress, mainEndpointId, CONFIG.stargateToken.initialSupplyMainEndpoint],
        log: true,
        skipIfAlreadyDeployed: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["StargateToken", "test"]
module.exports.dependencies = getDependencies()
