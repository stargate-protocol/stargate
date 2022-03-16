const { expect } = require("chai")
const { ethers } = require("hardhat")
const { DEBUG } = require("./util/constants")

const abiDecoder = require("abi-decoder")
const { GlobalBook, mintAndApproveFunds, toPowerOfDecimals } = require("./util/globalBook")
const routerDepl = require("./abi/router.json")
abiDecoder.addABI([...routerDepl.abi])

// constructs:
// - globalBook (GB): includes all pools deployed.
// - event: any event that alters the state of the globalBook, atomically. {swap, lp++/--, stargateFee}
// - delta_conf: configuration of how the delta algo runs on pool
//
// required:
// correct state transition:  assert(GB_t+1 = GB_t.apply(event, delta_conf))
//      - constraints derived from the delta_conf (e.g. lkb, balance, credits)
// audit GB: for any t in T, assert(GB_t.audit()). specifically, it requires:
//     - GB is solvent for all LP + stargateFee + equilibriumFee withdrawals at anytime
//     - All chainpaths are solvent for IFG(instant finality guarantee)

describe("SwapMath", function () {
    printVerbose = function (msg) {
        if (DEBUG) console.log(msg)
    }

    before(async function () {
        this.accounts = await ethers.getSigners()
        this.owner = this.accounts[0]
        this.alice = this.accounts[1]
        this.bob = this.accounts[2]
        this.carol = this.accounts[3]

        this.poolAId = 0
        this.poolBId = 1
        this.weight = 1
        this.chainAId = 1
        this.chainBId = 2
        this.chainCId = 3
    })

    //Before Each testcase
    // 1. Reset contract environment
    // 2. Provision initial user accounts
    // 3. Provision initial liquidity pools and credits
    beforeEach(async function () {
        //1. Reset contract environment
        this.globalBook = new GlobalBook()

        //stargateA uses poolAId with token of 6 decimals
        this.stargateA = await this.globalBook.newStargateEndpoint(this.chainAId, "A", [
            {
                poolId: this.poolAId,
                tokenInfo: {
                    name: "MockToken1",
                    symbol: "MT1",
                    decimals: 6,
                },
            },
        ])

        //stargateB uses poolBId with token of 9 decimals
        this.stargateB = await this.globalBook.newStargateEndpoint(this.chainBId, "B", [
            {
                poolId: this.poolBId,
                tokenInfo: {
                    name: "MockToken2",
                    symbol: "MT2",
                    decimals: 9,
                },
            },
        ])

        //stargateC uses poolAId with token of 18 decimals
        this.stargateC = await this.globalBook.newStargateEndpoint(this.chainCId, "C", [
            {
                poolId: this.poolAId,
                tokenInfo: {
                    name: "MockToken3",
                    symbol: "MT3",
                    decimals: 18,
                },
            },
        ])

        // 2. Provision initial user accounts
        const mintAmount = 1000000
        for (const token of this.globalBook.tokenList) {
            for (let i = 1; i < 4; i++) {
                await mintAndApproveFunds(token, this.accounts[i], await toPowerOfDecimals(mintAmount, token), [
                    this.stargateA.router.address,
                    this.stargateB.router.address,
                    this.stargateC.router.address,
                ])
            }
        }

        // //== 3. Provision initial liquiditiy
        // //provision chainpath A->B
        printVerbose("alice lp++ 5000 to A")
        await this.globalBook.provisionLiquidity(this.alice, this.chainAId, this.poolAId, 5000)
        printVerbose("alice lp++ 5000 to B")
        await this.globalBook.provisionLiquidity(this.alice, this.chainBId, this.poolBId, 5000)

        printVerbose("alice lp++ 5000 to C")
        await this.globalBook.provisionLiquidity(this.alice, this.chainCId, this.poolAId, 5000)
    })

    it("no fee swap test, vanilla delta", async function () {
        // carol do swap A->B
        printVerbose("carol swap 10 from A to B")
        await this.stargateA.router.connect(this.carol).swap(
            this.stargateB.chainId,
            this.poolAId,
            this.poolBId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(10, this.stargateA.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(10, this.stargateA.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        await this.globalBook.audit()

        //carol do swap B->A
        printVerbose("carol swap 10 from B to A")
        await this.stargateB.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolBId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(10, this.stargateB.chainId, this.poolBId), //amount
            await this.globalBook.amountToPoolLD(10, this.stargateB.chainId, this.poolBId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        await this.globalBook.audit()

        //carol do swap C->A
        printVerbose("carol swap 30 from C to A")
        await this.stargateC.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolAId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(30, this.stargateC.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(30, this.stargateC.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        await this.globalBook.audit()
    })

    it("swap test, with sg and lp fee, vanilla delta", async function () {
        //set fee parameters.. initiate by feeLibrary address
        await this.stargateA.feeLibrary.connect(this.owner).setFees(100, 100, 0, 0)
        await this.stargateB.feeLibrary.connect(this.owner).setFees(200, 200, 0, 0)
        await this.stargateC.feeLibrary.connect(this.owner).setFees(300, 300, 0, 0)

        //carol do swap A->B. this would FAIL cuz the spread limit too tight
        await expect(
            this.stargateA.router.connect(this.carol).swap(
                this.stargateB.chainId,
                this.poolAId,
                this.poolBId,
                this.carol.address, //refund address
                await this.globalBook.amountToPoolLD(1000, this.stargateA.chainId, this.poolAId), //amount
                await this.globalBook.amountToPoolLD(995, this.stargateA.chainId, this.poolAId), //minimum amount
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                this.carol.address, //to address
                "0x" //payload
            )
        ).to.be.revertedWith("Stargate: slippage too high")
        printVerbose("carol swaps 1000 from A to B not OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap A->B. this would SUCCEED
        await this.stargateA.router.connect(this.carol).swap(
            this.stargateB.chainId,
            this.poolAId,
            this.poolBId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateA.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(980, this.stargateA.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        printVerbose("carol swaps 1000 A to B OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap B->A
        await this.stargateB.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolBId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateB.chainId, this.poolBId), //amount
            await this.globalBook.amountToPoolLD(960, this.stargateB.chainId, this.poolBId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        printVerbose("carol swaps 1000 from B to A OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap C->A
        printVerbose("carol swap 30 from C to A")
        await this.stargateC.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolAId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateC.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(940, this.stargateC.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        await this.globalBook.audit()
        printVerbose("    book audit OK")
    })

    it("swap test, with all fee, vanilla delta", async function () {
        //set fee parameters.. initiate by feeLibrary address
        await this.stargateA.feeLibrary.connect(this.owner).setFees(100, 100, 100, 0)
        await this.stargateB.feeLibrary.connect(this.owner).setFees(200, 200, 100, 0)
        await this.stargateC.feeLibrary.connect(this.owner).setFees(300, 300, 250, 0)

        await expect(
            this.stargateA.router.connect(this.carol).swap(
                this.stargateB.chainId,
                this.poolAId,
                this.poolBId,
                this.carol.address, //refund address
                await this.globalBook.amountToPoolLD(1000, this.stargateA.chainId, this.poolAId), //amount
                await this.globalBook.amountToPoolLD(971, this.stargateA.chainId, this.poolAId), //minimum amount
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                this.carol.address, //to address
                "0x" //payload
            )
        ).to.be.revertedWith("Stargate: slippage too high")
        printVerbose("carol swaps 1000 from A to B not OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap A->B. this would SUCCEED
        await this.stargateA.router.connect(this.carol).swap(
            this.stargateB.chainId,
            this.poolAId,
            this.poolBId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateA.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(970, this.stargateA.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        printVerbose("carol swaps 1000 A to B OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap B->A
        await this.stargateB.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolBId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateB.chainId, this.poolBId), //amount
            await this.globalBook.amountToPoolLD(800, this.stargateB.chainId, this.poolBId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        printVerbose("carol swaps 1000 from B to A OK")
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        //carol do swap C->A
        printVerbose("carol swap 30 from C to A")
        await this.stargateC.router.connect(this.carol).swap(
            this.stargateA.chainId,
            this.poolAId,
            this.poolAId,
            this.carol.address, //refund address
            await this.globalBook.amountToPoolLD(1000, this.stargateC.chainId, this.poolAId), //amount
            await this.globalBook.amountToPoolLD(600, this.stargateC.chainId, this.poolAId), //minimum amount
            { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
            this.carol.address, //to address
            "0x" //payload
        )
        await this.globalBook.audit()
        printVerbose("    book audit OK")
    })

    it("add in a new stargateD, alice addLiquidity, no fee, then swap()", async function () {
        // carol swaps to the 2 other setup chains B + C (not yet D)
        let qty = 120
        printVerbose("carol swap 120 A to B")
        await this.stargateA.router
            .connect(this.carol)
            .swap(
                this.chainBId,
                this.poolAId,
                this.poolBId,
                this.carol.address,
                await this.globalBook.amountToPoolLD(qty, this.stargateA.chainId, this.poolAId),
                await this.globalBook.amountToPoolLD(qty, this.stargateA.chainId, this.poolAId),
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                this.carol.address,
                "0x"
            )
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        printVerbose("carol swap 120 A to C")
        await this.stargateA.router
            .connect(this.carol)
            .swap(
                this.chainCId,
                this.poolAId,
                this.poolAId,
                this.carol.address,
                await this.globalBook.amountToPoolLD(qty, this.stargateA.chainId, this.poolAId),
                await this.globalBook.amountToPoolLD(qty, this.stargateA.chainId, this.poolAId),
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                this.carol.address,
                "0x"
            )
        await this.globalBook.audit()
        printVerbose("    book audit OK")

        // create StargateD, also creates the chainPaths for the token to the other Stargates
        const chainDId = 4
        const poolDId = 2
        const stargateD = await this.globalBook.newStargateEndpoint(chainDId, "D", [
            {
                poolId: poolDId,
                tokenInfo: {
                    name: "MockToken",
                    symbol: "MT4",
                    decimals: 18,
                },
            },
        ])

        // approve add liquidity to StargateD (for alice)
        const tokenD = stargateD.poolInfos[poolDId].token
        const routerAddresses = [
            this.stargateA.router.address,
            this.stargateB.router.address,
            this.stargateC.router.address,
            stargateD.router.address,
        ]
        printVerbose("mint and approve chainD token to Alice")
        await mintAndApproveFunds(tokenD, this.alice, await toPowerOfDecimals(10000, tokenD), routerAddresses)
        printVerbose("mint and approve chainD token to Alice")
        await mintAndApproveFunds(tokenD, this.carol, await toPowerOfDecimals(10000, tokenD), routerAddresses)

        await this.globalBook.provisionLiquidity(this.alice, chainDId, poolDId, 5000)
        printVerbose("provide liquidity to chain D OK")

        await this.globalBook.provisionLiquidity(this.alice, this.chainAId, this.poolAId, 5000)
        printVerbose("provide liquidity to chain A and send credit to D OK")

        // swap from StargateD to A
        printVerbose("carol swap 120 D to A ")
        await stargateD.router
            .connect(this.carol)
            .swap(
                this.chainAId,
                poolDId,
                this.poolAId,
                this.carol.address,
                await this.globalBook.amountToPoolLD(qty, stargateD.chainId, poolDId),
                await this.globalBook.amountToPoolLD(qty, stargateD.chainId, poolDId),
                { dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: "0x" },
                this.carol.address,
                "0x"
            )
        await this.globalBook.audit()
    })
})
