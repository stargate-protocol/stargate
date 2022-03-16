#!/bin/bash

# usage: $ deploy.sh eth,avax,bsc 1,2,3

function deploy_stargates {
  # "$@" is the array of parameters passed to this function
  arr=("$@")
  for network in "${arr[@]}";
    do
      eval "npx hardhat --network ${network} deploy"
    done
}

function wire_stargate_tokens {
  arr=("$@")
  for network in "${arr[@]}"
    do
       for targetNetwork in "${arr[@]}"
       do
          if [[ $network == $targetNetwork ]]
          then
            continue
          fi
          eval "npx hardhat --network ${network} wireStargateTokens --target-networks ${targetNetwork}"
       done
    done
}

function wire_stargates {
  arr=("$@")
  for network in "${arr[@]}"
    do
       for targetNetwork in "${arr[@]}"
       do
          if [[ $network == $targetNetwork ]]
          then
            continue
          fi
          eval "npx hardhat --network ${network} wireBridges --target-networks ${targetNetwork}"
       done
    done
}

function make_pools {
  arr=("$@")
  for network in "${arr[@]}"
  do
    eval "npx hardhat --network ${network} createPools"
  done
}

function make_chain_paths {
  arr=("$@")
  for network in "${arr[@]}"
    do
      for targetNetwork in "${arr[@]}"
      do
        if [[ $network == $targetNetwork ]]
        then
          continue
        fi
        eval "npx hardhat --network ${network} createChainPaths --target-network ${targetNetwork}"
      done
    done
}

function make_chain_paths_active {
  arr=("$@")
  for network in "${arr[@]}"
  do
    for targetNetwork in "${arr[@]}"
    do
      if [[ $network == $targetNetwork ]]
      then
        continue
      fi
      eval "npx hardhat --network ${network} activateChainPaths --target-network ${targetNetwork}"
    done
  done
}

# deploy and wire stargate instances
#
#echo "[step 1: *Deploy* Stargate instance(s)]"
#deploy_stargates $@
#
echo "[step 2: *Wire* StargateTokens to other StargateTokens]"
wire_stargate_tokens $@
#
echo "[step 3: *Wire Bridges*, connecting each Stargate instance]"
wire_stargates $@
#
echo "[step 4: *Create Pools* for each Stargate instance]"
make_pools $@
#
echo "[step 5: *Create All Chain Paths*, wiring up the Stargate pool mesh]"
make_chain_paths $@
#
echo "[step 6: *Activate Paths*, activating mesh pathways]"
make_chain_paths_active $@
