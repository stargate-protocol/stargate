const CONFIG = require("../constants/config.json")

task("setBridge", "connect the local stargate to a remote stargate by configuring the remote bridge")
    .addParam("local", "the local bridge address")
    .addParam("dstChainId", "the LayerZero chainId of the remote bridge")
    .addParam("bridge", "the remote bridge address")
    .setAction(async (taskArgs) => {
        let accounts = await ethers.getSigners()
        let owner = accounts[0] // me
        // console.log(`owner: ${owner.address}`);

        let Bridge = await ethers.getContractFactory("Bridge")
        let bridge = await Bridge.attach(taskArgs.local)

        let numFunctionTypes = 4
        for (let functionType = 1; functionType <= numFunctionTypes; ++functionType) {
            // function setGasAmount(uint16 _chainId, uint8 _functionType, uint _gasAmount)
            let gasAmount = CONFIG.gasAmounts[functionType]
            await (await bridge.setGasAmount(taskArgs.dstChainId, functionType, gasAmount)).wait()
            console.log(`bridge.setGasAmount(chainId:${taskArgs.dstChainId}, functionType:${functionType}, gasAmount:${gasAmount}`)
        }

        let tx = await bridge.setBridge(taskArgs.dstChainId, taskArgs.bridge)
        console.log(`tx.hash: ${tx.hash}`)
    })
