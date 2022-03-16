module.exports = async function (taskArgs, hre) {
    console.log(taskArgs)
    let accounts = await ethers.getSigners()
    let owner = accounts[0] // me
    console.log(`owner: ${owner.address}`)

    let stargateToken = await ethers.getContract("StargateToken")
    let tx = await (await stargateToken.transfer(taskArgs.addr, ethers.utils.parseEther(taskArgs.tokens))).wait(1)
    console.log(`send STG to [${taskArgs.addr}] | tx: ${tx.transactionHash}`)
}
