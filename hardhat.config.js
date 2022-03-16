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

const { ChainId, setupNetwork } = require('@layerzerolabs/core-sdk')

// const infuraProjectId = process.env.INFURA_PROJECT_ID;
// console.log(`infuraProjectId: ${infuraProjectId}`);

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

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
// Go to https://hardhat.org/config/ to learn more

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
        hardhat: {
            initialBaseFeePerGas: 0, // workaround from https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136 . Remove when that issue is closed.
        },

        //////////////////////// mainnets
        ...setupNetwork({
            // eth mainnet
            eth: {
                url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_ETH_API_KEY}`,
            } }, [ChainId.ETHEREUM]),
        ...setupNetwork({
            // bsc mainnet
            bsc: {
                url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_MAINNET_BSC_API_KEY}`,
            } }, [ChainId.BSC]),
        ...setupNetwork({
            // avax mainnet
            avax: {
                url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_MAINNET_AVAX_API_KEY}`,
            } }, [ChainId.AVALANCHE]),
        ...setupNetwork({
            // polygon mainnet
            polygon: {
                url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_POLYGON_API_KEY}`,
            } }, [ChainId.POLYGON]),
        ...setupNetwork({
            // arbitrum mainnet
            arbitrum: {
                url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_ARBITRUM_API_KEY}`,
            } }, [ChainId.ARBITRUM]),
        ...setupNetwork({
            // optimism mainnet
            optimism: {
                url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_OPTIMISM_API_KEY}`,
            } }, [ChainId.OPTIMISM]),
        ...setupNetwork({
            // ftm mainnet
            ftm: {
                url: `https://speedy-nodes-nyc.moralis.io/${process.env.MORALIS_MAINNET_FTM_API_KEY}`,
            } }, [ChainId.FANTOM]),
        ...setupNetwork({
            rinkeby: {
                url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`
            }
        }, [ChainId.RINKEBY, ChainId.RINKEBY_SANDBOX]),
        ...setupNetwork({
            "bsc-testnet": {
                url: `${process.env.BSC_TESTNET_RPC}` // "https://data-seed-prebsc-2-s3.binance.org:8545"
            }
        }, [ChainId.BSC_TESTNET, ChainId.BSC_TESTNET_SANDBOX]),
        ...setupNetwork({
            fuji: {
                url: `${process.env.FUJI_RPC}`
            }
        }, [ChainId.FUJI, ChainId.FUJI_SANDBOX]),
        ...setupNetwork({
            mumbai: {
                url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_MUMBAI_API_KEY}` // "https://rpc-mumbai.maticvigil.com/",
            }
        }, [ChainId.MUMBAI, ChainId.MUMBAI_SANDBOX]),
        ...setupNetwork({
            arbrink: {
                url: `https://arb-rinkeby.g.alchemy.com/v2/${process.env.ALCHEMY_ARBRINK_API_KEY}`
            }
        }, [ChainId.ARBITRUM_RINKEBY, ChainId.ARBITRUM_RINKEBY_SANDBOX]),
        ...setupNetwork({
            optkov: {
                url: `https://opt-kovan.g.alchemy.com/v2/${process.env.ALCHEMY_OPTKOV_API_KEY}` // `https://optimism-kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
            }
        }, [ChainId.OPTIMISM_KOVAN, ChainId.OPTIMISM_KOVAN_SANDBOX]),
        ...setupNetwork({
            "ftm-testnet": {
                url: `${process.env.FTM_TESTNET_RPC}`
            }
        }, [ChainId.FANTOM_TESTNET, ChainId.FANTOM_TESTNET_SANDBOX]),
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
