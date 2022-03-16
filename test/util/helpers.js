const hre = require("hardhat")
const { expect } = require("chai")
const { utils } = require("ethers")
const { BigNumber } = require("ethers")

// for testing permit()
const PERMIT_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"))

print = (a) => {
    if (process.env.VERBOSE === undefined || process.env.VERBOSE === "true") console.log(a)
}

getAddr = async (ethers) => {
    const [owner, proxyOwner, bob, alice, user3, user4, badUser1, badUser2, fakeContract] = await ethers.getSigners()
    bob.name = "bob"
    alice.name = "alice"

    return {
        owner,
        proxyOwner,
        bob,
        alice,
        user3,
        user4,
        badUser1,
        badUser2,
        fakeContract,
    }
}

checkBalance = async (address, expected) => {
    let balance = await hre.ethers.provider.getBalance(address)
    expect(balance).to.equal(BigNumber.from(expected))
    return balance
}

checkTokenBalance = async (token, address, expected) => {
    const balance = await token.balanceOf(address)
    expect(balance).to.equal(BigNumber.from(expected))
    return balance
}

amountSDtoLD = (amount, poolObj) => {
    return BigNumber.from(amount.mul(String(10 ** (poolObj.ld - poolObj.sd))).toString())
}

amountLDtoSD = (amount, poolObj) => {
    return BigNumber.from(Math.floor(amount.div(String(10 ** (poolObj.ld - poolObj.sd)))).toString())
}

getRoundingDust = (amount, poolObj) => {
    return amount.sub(amountSDtoLD(amountLDtoSD(amount, poolObj), poolObj))
}

getBalance = async (address) => {
    return await hre.ethers.provider.getBalance(address)
}

getCurrentBlock = async () => {
    return (await hre.ethers.provider.getBlock("latest")).number
}

mineNBlocks = async (n) => {
    for (let index = 0; index < n; index++) {
        await ethers.provider.send("evm_mine")
    }
}

getFeeLibraryFromPool = async (pool) => {
    const feeLibraryAddr = await pool.feeLibrary()
    const FeeLibrary = await ethers.getContractFactory("StargateFeeLibraryV02")
    return await FeeLibrary.attach(feeLibraryAddr)
}

getPoolFromFactory = async (factory, poolId) => {
    const poolAddr = await factory.getPool(poolId)
    const Pool = await ethers.getContractFactory("Pool")
    return await Pool.attach(poolAddr)
}

getFeesFromFeeLibraryForPool = async (srcPoolObj, dstPoolObj, user, srcAmountSD) => {
    const feeLibrary = await getFeeLibraryFromPool(srcPoolObj.pool)
    return await feeLibrary.getFees(srcPoolObj.id, dstPoolObj.id, dstPoolObj.chainId, user.address, srcAmountSD)
}

getDefaultLzTxParams = (lzTxParams) => {
    lzTxParams.dstGasForCall = lzTxParams.dstGasForCall || 0
    lzTxParams.dstNativeAmount = lzTxParams.dstNativeAmount || 0
    lzTxParams.dstNativeAddr = lzTxParams.dstNativeAddr || "0x"
    return lzTxParams
}

getDomainSeparator = (name, tokenAddress) => {
    return utils.keccak256(
        utils.defaultAbiCoder.encode(
            ["bytes32", "bytes32", "bytes32", "uint256", "address"],
            [
                utils.keccak256(utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
                utils.keccak256(utils.toUtf8Bytes(name)),
                utils.keccak256(utils.toUtf8Bytes("1")),
                31337,
                tokenAddress,
            ]
        )
    )
}

getApprovalDigest = async (token, approve, nonce, deadline) => {
    const name = await token.name()
    const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
    return utils.keccak256(
        utils.solidityPack(
            ["bytes1", "bytes1", "bytes32", "bytes32"],
            [
                "0x19",
                "0x01",
                DOMAIN_SEPARATOR,
                utils.keccak256(
                    utils.defaultAbiCoder.encode(
                        ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
                        [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
                    )
                ),
            ]
        )
    )
}

deployNew = async (contractName, params = []) => {
    const C = await ethers.getContractFactory(contractName)
    return await C.deploy(...params)
}

encodeParams = (types, values, packed = false) => {
    if (!packed) {
        return web3.eth.abi.encodeParameters(types, values)
    } else {
        return ethers.utils.solidityPack(types, values)
    }
}

encodePackedParams = (types, values) => {
    return encodeParams(types, values, true)
}

decodeParam = (type, value) => {
    return web3.eth.abi.decodeParameter(type, value)
}

// !!! Use at own risk, txEther might need to be increased if running out of gas
callAsContract = async (contract, impersonateAddr, funcNameAsStr, params = [], msgValue = 0) => {
    const existingBal = await hre.ethers.provider.getBalance(impersonateAddr)

    // Might need to increase this for big transactions
    const txEther = BigNumber.from("10000000000000000000000000")
    const msgValueBn = BigNumber.from(msgValue)

    // Update the balance on the network
    await network.provider.send("hardhat_setBalance", [
        impersonateAddr,
        existingBal.add(txEther).add(msgValueBn).toHexString().replace("0x0", "0x"),
    ])

    // Retrieve the signer for the person to impersonate
    const signer = await ethers.getSigner(impersonateAddr)

    // Impersonate the smart contract to make the corresponding call on their behalf
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [impersonateAddr],
    })

    // Process the transaction on their behalf
    const rec = await contract.connect(signer)[funcNameAsStr](...params, { value: msgValueBn })
    const tx = await rec.wait()

    // The amount of gas consumed by the transaction
    const etherUsedForGas = tx.gasUsed.mul(tx.effectiveGasPrice)
    const extraEther = txEther.sub(etherUsedForGas)

    // Balance post transaction
    const currentBal = await hre.ethers.provider.getBalance(impersonateAddr)

    // Subtract the difference in the amount of ether given
    // vs the amount used in the transaction
    await hre.network.provider.send("hardhat_setBalance", [impersonateAddr, currentBal.sub(extraEther).toHexString().replace("0x0", "0x")])

    // Undo the impersonate so we go back to the default
    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [impersonateAddr],
    })

    return rec
}

module.exports = {
    getAddr,
    callAsContract,
    checkBalance,
    checkTokenBalance,
    getBalance,
    deployNew,
    encodePackedParams,
    encodeParams,
    decodeParam,
    amountSDtoLD,
    amountLDtoSD,
    getFeeLibraryFromPool,
    getFeesFromFeeLibraryForPool,
    getPoolFromFactory,
    getDefaultLzTxParams,
    getRoundingDust,
    getCurrentBlock,
    mineNBlocks,
    getApprovalDigest,
}
