const { CHAIN_ID } = require("@layerzerolabs/lz-sdk")

task("sendStargateTokens", "send StargateTokens cross chain")
    .addParam("targetNetwork", "the destination StargateToken chain id")
    .addParam("addr", "the destination address to send the tokens to on destination")
    .addParam("qty", "the quantity of stargate tokens")

    .setAction(async (taskArgs) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me

        const StargateToken = await ethers.getContractFactory("StargateToken")
        const stargateTokenAddr = (await hre.deployments.get("StargateToken")).address
        const stargateToken = await StargateToken.attach(stargateTokenAddr)

        await (await stargateToken.connect(owner).approve(stargateToken.address, taskArgs.qty)).wait(1)

        let dstChainId = CHAIN_ID[taskArgs.targetNetwork]
        console.log(`source(${CHAIN_ID[hre.network.name]}) sendTokens( ${taskArgs.qty} ) --> dstChainId(${dstChainId})`)
        let tx = await (
            await stargateToken.sendTokens(dstChainId, taskArgs.addr, taskArgs.qty, { value: ethers.utils.parseEther("0.1") })
        ).wait(1)
        console.log(`    tx: ${tx.transactionHash}`)
    })
