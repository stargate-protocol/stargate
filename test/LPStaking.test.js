const { expect } = require("chai")
const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")
const { ZERO_ADDRESS } = require("./util/constants")
const { getAddr, deployNew, getCurrentBlock, mineNBlocks, callAsContract } = require("./util/helpers")

describe("LPStaking:", function () {
    let owner, alice, badUser1, fakeContract, mockToken, lpStaking
    let chainId, startBlock, bonusEndBlock, emissionsPerBlock, poolId, allocPoint, depositAmt, stargateToken

    before(async function () {
        ;({ owner, alice, badUser1, fakeContract } = await getAddr(ethers))
        poolId = 0
        chainId = 1
        allocPoint = 3
        bonusEndBlock = 1000000000
        emissionsPerBlock = "1000000000000000000"
        depositAmt = BigNumber.from("1000000000000000000")
    })

    beforeEach(async function () {
        startBlock = (await getCurrentBlock()) + 3
        stargateToken = await deployNew("MockToken", ["Token", "TKN", 18])
        lpStaking = await deployNew("LPStaking", [stargateToken.address, emissionsPerBlock, startBlock, bonusEndBlock])
        mockToken = await deployNew("MockToken", ["Token", "TKN", 18])

        await mockToken.transfer(lpStaking.address, "10000000000000000000000")
    })

    it("constructor() - reverts for bad params", async function () {
        await expect(deployNew("LPStaking", [mockToken.address, emissionsPerBlock, 0, 1])).to.be.revertedWith(
            "LPStaking: _startBlock must be >= current block"
        )

        await expect(deployNew("LPStaking", [mockToken.address, emissionsPerBlock, startBlock + 10, 0])).to.be.revertedWith(
            "LPStaking: _bonusEndBlock must be > than _startBlock"
        )

        await expect(deployNew("LPStaking", [ZERO_ADDRESS, emissionsPerBlock, startBlock + 10, bonusEndBlock])).to.be.revertedWith(
            "Stargate: _stargate cannot be 0x0"
        )
    })

    it("deposit()", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.approve(lpStaking.address, "100000000000000000000000")

        // deposit() into the pool
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.massUpdatePools()
        expect(await lpStaking.pendingStargate(poolId, owner.address)).to.be.gt(0)
        await lpStaking.deposit(poolId, depositAmt)

        // withdraw() from the pool
        await expect(lpStaking.withdraw(poolId, depositAmt.mul(3))).to.emit(lpStaking, "Withdraw")
        await lpStaking.emergencyWithdraw(poolId)
    })

    it("deposit()", async function () {
        lpStaking = await deployNew("LPStaking", [mockToken.address, emissionsPerBlock, (await getCurrentBlock()) + 2, bonusEndBlock])
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.transfer(lpStaking.address, "10000000000000000000000")
        await mockToken.approve(lpStaking.address, "10000000000000000000000")

        // deposit() into the pool
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.updatePool(poolId)

        // check current pending stargate
        const pendingStargate = await lpStaking.pendingStargate(poolId, owner.address)
        await mineNBlocks(20)
        // updates the last reward block number
        await lpStaking.updatePool(poolId)
        await mineNBlocks(2)
        const _pendingStargate = await lpStaking.pendingStargate(poolId, owner.address)
        // ensure that the new amount of pending stargate has increased
        expect(_pendingStargate.gt(pendingStargate)).to.equal(true)
    })

    it("deposit() and withdraw() - changes the lp amount stored in lpBalance", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.approve(lpStaking.address, "100000000000000000000000")

        // deposit() into the pool
        await lpStaking.deposit(poolId, depositAmt)
        let lpBalance = await lpStaking.lpBalances(poolId)
        expect(depositAmt).to.be.equal(lpBalance)

        // withtdraw() from the pool
        await lpStaking.withdraw(poolId, depositAmt)
        lpBalance = await lpStaking.lpBalances(poolId)
        expect(lpBalance).to.equal(0)
    })

    it("emergencyWithdraw() - changes the lp amount stored in lpBalance", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.approve(lpStaking.address, "100000000000000000000000")
        await mockToken.transfer(alice.address, "7000000000000000000")
        await mockToken.connect(alice).approve(lpStaking.address, "100000000000000000000000")

        // emergencyWithtdraw() from the pool
        depositAmt2 = BigNumber.from("7000000000000000000")

        // owner deposits then alice deposits
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.connect(alice).deposit(poolId, depositAmt2)
        lpBalance = await lpStaking.lpBalances(poolId)
        expect(depositAmt.add(depositAmt2)).to.equal(lpBalance)
        await lpStaking.connect(alice).emergencyWithdraw(poolId)
        lpBalance = await lpStaking.lpBalances(poolId)
        // should equal only owner's deposit
        expect(lpBalance).to.equal(depositAmt)
    })

    it("add() - reverts with duplicate token", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await expect(lpStaking.add(allocPoint, mockToken.address)).to.be.reverted
    })

    it("add() - reverts with 0x0 token", async function () {
        await expect(lpStaking.add(allocPoint, ZERO_ADDRESS)).to.revertedWith("StarGate: lpToken cant be 0x0")
    })

    it("withdraw() - withdraws if amount is too large", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.approve(lpStaking.address, "100000000000000000000000")

        // deposit() into the pool
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.massUpdatePools()
        expect(await lpStaking.pendingStargate(poolId, owner.address)).to.be.gt(0)
        await lpStaking.deposit(poolId, depositAmt)

        // withdraw() from pool and revert
        await expect(lpStaking.withdraw(poolId, "4000000000000000000")).to.be.revertedWith("withdraw: _amount is too large")
    })

    it("withdraw() - withdraw exceeds the amount owned by the lp contract", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await mockToken.approve(lpStaking.address, "100000000000000000000000")
        await stargateToken.mint(lpStaking.address, "100000000")

        // deposit() into the pool
        await lpStaking.deposit(poolId, depositAmt)
        await lpStaking.deposit(poolId, depositAmt)

        const amountToSend = 42
        // give lp staking some stargate to send back to owner
        await stargateToken.mint(lpStaking.address, amountToSend)
        const userBal = await stargateToken.balanceOf(owner.address)
        // add 1 more to make sure its capped at the balance of lpStaking
        await lpStaking.withdraw(poolId, amountToSend + 1)
        expect(await stargateToken.balanceOf(owner.address)).to.equal(userBal.add(amountToSend))
    })

    it("renounceOwnership() - onlyOwner modifiers dont block when owner doesnt exist", async function () {
        await lpStaking.add(allocPoint, mockToken.address)
        await lpStaking.renounceOwnership()
        await expect(lpStaking.set(poolId, allocPoint)).to.not.be.reverted
    })

    it("getMultiplier() - _to field equal to bonus end block", async function () {
        const result = await lpStaking.getMultiplier(1, 1)
        await expect(result._hex).to.equal("0x00")
    })

    it("getMultiplier() - _from field less than the bonus end block", async function () {
        const result = await lpStaking.getMultiplier(0, 2)
        await expect(result._hex).to.equal("0x02")
    })

    it("getMultiplier() - _from field greater than the bonus end block", async function () {
        const from = BigNumber.from(123).add(await lpStaking.bonusEndBlock())
        const to = BigNumber.from(555).add(await lpStaking.bonusEndBlock())
        const result = await lpStaking.getMultiplier(from, to)
        await expect(result).to.equal(to.sub(from))
    })

    it("getMultiplier() - _to is > bonusEndblock and _from is < bonusEndblock", async function () {
        const bonusEndBlock = await lpStaking.bonusEndBlock()
        const from = bonusEndBlock.sub(BigNumber.from(123))
        const to = bonusEndBlock.add(BigNumber.from(123))
        const bonusMultiplier = await lpStaking.BONUS_MULTIPLIER()
        const result = await lpStaking.getMultiplier(from, to)
        await expect(result).to.equal(bonusEndBlock.sub(from).mul(bonusMultiplier).add(to.sub(bonusEndBlock)))
    })

    it("setStargatePerBlock() - reverts when non owner", async function () {
        await expect(lpStaking.connect(badUser1).setStargatePerBlock(0)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("setStargatePerBlock() - reverts when non owner", async function () {
        const stargatePerBlock = 123
        await lpStaking.setStargatePerBlock(stargatePerBlock)
        expect(await lpStaking.stargatePerBlock()).to.equal(stargatePerBlock)
    })

    it("poolLength() - reverts when non owner", async function () {
        expect(await lpStaking.poolLength()).to.equal(0)
        await lpStaking.add(allocPoint, mockToken.address)
        expect(await lpStaking.poolLength()).to.equal(1)
    })

    it("updatePool() - lpSupply is 0", async function () {
        // new token that hasnt transfered any tokens to the lp staking contract
        mockToken = await deployNew("MockToken", ["Token", "TKN", 18])
        await lpStaking.add(allocPoint, mockToken.address)
        const { lastRewardBlock } = await lpStaking.poolInfo(poolId)
        await lpStaking.updatePool(poolId)
        const { lastRewardBlock: _lastRewardBlock } = await lpStaking.poolInfo(poolId)

        // make sure the lp staking owns no tokens
        expect(await mockToken.balanceOf(lpStaking.address)).to.equal(0)

        // updated the lastRewardBlock to the current block number
        expect(_lastRewardBlock.gt(lastRewardBlock)).to.equal(true)
        expect(_lastRewardBlock.eq(await getCurrentBlock())).to.equal(true)
    })

    it("updatePool() - lp staking that starts in the future", async function () {
        lpStaking = await deployNew("LPStaking", [mockToken.address, emissionsPerBlock, (await getCurrentBlock()) + 50, bonusEndBlock])
        await lpStaking.add(allocPoint, mockToken.address)
        const { lastRewardBlock } = await lpStaking.poolInfo(poolId)
        await lpStaking.updatePool(poolId)
        const { lastRewardBlock: _lastRewardBlock } = await lpStaking.poolInfo(poolId)

        // lastRewardBlock isnt updated
        expect(_lastRewardBlock.eq(lastRewardBlock)).to.equal(true)
    })
})
