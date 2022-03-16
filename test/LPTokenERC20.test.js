const { MockProvider } = require("@ethereum-waffle/provider")
const { expect } = require("chai")
const { ethers } = require("hardhat")
const { getApprovalDigest, getAddr } = require("./util/helpers")
const { ecsign } = require("ethereumjs-util")
const { deployNew } = require("./util/helpers")
const { ZERO_ADDRESS } = require("./util/constants")
const { BigNumber } = require("ethers")

describe("LPTokenERC20:", function () {
    let lzEndpoint, initialSupply, owner, alice, bob, stargateTokenOwner, stargateTokenSpender, lpTokenErc20, chainId

    before(async function () {
        ;({ owner, bob, alice } = await getAddr(ethers))
        chainId = 1
        initialSupply = ethers.utils.parseEther("1000000000")
    })

    beforeEach(async function () {
        lzEndpoint = await deployNew("LZEndpointMock", [chainId])
        lpTokenErc20 = await deployNew("LPTokenERC20", ["X", "X*LP"])
        stargateTokenOwner = await deployNew("StargateToken", ["Stargate", "STG", lzEndpoint.address, chainId, initialSupply])
        stargateTokenSpender = await deployNew("StargateToken", ["Stargate", "STGLFG", lzEndpoint.address, chainId, initialSupply])
    })

    it("approve() - emit event / set", async function () {
        const amount = ethers.utils.parseEther("100")
        await expect(lpTokenErc20.approve(stargateTokenSpender.address, amount)).to.emit(lpTokenErc20, "Approval")
    })

    it("increaseApproval()", async function () {
        const amount = 3664
        expect(await lpTokenErc20.allowance(owner.address, alice.address)).to.equal(0)
        await lpTokenErc20.increaseAllowance(alice.address, amount)
        expect(await lpTokenErc20.allowance(owner.address, alice.address)).to.equal(3664)
    })

    it("decreaseApproval()", async function () {
        const amount = 3664
        expect(await lpTokenErc20.allowance(owner.address, alice.address)).to.equal(0)
        await lpTokenErc20.increaseAllowance(alice.address, amount)
        expect(await lpTokenErc20.allowance(owner.address, alice.address)).to.equal(3664)
        await lpTokenErc20.decreaseAllowance(alice.address, amount / 2)
        expect(await lpTokenErc20.allowance(owner.address, alice.address)).to.equal(amount / 2)
    })

    it("permit() - reverts if deadline is before block timestamp", async function () {
        await expect(
            lpTokenErc20.permit(
                ZERO_ADDRESS,
                ZERO_ADDRESS,
                0,
                1,
                1,
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            )
        ).to.revertedWith("Bridge: EXPIRED")
    })

    it("permit()", async function () {
        const TEST_AMOUNT = ethers.utils.parseEther("10")
        const provider = new MockProvider({
            ganacheOptions: {
                hardfork: "istanbul",
                mnemonic: "horn horn horn horn horn horn horn horn horn horn horn horn",
                gasLimit: 9999999,
            },
        })
        const [wallet, other] = provider.getWallets()
        const nonce = await lpTokenErc20.nonces(wallet.address)
        const deadline = ethers.constants.MaxUint256
        const digest = await getApprovalDigest(
            lpTokenErc20,
            { owner: wallet.address, spender: other.address, value: TEST_AMOUNT },
            nonce,
            deadline
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(wallet.privateKey.slice(2), "hex"))

        await expect(
            lpTokenErc20.permit(wallet.address, other.address, TEST_AMOUNT, deadline, v, ethers.utils.hexlify(r), ethers.utils.hexlify(s))
        )
            .to.emit(lpTokenErc20, "Approval")
            .withArgs(wallet.address, other.address, TEST_AMOUNT)

        expect(await lpTokenErc20.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
        expect(await lpTokenErc20.nonces(wallet.address)).to.eq(BigNumber.from(1))
    })

    it("permit() - reverts with invalid signature", async function () {
        const TEST_AMOUNT = ethers.utils.parseEther("10")
        const provider = new MockProvider({
            ganacheOptions: {
                hardfork: "istanbul",
                mnemonic: "horn horn horn horn horn horn horn horn horn horn horn horn",
                gasLimit: 9999999,
            },
        })
        const [wallet, other] = provider.getWallets()
        const nonce = await lpTokenErc20.nonces(wallet.address)
        const deadline = ethers.constants.MaxUint256
        const digest = await getApprovalDigest(
            lpTokenErc20,
            { owner: wallet.address, spender: other.address, value: TEST_AMOUNT },
            nonce,
            deadline
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(wallet.privateKey.slice(2), "hex"))

        // pass the wrong "owner" into permit()
        await expect(
            lpTokenErc20.permit(bob.address, other.address, TEST_AMOUNT, deadline, v, ethers.utils.hexlify(r), ethers.utils.hexlify(s))
        ).to.revertedWith("Bridge: INVALID_SIGNATURE")
    })
})
