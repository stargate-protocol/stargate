require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-solhint");
require("@nomiclabs/hardhat-web3");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("hardhat-tracer");
require("@primitivefi/hardhat-dodoc");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("hardhat-spdx-license-identifier");

// const infuraProjectId = process.env.INFURA_PROJECT_ID;
// console.log(`infuraProjectId: ${infuraProjectId}`);


// custom helper tasks
require("./tasks/addLiquidity");
require("./tasks/sendCredits");
require("./tasks/swap");
require("./tasks/createChainPath");
require("./tasks/setWeightForChainPath");
require("./tasks/setBridge");
require("./tasks/getBridge");
require("./tasks/mintTokens");
require("./tasks/getPool");
require("./tasks/addLPStakingPool");
require("./tasks/createPools");
require("./tasks/createChainPaths");
require("./tasks/activateChainPath");
require("./tasks/activateChainPaths");
require("./tasks/deployToken");
require("./tasks/testnetSwap");
require("./tasks/wireBridges");
require("./tasks/wireStargateTokens");
require("./tasks/sendStargateTokens");
require("./tasks/sendCreditsAll");
require("./tasks/getChainPath");
require("./tasks/getFeeVersion")
require("./tasks")

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more4


function getMnemonic(networkName) {
    if (networkName) {
        const mnemonic = process.env['MNEMONIC_' + networkName.toUpperCase()]
        if (mnemonic && mnemonic !== '') {
            return mnemonic
        }
    }

    const mnemonic = process.env.MNEMONIC
    if (!mnemonic || mnemonic === '') {
        return 'test test test test test test test test test test test junk'
    }

    return mnemonic
}

function accounts(chainKey) {
    return { mnemonic: getMnemonic(chainKey) }
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    contractSizer: {
        alphaSort: false,
        runOnCompile: true,
        disambiguatePaths: false,
    },


    // for hardhat-deploy
    namedAccounts: {
        deployer: 0,
    },

    defaultNetwork: "hardhat",

    networks: {
        ethereum: {
            url: "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // public infura endpoint
            chainId: 1,
            accounts: accounts(),
        },

        avalanche: {
            url: "https://api.avax.network/ext/bc/C/rpc",
            chainId: 43114,
            accounts: accounts(),
        },

        rinkeby: {
            url: "https://rinkeby.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // public infura endpoint
            chainId: 4,
            accounts: accounts(),
        },
        'bsc-testnet': {
            url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
            chainId: 97,
            accounts: accounts(),
        },
        fuji: {
            url: `https://api.avax-test.network/ext/bc/C/rpc`,
            chainId: 43113,
            accounts: accounts(),
        },
        mumbai: {
            url: "https://rpc-mumbai.maticvigil.com/",
            chainId: 80001,
            accounts: accounts(),
        },
        'arbitrum-rinkeby': {
            url: `https://rinkeby.arbitrum.io/rpc`,
            chainId: 421611,
            accounts: accounts(),
        },
        'optimism-kovan': {
            url: `https://kovan.optimism.io/`,
            chainId: 69,
            accounts: accounts(),
        },
        'fantom-testnet': {
            url: `https://rpc.testnet.fantom.network/`,
            chainId: 4002,
            accounts: accounts(),
        }
    },
    mocha: {
        timeout: 500000,
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
};
