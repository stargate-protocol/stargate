const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")

describe("StargateFeeLibraryV02:", function () {
    let feeLib
    let idealBalance
    let beforeBalance

    beforeEach(async function () {
        await deployments.fixture(["test"])
        feeLib = await ethers.getContract("StargateFeeLibraryV02")
        idealBalance = ethers.utils.parseEther("100")
        beforeBalance = ethers.utils.parseEther("100")
    })

    it("getEquilibriumFee()", async function () {
        const expectedEqFee = [
            "0.000000000000000",
            "0.000030000000000",
            "0.000060000000000",
            "0.000090000000000",
            "0.000120000000000",
            "0.000150000000000",
            "0.000180000000000",
            "0.000210000000000",
            "0.000240000000000",
            "0.000270000000000",
            "0.000300000000000",
            "0.000330000000000",
            "0.000360000000000",
            "0.000390000000000",
            "0.000420000000000",
            "0.000450000000000",
            "0.000480000000000",
            "0.000510000000000",
            "0.000540000000000",
            "0.000570000000000",
            "0.000600000000000",
            "0.000630000000000",
            "0.000660000000000",
            "0.000690000000000",
            "0.000720000000000",
            "0.000750000000000",
            "0.000780000000000",
            "0.000810000000000",
            "0.000840000000000",
            "0.000870000000000",
            "0.000900000000000",
            "0.000930000000000",
            "0.000960000000000",
            "0.000990000000000",
            "0.001020000000000",
            "0.001050000000000",
            "0.001080000000000",
            "0.001110000000000",
            "0.001140000000000",
            "0.001170000000000",
            "0.001200000000000",
            "0.000036363636364",
            "0.000145454545455",
            "0.000327272727273",
            "0.000581818181818",
            "0.000909090909091",
            "0.001309090909091",
            "0.001781818181818",
            "0.002327272727273",
            "0.002945454545455",
            "0.003636363636364",
            "0.004400000000000",
            "0.005236363636364",
            "0.006145454545455",
            "0.007127272727273",
            "0.008181818181818",
            "0.009309090909091",
            "0.010509090909091",
            "0.011781818181818",
            "0.013127272727273",
            "0.014545454545455",
            "0.016036363636364",
            "0.017600000000000",
            "0.019236363636364",
            "0.020945454545455",
            "0.022727272727273",
            "0.024581818181818",
            "0.026509090909091",
            "0.028509090909091",
            "0.030581818181818",
            "0.032727272727273",
            "0.034945454545455",
            "0.037236363636364",
            "0.039600000000000",
            "0.042036363636364",
            "0.044545454545455",
            "0.047127272727273",
            "0.049781818181818",
            "0.052509090909091",
            "0.055309090909091",
            "0.058181818181818",
            "0.061127272727273",
            "0.064145454545455",
            "0.067236363636364",
            "0.070400000000000",
            "0.073636363636364",
            "0.076945454545455",
            "0.080327272727273",
            "0.083781818181818",
            "0.087309090909091",
            "0.090909090909091",
            "0.094581818181818",
            "0.098327272727273",
            "0.102145454545455",
            "0.106036363636364",
            "0.110000000000000",
            "0.213600000000000",
            "0.516400000000000",
            "1.018400000000000",
            "1.719600000000000",
            "2.620000000000000",
        ]
        for (let i = 0; i < 100; i++) {
            const swapAmount = ethers.utils.parseEther(i.toString())
            const expectedFee = ethers.utils.parseEther(expectedEqFee[i]).div(10000).mul(10000)
            const protocolSubsidy = i > 40 ? ethers.constants.Zero : expectedFee
            const eqFee = await feeLib.getEquilibriumFee(idealBalance, beforeBalance, swapAmount)
            expect(eqFee[0].div(10000).mul(10000)).to.equal(expectedFee)
            expect(eqFee[1]).to.equal(protocolSubsidy)
        }
    })
})
