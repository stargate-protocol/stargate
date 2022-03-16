module.exports = async function (taskArgs, hre) {
    console.log(taskArgs)
    let router = await ethers.getContract("Router")
    let tx = await (
        await router.setDeltaParam(
            taskArgs.poolId,
            taskArgs.batched,
            taskArgs.swapDeltaBp,
            taskArgs.lpDeltaBp,
            taskArgs.defaultSwapMode,
            taskArgs.defaultLpMode
        )
    ).wait()
    console.log(`setDeltaParam() | tx: ${tx.transactionHash}`)
}
