const { LZ_ADDRESS } = require("@layerzerolabs/lz-sdk")

function getLayerZeroAddress(networkName) {
    if(!Object.keys(LZ_ADDRESS).includes(networkName)){
        throw new Error("Unknown networkName: " + networkName);
    }
    console.log(`networkName[${networkName}]`)
    return LZ_ADDRESS[networkName];
}

module.exports = {
    getLayerZeroAddress
}