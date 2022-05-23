const { getEndpointIdByName } = require("@layerzerolabs/lz-sdk")

module.exports = async function (taskArgs, hre) {
    let accounts = await ethers.getSigners()
    let owner = accounts[0] // me
    console.log(`owner: ${owner.address}`)

    // get the destination chainId
    const srcChainId = getEndpointIdByName(hre.network.name)
    const dstChainId = getEndpointIdByName(taskArgs.targetNetwork)

    // factory / router
    const factory = await ethers.getContract("Factory")
    const router = await ethers.getContract("Router")

    // get the token from the router
    let Pool = await ethers.getContractFactory("Pool")
    let poolData = await factory.getPool(taskArgs.poolId) // return stg lp address
    let pool = await Pool.attach(poolData)
    let tokenAddr = await pool.token()
    let withdrawLpQty = taskArgs.qty
    if (withdrawLpQty == 0) {
        withdrawLpQty = await pool.balanceOf(owner.address)
    }

    console.log(`${hre.network.name}[${srcChainId}] redeemLocal poolId:${taskArgs.poolId} tokenAddr: ${tokenAddr}`)
    console.log(` -> dstChainId: ${dstChainId} , removing ${taskArgs.qty} LP`)

    //return
    let tx = await (
        await router.redeemLocal(
            dstChainId,
            taskArgs.poolId, // source pool id
            taskArgs.dstPoolId,
            owner.address, // refund address
            withdrawLpQty, // amount LP to remove corresponds to the liquidity to remove
            owner.address, // to
            { dstGasForCall: 300000, dstNativeAmount: 0, dstNativeAddr: "0x" },
            { value: ethers.utils.parseEther("2") } // send native value for the underlying message cost
        )
    ).wait(1)
    console.log(`-💦 redeemLocal qty: ${withdrawLpQty} | tx: ${tx.transactionHash}`)
}
