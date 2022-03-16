task("redeemLocal", "remove liquidity from Stargate ", require("./redeemLocal"))
    .addParam("targetNetwork", "the target network, ie: ethereum")
    .addParam("poolId", "the source poolId")
    .addParam("dstPoolId", "the destination poolId")
    // refund address is caller for simplicity
    .addOptionalParam("qty", "_amountLP to remove", 0, types.int)
    .addOptionalParam("all", "boolean indicating all paths or not")

task("revertRedeemLocal", "in ABA withdraw initiated with redeemLocal, this is the B, ie: revertRedeemLocal", require("./revertRedeemLocal"))

task("setDeltaParam", "local Router.setDeltaParam() for a poolId ", require("./setDeltaParam"))
    .addParam("poolId", "the source poolId")
    .addParam("batched", "batched. boolean", false, types.boolean)
    .addOptionalParam("swapDeltaBp", "swapDeltaBP", 0, types.int)
    .addOptionalParam("lpDeltaBp", "swapDeltaBP", 0, types.int)
    .addParam("defaultSwapMode", "boolean", false, types.boolean)
    .addParam("defaultLpMode", "boolean", false, types.boolean)

task("sendSTG", "send some STG tokens to the address", require("./sendSTG"))
    .addParam("addr", "the address to transfer tokens to")
    .addParam("tokens", "the tokens in the form: 54.323  (the script takes care of decimals)")
