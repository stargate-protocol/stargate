const { CHAIN_ID } = require("@layerzerolabs/core-sdk")

task("sendCredits", "sendCredits function from stargate to destination chainId")
    .addParam("poolId", "the poolId")
    .addParam("dstPoolId", "the destination poolId")
    .addParam("targetNetworks", "csv of the target network names")
    .setAction(async (taskArgs, hre) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0]

        const router = await ethers.getContract("Router")

        let targetNetworks = taskArgs.targetNetworks.split(",")
        for (let targetNetwork of targetNetworks) {
            let chainId = CHAIN_ID[targetNetwork]
            try {
                let tx = await router.sendCredits(
                    chainId,
                    taskArgs.poolId,
                    taskArgs.dstPoolId,
                    owner.address,
                    { value: ethers.utils.parseEther("0.56") } // guess, but it should cover the relayer fee
                )
                await tx.wait(1)
                console.log(
                    `💸 ${hre.network.name} > sendCredits( ${chainId}, poolId:${taskArgs.poolId} dstPoolId:${taskArgs.dstPoolId} ) -> tx.hash: ${tx.hash}`
                )
            } catch (e) {
                if (!e.error) {
                    console.log(e)
                } else {
                    console.log(
                        `*  ${hre.network.name} > sendCredits( ${chainId}, poolId:${taskArgs.poolId} dstPoolId:${taskArgs.dstPoolId} ) ... Error: ${e.error.message}]`
                    )
                }
            }
        }
    })
