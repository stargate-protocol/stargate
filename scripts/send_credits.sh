#!/bin/bash

# send credits
function send_credits {
  N=$1
  networks=(${N//,/ })
  P=$2
  pools=(${P//,/ })
  for network in "${networks[@]}"
    do
      for targetNetwork in "${networks[@]}"
      do
        if [[ $network == $targetNetwork ]]
        then
          continue
        fi
        for poolId in "${pools[@]}"
        do
          for dstPoolId in "${pools[@]}"
          do
            eval "npx hardhat --network ${network} sendCredits --pool-id ${poolId} --dst-pool-id ${dstPoolId} --target-networks ${targetNetwork}"
          done
        done
      done
    done
}

# usage: $ ./send_credits.sh bsctestnet-sandbox,fuji-sandbox 1,2,3
send_credits $1 $2