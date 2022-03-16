const { ChainId } = require("@layerzerolabs/core-sdk")
const { PoolId } = require("@layerzerolabs/stargate-sdk")

task("getFeeVersion", "Get fee library version").setAction(async (taskArgs) => {
    let accounts = await ethers.getSigners()
    let owner = accounts[0] // me
    console.log(`owner: ${owner.address}`)

    const fee = await hre.ethers.getContract("StargateFeeLibraryV02")

    console.log(`contract address: ${fee.address}`)

    console.log(`fee version: ${await fee.getVersion()}`)
})
