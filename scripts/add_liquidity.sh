#!/bin/bash

# add liquidity to a local chain for a given pool id
function add_liquidity {
  N=$1
  networks=(${N//,/ })
  P=$2
  pools=(${P//,/ })
  for network in "${networks[@]}"
  do
    for poolId in "${pools[@]}"
    do
      eval "npx hardhat --network ${network} addLiquidity --pool-id ${poolId} --qty 2000000"
    done
  done
}

# usage: $ ./add_liquidity.sh rinkeby-sandbox,fuji-sandbox 1,2,2
add_liquidity $1 $2