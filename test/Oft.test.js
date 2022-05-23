const { expect } = require("chai")
const { ethers } = require("hardhat")
const CONFIG = require("../constants/config.json")
const { getAddr, deployNew } = require("./util/helpers")
const { ZERO_ADDRESS } = require("./util/constants")

describe("Oft:", function () {
    this.timeout(300000)

    let owner, alice, bob, user3, user4, badUser1, fakeContract, router, mockToken, lzEndpoint, bridge
    let chainId, decimals, oft, lzEndpoints, users, mainEndpointId, numEndpoints, initSupplyMainEndpoint, name, symbol

    const getChainBalance = async (endpointId) => {
        return await oft[endpointId].balanceOf(oft[endpointId].address)
    }
    const getUserBalance = async (endpointId, userAddress) => {
        return await oft[endpointId].balanceOf(userAddress)
    }
    const auditGlobalTokenSupply = async function () {
        // make sure the total amount of tokens locked int the mainEndpoint token contract
        // is equal to the total tokens owned by all addresses on all non-mainEndpoint chains
        const mainLockedTokens = await getChainBalance(mainEndpointId)

        let childrenCumulativeTokens = ethers.BigNumber.from(0)
        for (let childEndpointId = 1; childEndpointId < numEndpoints; ++childEndpointId) {
            for (let userId = 0; userId < users.length; ++userId) {
                let childUserBalance = await getUserBalance(childEndpointId, users[userId].address)
                childrenCumulativeTokens = childrenCumulativeTokens.add(childUserBalance)
            }
        }

        expect(mainLockedTokens).to.equal(childrenCumulativeTokens)
    }
    const sendTokens = async (fromUserId, toUserId, qty, fromEndpointId, toEndpointId) => {
        const fromSigner = users[fromUserId]
        const toSigner = users[toUserId]

        const preFromBalance = await getUserBalance(fromEndpointId, fromSigner.address)
        const preToBalance = await getUserBalance(toEndpointId, toSigner.address)
        const localOft = oft[fromEndpointId]

        // send the tokens across chains
        await localOft.connect(fromSigner).sendTokens(toEndpointId, toSigner.address, qty, ZERO_ADDRESS, "0x", {
            value: ethers.utils.parseEther("0.1"),
        })

        const postFromBalance = await getUserBalance(fromEndpointId, fromSigner.address)
        const postToBalance = await getUserBalance(toEndpointId, toSigner.address)

        if (fromUserId === toUserId && fromEndpointId === toEndpointId) {
            // user sends to themselves on the same endpoint
            expect(postFromBalance).to.equal(preFromBalance)
            expect(postToBalance).to.equal(preToBalance)
        } else {
            // final balance check for a user send to a different user,
            // or a user sending to their address on another chain
            expect(postFromBalance).to.equal(preFromBalance.sub(qty))
            expect(postToBalance).to.equal(preToBalance.add(qty))
        }

        // audit the global token supply by comparing the locked tokens on mainendpoint to
        // the cumulative qty of tokens in user wallets on NON main endpoints
        await auditGlobalTokenSupply()
    }

    before(async function () {
        ;({ owner, alice, bob, user3, user4, badUser1, fakeContract } = await getAddr(ethers))
        users = [owner, alice, bob, user3, user4]
        chainId = 1
        decimals = 18
        initSupplyMainEndpoint = ethers.utils.parseEther("1000000000")
        name = CONFIG.stargateToken.name
        symbol = CONFIG.stargateToken.name

        mainEndpointId = 0 // endpoint id that controls the token
        numEndpoints = 3 // increase this number to iterate more endpoints
    })

    beforeEach(async function () {
        oft = {}
        lzEndpoints = {}

        for (let i = 0; i < numEndpoints; ++i) {
            lzEndpoints[i] = await deployNew("LZEndpointMock", [i])
            oft[i] = await deployNew("StargateToken", [name, symbol, lzEndpoints[i].address, mainEndpointId, initSupplyMainEndpoint])
        }

        // wire them together
        for (const i in oft) {
            for (const j in lzEndpoints) {
                // if (i === j) continue;
                const oftSrc = oft[i]
                const oftDst = oft[j]
                const lzSrc = lzEndpoints[i]
                const lzDst = lzEndpoints[j]

                // set
                await oftSrc.setDestination(j, oftDst.address)
                await oftDst.setDestination(i, oftSrc.address)
                await lzSrc.setDestLzEndpoint(oftDst.address, lzDst.address)
                await lzDst.setDestLzEndpoint(oftSrc.address, lzSrc.address)
            }
        }
    })

    it("send() - transfers to last chain", async function () {
        const fromUserId = 0
        const toUserId = 1
        const qty = ethers.utils.parseEther("1")
        const fromEndpointId = mainEndpointId
        const dstEndpointId = numEndpoints - 1
        await sendTokens(fromUserId, toUserId, qty, fromEndpointId, dstEndpointId)
    })

    it("send() - transfer to next chain", async function () {
        const fromUserId = 0
        const toUserId = 1
        const qty = ethers.utils.parseEther("1")
        const fromEndpointId = mainEndpointId
        const dstEndpointId = fromEndpointId + 1
        await sendTokens(fromUserId, toUserId, qty, fromEndpointId, dstEndpointId)
    })

    it("send() - send tokens to themselves", async function () {
        const user0 = 0
        await sendTokens(user0, user0, 100, mainEndpointId, mainEndpointId)
    })

    it("send() - everyone gets tokens, then everyone sends to everyone", async function () {
        // send everyone a balance on every endpoint from the source owner and source chain
        const originalOwnnerId = 0
        const originalMainEndpointId = mainEndpointId
        const largeQty = 1000000
        for (let toUserId = 0; toUserId < users.length; ++toUserId) {
            for (let endpointId = 0; endpointId < numEndpoints; ++endpointId) {
                await sendTokens(originalOwnnerId, toUserId, largeQty, originalMainEndpointId, endpointId)
            }
        }

        // have them all send to each other
        const qty = 100

        for (let fromUserId = 0; fromUserId < users.length; ++fromUserId) {
            for (let toUserId = 0; toUserId < users.length; ++toUserId) {
                for (let endpointId = 0; endpointId < numEndpoints; ++endpointId) {
                    for (let endpointId_B = 0; endpointId_B < numEndpoints; ++endpointId_B) {
                        await sendTokens(fromUserId, toUserId, qty, endpointId, endpointId_B)
                    }
                }
            }
        }
    })

    it("balanceOf() - initial balances of main and children (token contract)", async function () {
        // assert token balance. only chain 1 would mint
        for (let i = 0; i < numEndpoints; ++i) {
            expect(await getChainBalance(i)).to.equal("0")
        }
    })

    it("balanceOf() - initial balances of main and children (users)", async function () {
        //assert token balance. only chain 1 would mint
        for (let i = 0; i < numEndpoints; ++i) {
            for (let j = 0; j < users.length; ++j) {
                const balanceOft = await getUserBalance(i, users[j].address)

                if (i === mainEndpointId && j === 0) {
                    // the owner/deployer of the token on the main chain gets the initial supply
                    expect(balanceOft).to.equal("1000000000000000000000000000")
                } else {
                    expect(balanceOft).to.equal("0")
                }
            }
        }
    })

    it("sendTokens() - tokens get moved accross chains", async function () {
        // owner send some from oft_0 to alice oft_1
        // alice has no money to begin with
        expect(await oft[1].balanceOf(alice.address)).to.equal("0")
        const money1 = ethers.utils.parseEther("99")
        await oft[0].connect(owner).sendTokens(1, alice.address, money1, ZERO_ADDRESS, "0x", {
            value: ethers.utils.parseEther("0.1"),
        })
        // alice should have some money now
        expect(await oft[1].balanceOf(alice.address)).to.equal(money1)
        //assert token balance. only chain 1 would mint
        expect(await oft[0].totalSupply()).to.equal("1000000000000000000000000000")
        expect(await oft[1].totalSupply()).to.equal("99000000000000000000")

        // alice send some to bob from oft_1 to oft_2
        expect(await oft[2].balanceOf(bob.address)).to.equal("0")
        const money2 = ethers.utils.parseEther("15")
        await oft[1].connect(alice).sendTokens(2, bob.address, money2, ZERO_ADDRESS, "0x", {
            value: ethers.utils.parseEther("0.1"),
        })
        // alice should have some money now
        expect(await oft[2].balanceOf(bob.address)).to.equal(money2)

        // assert the total supply
        expect(await oft[0].totalSupply()).to.equal("1000000000000000000000000000")
        expect(await oft[1].totalSupply()).to.equal("84000000000000000000")
        expect(await oft[2].totalSupply()).to.equal("15000000000000000000")

        // bob send some to alice from oft_2 to oft_0
        const money3 = ethers.utils.parseEther("8")
        await oft[2].connect(bob).sendTokens(0, alice.address, money3, ZERO_ADDRESS, "0x", {
            value: ethers.utils.parseEther("0.1"),
        })
        // alice should have some money on oft[0]
        expect(await oft[0].balanceOf(alice.address)).to.equal(money3)

        // assert the total supply
        expect(await oft[0].totalSupply()).to.equal("1000000000000000000000000000")
        expect(await oft[1].totalSupply()).to.equal("84000000000000000000")
        // 15 - 8
        expect(await oft[2].totalSupply()).to.equal("7000000000000000000")
    })

    it("lzReceive() - reverts for non owner", async function () {
        // 42 is the arbitrary dummy return value in our mocks
        await expect(oft[0].lzReceive(chainId, "0x", 1, "0x")).to.revertedWith("")
    })

    it("estimateSendTokensFee()", async function () {
        // 42 is the arbitrary dummy return value in our mocks
        expect((await oft[0].estimateSendTokensFee(1, "0x", false, "0x"))[0]).to.equal(42)
    })

    it("setSendVersion()", async function () {
        const version = 22
        await oft[0].setSendVersion(version)
        expect(await lzEndpoints[0].mockSendVersion()).to.equal(version)
    })

    it("setReceiveVersion()", async function () {
        const version = 23
        await oft[0].setReceiveVersion(version)
        expect(await lzEndpoints[0].mockReceiveVersion()).to.equal(version)
    })

    it("setSendVersion() - reverts when non owner", async function () {
        const version = 22
        await expect(oft[0].connect(badUser1).setSendVersion(version)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("setReceiveVersion() - reverts when non owner", async function () {
        const version = 23
        await expect(oft[0].connect(badUser1).setReceiveVersion(version)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("setConfig()", async function () {
        const version = 22
        const configType = 0
        const config = "0x1234"
        await expect(oft[0].setConfig(version, chainId, configType, config))
            .to.emit(lzEndpoints[0], "SetConfig")
            .withArgs(version, chainId, configType, config)
    })

    it("setConfig() - reverts when non owner", async function () {
        const version = 22
        const configType = 0
        const config = "0x1234"
        await expect(oft[0].connect(badUser1).setConfig(version, chainId, configType, config)).to.revertedWith(
            "Ownable: caller is not the owner"
        )
    })

    it("forceResumeReceive()", async function () {
        const bytesAddr = "0x1234"
        await expect(oft[0].forceResumeReceive(chainId, bytesAddr)).to.emit(lzEndpoints[0], "ForceResumeReceive").withArgs(chainId, bytesAddr)
    })

    it("forceResumeReceive() - reverts when non owner", async function () {
        const bytesAddr = "0x1234"
        await expect(oft[0].connect(badUser1).forceResumeReceive(chainId, bytesAddr)).to.revertedWith("Ownable: caller is not the owner")
    })
})
