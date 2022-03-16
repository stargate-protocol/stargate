const { ethers } = require("hardhat")
const { expect } = require("chai")
const { DEBUG } = require("./constants")

function print(msg) {
    if (DEBUG) print(msg)
}

async function deployStargateContracts(_chainId) {
    const lzEndpointContract = await ethers.getContractFactory("LZEndpointMock") // LayerZeroEndpointMock.sol
    const lzEndpoint = await lzEndpointContract.deploy(_chainId)
    await lzEndpoint.deployed()

    const routerContract = await ethers.getContractFactory("Router") // Router.sol
    const router = await routerContract.deploy()
    await router.deployed()

    const bridgeContract = await ethers.getContractFactory("Bridge") // Bridge.sol
    const bridge = await bridgeContract.deploy(lzEndpoint.address, router.address)
    await bridge.deployed()

    const factoryContract = await ethers.getContractFactory("Factory") // Factory.sol
    const factory = await factoryContract.deploy(router.address)
    await factory.deployed()

    const feeLibraryContract = await ethers.getContractFactory("StargateFeeLibraryV01") // StargateFeeLibraryV01.sol
    const feeLibrary = await feeLibraryContract.deploy(factory.address)
    await feeLibrary.deployed()

    await factory.setDefaultFeeLibrary(feeLibrary.address)

    //set deploy params
    await (await router.setBridgeAndFactory(bridge.address, factory.address)).wait()

    return { factory, router, bridge, lzEndpoint, feeLibrary }
}

async function deployPool(_poolContract, _factory, _router, _poolId, _token, _sharedDecimals) {
    //create pool
    await _router.createPool(_poolId, _token.address, _sharedDecimals, await _token.decimals(), "x", "x*")
    return _poolContract.attach(await _factory.getPool(_poolId))
}

async function deployToken(_tokenContract, _name, _symbol, _decimals) {
    const token = await _tokenContract.deploy(_name, _symbol, _decimals)
    await token.deployed()
    return token
}

async function mintAndApproveFunds(token, signer, amount, approveRouterAddresses) {
    await token.mint(signer.address, amount)
    for (let address of approveRouterAddresses) {
        await token.connect(signer).approve(address, amount)
    }
}

async function bridgeStargateEndpoints(stargateEndpoints) {
    for (const i in stargateEndpoints) {
        for (const j in stargateEndpoints) {
            if (i === j) continue
            const stargateSrc = stargateEndpoints[i]
            const stargateDst = stargateEndpoints[j]

            const remoteBridge = await stargateSrc.bridge.bridgeLookup(stargateDst.chainId)
            if (remoteBridge === "0x") {
                // set it if its not set
                await stargateSrc.bridge.setBridge(stargateDst.chainId, stargateDst.bridge.address)
            }

            const destLzEndpoint = await stargateSrc.lzEndpoint.lzEndpointLookup(stargateDst.bridge.address)
            if (destLzEndpoint === "0x0000000000000000000000000000000000000000") {
                // set it if its not set
                await stargateSrc.lzEndpoint.setDestLzEndpoint(stargateDst.bridge.address, stargateDst.lzEndpoint.address)
            }
        }
    }
}

class GlobalBook {
    constructor() {
        this.stargateEndpoints = {} //chainId => stargateEndpoint
        this.sharedDecimals = 6
        this.tokenList = []
    }

