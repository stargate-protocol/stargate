const { POOLS } = require("@layerzerolabs/sg-sdk")
const { getEndpointId } = require("../utils/network")
const { getEndpointIdByName } = require("@layerzerolabs/lz-sdk")

task("createChainPaths", "given a Stargate router, create chainPaths for a token")
    .addParam("targetNetwork", "the stargate router address")
    .setAction(async (taskArgs) => {
        let router = await ethers.getContract("Router")
        console.log(`router.address: ${router.address}`)

        const poolData = POOLS[hre.network.name]
        console.table(poolData)

        let tx
        for (let srcPoolId in poolData) {
            console.log(`mapping ${hre.network.name}[${getEndpointId()}] srcPoolId: ${srcPoolId}`)
            let chainPaths = poolData[srcPoolId].chainPaths
            for (let dstObj of chainPaths) {
                let { dstChainId, dstPoolId, weight } = dstObj
                if (dstChainId != getEndpointIdByName(taskArgs.targetNetwork)) {
                    continue
                }
                try {
                    tx = await (await router.createChainPath(srcPoolId, dstChainId, dstPoolId, weight)).wait()
                    console.log(`✅ createChainPath: poolId:${srcPoolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId} weight:${weight}`)
                    console.log(`    -> tx: ${tx.transactionHash}`)
                } catch (e) {
                    if (e.error.message.includes("Stargate: cant createChainPath of existing dstChainId and _dstPoolId")) {
                        console.log(
                            `✅ createChainPath: poolId:${srcPoolId} dstChainId:${dstChainId} dstPoolId:${dstPoolId} weight:${weight} | *already exists*`
                        )
                    } else {
                        console.log(e)
                        console.log("^ ERROR")
                    }
                }
            }
        }
    })
