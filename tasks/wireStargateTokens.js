const { getDeploymentAddresses } = require("../utils/readDeployments")
const { getEndpointId } = require("../utils/network")
const { getEndpointIdByName } = require("@layerzerolabs/lz-sdk")

task("wireStargateTokens", "connect the local stargate to a remote stargate by configuring the remote bridge")
    .addParam("targetNetworks", "the remote Stargate instance named by network")

    .setAction(async (taskArgs, hre) => {
        const StargateToken = await ethers.getContractFactory("StargateToken")
        const stargateTokenAddr = (await hre.deployments.get("StargateToken")).address
        const stargateToken = await StargateToken.attach(stargateTokenAddr)

        let targetNetworks = taskArgs.targetNetworks.split(",")

        for (let targetNetwork of targetNetworks) {
            let targetNetworkAddrs = getDeploymentAddresses(targetNetwork)

            let dstChainId = getEndpointIdByName(targetNetwork)

            let currenDstStargateAddr = await stargateToken.dstContractLookup(dstChainId)
            let targetStargateTokenAddr = ethers.utils.getAddress(targetNetworkAddrs["StargateToken"]) // cast to standardized address
            if (currenDstStargateAddr !== "0x" && ethers.utils.getAddress(currenDstStargateAddr) == targetStargateTokenAddr) {
                console.log(` ✅ ${hre.network.name} > setDestination(${dstChainId}, ${targetStargateTokenAddr}) | *already set*`)
            } else {
                let tx = await (await stargateToken.setDestination(dstChainId, targetStargateTokenAddr)).wait(1)
                console.log(` ✅ ${hre.network.name} > setDestination(${dstChainId}, ${targetStargateTokenAddr}) | tx: ${tx.transactionHash}`)
            }
        }
    })
