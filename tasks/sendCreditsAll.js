const { CHAIN_ID } = require("@layerzerolabs/lz-sdk")
const { POOLS } = require("@layerzerolabs/sg-sdk")

task("sendCreditsAll", "sendCredits to each outgoing configured chainPath").setAction(async (taskArgs) => {
    const signers = await ethers.getSigners()
    const owner = signers[0]

    const router = await ethers.getContract("Router")

    let srcChainId = CHAIN_ID[hre.network.name]
    let srcPoolData = POOLS[hre.network.name]
    // console.log(srcPoolData)
    for (let srcPoolId in srcPoolData) {
        let { info, chainPaths } = srcPoolData[srcPoolId]
        console.log(`Source chain ${srcChainId} PoolId: ${srcPoolId}`)
        console.table(chainPaths)
        for (let chainPath of chainPaths) {
            let { weight, dstChainId, dstPoolId } = chainPath
            let tx = await (
                await router.sendCredits(dstChainId, srcPoolId, dstPoolId, owner.address, { value: ethers.utils.parseEther("2") })
            ).wait()
            console.log(
                `💸 [${hre.network.name}].sendCredits(dstChainId: ${dstChainId}, srcPoolId:${srcPoolId}, dstPoolId: ${dstPoolId}) | tx: ${tx.transactionHash}`
            )
        }
    }
})
