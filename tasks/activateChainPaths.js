const { POOLS } = require("@layerzerolabs/stargate-sdk")
const { getEndpointId } = require("../utils/network")
const { getEndpointIdByName } = require("@layerzerolabs/core-sdk")

task("activateChainPaths", "activate chain paths")
    .addParam("targetNetwork", "activate chain paths for this destination targetNetwork")
    .setAction(async (taskArgs) => {
        let router = await ethers.getContract("Router")
        console.log(`router.address: ${router.address}`)

        const poolData = POOLS[hre.network.name]

        let tx
        for (let srcPoolId in poolData) {
            console.log(`mapping ${hre.network.name}[${getEndpointId()}] srcPoolId: ${srcPoolId}:`)
            let chainPaths = poolData[srcPoolId].chainPaths
            for (let dstObj of chainPaths) {
                let { dstChainId, dstPoolId, weight } = dstObj
                if (dstChainId != getEndpointIdByName(taskArgs.targetNetwork)) {
                    continue
                }
                try {
                    tx = await (await router.activateChainPath(srcPoolId, dstChainId, dstPoolId)).wait()
                    console.log(
                        ` ✅ activateChainPath: poolId:${srcPoolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId} | tx: ${tx.transactionHash}`
                    )
                } catch (e) {
                    if (e.error.message.includes("Stargate: chainPath is already active")) {
                        console.log(
                            ` ✅ activateChainPath: poolId:${srcPoolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId} | *already exists*`
                        )
                    } else {
                        console.log(e)
                        console.log("^ ERROR")
                    }
                }
            }
        }
    })
