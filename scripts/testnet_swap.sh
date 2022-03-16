#!/bin/bash

# usage:
#
#   $ npx hardhat --network LOCALNETWORK --pool-id LOCAL_POOL_ID --target-network DSTNETWORK --dst-pool-id DST_POOLID
eval "npx hardhat --network ${1} testnetSwap --pool-id ${2} --target-network ${3} --dst-pool-id ${4} --qty ${5}"