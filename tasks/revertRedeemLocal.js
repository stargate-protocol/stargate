module.exports = async function (taskArgs, hre) {
    let owner = (await ethers.getSigners())[0]
    const router = await ethers.getContract("Router")
    let eventFilter = router.filters.Revert()
    let events = await router.queryFilter(eventFilter)
    let ctr = 0
    for (let e of events) {
        console.log(e.args)
        let chainId = e.args.chainId
        let srcAddress = e.args.srcAddress
        let nonce = e.args.nonce

        // try to get teh retryLookup - if its all 0s its already been cleared!
        let revertLookup = await router.revertLookup(chainId, srcAddress, nonce)
        console.log(`revertLookup[${chainId}][${srcAddress}][nonce:${nonce}]: ${revertLookup}`)
        if (revertLookup === "0x") {
            console.log(`the revertLookup was ${revertLookup}, indicating its already been withdrawn!`)
            continue
        }

        let tx = await (
            await router.revertRedeemLocal(
                chainId,
                srcAddress,
                nonce,
                owner.address,
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                { value: ethers.utils.parseEther("3") } // send native value for the underlying message cost
            )
        ).wait()

        console.log(chainId, srcAddress, nonce, `tx: ${tx.transactionHash}`)
        ctr++
    }

    console.log(`found ${ctr} things to to the B portion of the A-B-A withdraw (0 means there were none)`)
}
