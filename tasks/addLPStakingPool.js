const FARMS = require("../constants/farms.json")

task("addLPStakingPool", "add an LPStaking pool with add()")
    .addParam("poolId", "the Stargate Router's poolId of the S*LP token")

    .setAction(async (taskArgs) => {
        // console.log(FARMS)
        const farm = FARMS[hre.network.name]
        if (!farm) {
            throw Error(`farm for ${hre.network.name} is undefined`)
        }
        console.log(farm)

        // factory
        const factory = await ethers.getContract("Factory")
        // pool info
        let poolAddr = await factory.getPool(taskArgs.poolId)
        let Pool = await ethers.getContractFactory("Pool")
        let pool = await Pool.attach(poolAddr)
        let poolId = await pool.poolId()
        let nativeAssetToken = await pool.token()
        console.log(`pool.poolId: ${poolId}`)
        console.log(`pool.token (ie: asset token): ${nativeAssetToken}`)
        console.log(`pool.address (ie: S*XXX token): ${poolAddr}`)

        let weight = farm[taskArgs.poolId].weight
        console.log(`setting pid weight: ${weight}`)

        let tx
        let lpStaking = await ethers.getContract("LPStaking")
        try {
            tx = await (
                await lpStaking.add(
                    weight, // alloc points
                    poolAddr // stargate S* lp token address
                )
            ).wait(1)
        } catch (e) {
            //console.log(e)
            if (e.error.message.includes("StarGate: _lpToken already exists")) {
                console.log(`added Farm for poolId:${poolId} | *already exists`)
                return
            }
        }
        console.log(`added Farm for poolId:${poolId} | tx: ${tx.transactionHash}`)
    })