    async newStargateEndpoint(_newChainId, _name, _poolsParams) {
        const { factory, router, bridge, lzEndpoint, feeLibrary } = await deployStargateContracts(_newChainId, _poolsParams)

        //create poolInfos
        const poolInfos = {} //id => poolInfo

        //contracts deployed per pool
        const poolContract = await ethers.getContractFactory("Pool") //Pool.sol
        const mockTokenContract = await ethers.getContractFactory("MockToken") // MockTokenWithDecimals.sol

        for (const poolParams of _poolsParams) {
            const { poolId: newPoolId, tokenInfo } = poolParams

            const token = await deployToken(mockTokenContract, tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals)
            this.tokenList.push(token)

            const newPool = await deployPool(poolContract, factory, router, newPoolId, token, this.sharedDecimals)

            // connect exiting pools to the new pool
            // for each existing pool
            const chainPaths = []
            for (const dstChainId in this.stargateEndpoints) {
                const dstStargateEndpoint = this.stargateEndpoints[dstChainId]
                //for each dst pool, create chain path to new Pool
                for (const dstPoolId in dstStargateEndpoint.poolInfos) {
                    await dstStargateEndpoint.router.createChainPath(dstPoolId, _newChainId, newPoolId, 1)

                    await dstStargateEndpoint.router.activateChainPath(dstPoolId, _newChainId, newPoolId)

                    dstStargateEndpoint.poolInfos[dstPoolId].chainPaths.push([_newChainId, newPoolId])

                    // new -> dst
                    await router.createChainPath(newPoolId, dstChainId, dstPoolId, 1)
                    await router.activateChainPath(newPoolId, dstChainId, dstPoolId)
                    chainPaths.push([dstChainId, dstPoolId])
                }
            }

            poolInfos[newPoolId] = {
                pool: newPool,
                token,
                chainPaths,
                lpProviders: {},
            }
        }

        //assemble and return stargateEndpoint
        const stargateEndpoint = {
            name: _name,
            chainId: _newChainId,
            router,
            bridge,
            lzEndpoint,
            poolInfos,
            feeLibrary,
        }
        this.stargateEndpoints[_newChainId] = stargateEndpoint

        //bridge new stargate with each other
        await bridgeStargateEndpoints(this.stargateEndpoints)

        return stargateEndpoint
    }

    async provisionLiquidity(_signer, _chainId, _poolId, _amountRaw) {
        const amount = this.amountToPoolLD(_amountRaw, _chainId, _poolId)
        const stargateEndpoint = this.stargateEndpoints[_chainId]
        const { chainPaths, lpProviders } = stargateEndpoint.poolInfos[_poolId]
        await stargateEndpoint.router.connect(_signer).addLiquidity(_poolId, amount, _signer.address)
        for (const [dstChainId, dstPoolId] of chainPaths) {
            await stargateEndpoint.router.connect(_signer).sendCredits(dstChainId, _poolId, dstPoolId, _signer.address)
        }
        if (!(_signer.address in lpProviders)) {
            this.stargateEndpoints[_chainId].poolInfos[_poolId].lpProviders[_signer.address] = _signer
        }
        await this.audit()
    }

    async amountLDtoLP(chainId, poolId, amountLD) {
        const stargateEndpoint = this.stargateEndpoints[chainId]
        const { pool } = stargateEndpoint.poolInfos[poolId]
        const totalLiq = await pool.totalLiquidity()
        const totalSup = await pool.totalSupply()
        const convertRate = await pool.convertRate()
        const amountSD = amountLD.div(convertRate)
        return amountSD.mul(totalSup).div(totalLiq)
    }

    async getChainPath(_poolId, _fromChainId, _toChainId, _toPoolId) {
        const stargateSrc = this.stargateEndpoints[_fromChainId]
        const { pool } = stargateSrc.poolInfos[_poolId]
        const cpIndex = await pool.chainPathIndexLookup(_toChainId, _toPoolId)
        return await pool.chainPaths(cpIndex)
    }

    async amountToPoolLD(_amountRaw, _chainId, _poolId) {
        const { token } = this.stargateEndpoints[_chainId].poolInfos[_poolId]
        const decimals = await token.decimals()
        return ethers.BigNumber.from(10).pow(decimals).mul(_amountRaw)
    }

    /*
    CONSTRAINT 1 - IFG for each pool. the total promised liquidity to chainPath is solvent
           => { asset - deltaCredit == sum_over_chainPath (transactionInflight + dst.Balance + src.Credit) }
    CONSTRAINT 2 - global solvency. all LPs can withdraw in full (considering all fees)
            => { sum_over_pool_of_all_chains (asset - nonLiquidityRelatedFees) == sum_over_pool_of_all_chains (totalLiquidity) }
     */
    async audit() {
        /*
      compute global metrics across all chains
      - globalBookedLiquidity = (pool.totalLiquidity) sum by chains
      - globalEstimatedLiquidity = (unallocated liquidity (deltaCredits)
                                    + allocated liquidity (lkb + credits)) sum by chains
     */
        //for each chain
        for (const srcChainId in this.stargateEndpoints) {
            const { poolInfos } = this.stargateEndpoints[srcChainId]

            // for each pool of the pool
            for (const srcPoolId in poolInfos) {
                //loop over chainpaths of pool
                const { pool, token, chainPaths } = poolInfos[srcPoolId]
                const tokenBalance = await token.balanceOf(pool.address)
                print(tokenBalance.toString())
                print(pool.address)
                print(token.address)
                print(`balance pre-pool-assets${(await token.balanceOf(pool.address)).toString()}`)

                const convertRate = await pool.convertRate()
                const eqFeePool = await pool.eqFeePool()
                const protocolFee = await pool.protocolFeeBalance()
                const mintFeeBalance = await pool.mintFeeBalance()
                const poolAssets = tokenBalance.div(convertRate).sub(eqFeePool).sub(protocolFee).sub(mintFeeBalance)

                // let poolAssets = tokenBalance
                //     .div(await pool.convertRate())
                //     .sub(await pool.eqFeePool())
                //     .sub(await pool.protocolFeeBalance())
                //     .sub(await pool.mintFeeBalance())
                print(`balance pre-delta${(await token.balanceOf(pool.address)).toString()}`)

                let totalQueryBalance = poolAssets.sub(await pool.deltaCredit())
                print(`balance post-delta ${(await token.balanceOf(pool.address)).toString()}`)

                let totalPromisedBalance = ethers.BigNumber.from(0)
                print(`balance start ${(await token.balanceOf(pool.address)).toString()}`)

                // for each iterate by destination chain
                for (const [dstChainId, dstPoolId] of chainPaths) {
                    const dstPool = this.stargateEndpoints[dstChainId].poolInfos[dstPoolId].pool
                    const dstCP = await dstPool.chainPaths(await dstPool.chainPathIndexLookup(srcChainId, srcPoolId))
                    const srcCP = await pool.chainPaths(await pool.chainPathIndexLookup(dstChainId, dstPoolId))

                    // if no msg inFlight, dstCp.lkb === srcCp.balance
                    const transactionsInFlight = dstCP.lkb.sub(srcCP.balance)
                    const promisedBalance = dstCP.balance.add(srcCP.credits)

                    totalPromisedBalance = totalPromisedBalance.add(transactionsInFlight).add(promisedBalance)
                    print(`balance ${dstChainId} ${(await token.balanceOf(pool.address)).toString()}`)
                }
                if (totalPromisedBalance.toString() !== totalQueryBalance.toString()) {
                    print((await pool.deltaCredit()).toString())
                    print((await pool.convertRate()).toString())
                    const tokenBalance3 = await token.balanceOf(pool.address)
                    print(tokenBalance3.toString())
                    print(token.address)
                    print((await token.balanceOf(pool.address)).toString())
                    print("here")
                }
                /*
                ASSERT - IFG constraints
                 */
                expect(totalPromisedBalance).to.equal(totalQueryBalance)
            }
        }
    }
}

async function toPowerOfDecimals(_amountRaw, _token) {
    return ethers.BigNumber.from(10)
        .pow(await _token.decimals())
        .mul(_amountRaw)
}

module.exports = {
    GlobalBook,
    mintAndApproveFunds,
    toPowerOfDecimals,
}
