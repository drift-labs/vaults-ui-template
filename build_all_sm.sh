# cd drift-common && rm -rf package-lock.json && rm -rf yarn.lock && rm -rf node_modules && yarn && cd ..
# cd drift-common/protocol/sdk && rm -rf node_modules && yarn && yarn build && yarn link && cd ../../..
# cd drift-common/common-ts && rm -rf package-lock.json && rm -rf node_modules && yarn && yarn link @velocity-exchange/sdk && yarn build && yarn link && cd ../..
# cd drift-common/icons && rm -rf package-lock.json && rm -rf yarn.lock && rm -rf node_modules && yarn && yarn build && yarn link && cd ../..
# cd drift-common/react && rm -rf package-lock.json && rm -rf yarn.lock && rm -rf node_modules && yarn && yarn build && yarn link @velocity-exchange/sdk && yarn link @drift/common && yarn link @velocity-exchange/icons && yarn link && cd ../..
# cd drift-vaults/ts/sdk && rm -rf package-lock.json && rm -rf yarn.lock && rm -rf node_modules && yarn && yarn build && yarn link && cd ../../..
# rm -rf package-lock.json && rm -rf yarn.lock && rm -rf node_modules && yarn && yarn link @velocity-exchange/react && yarn link @velocity-exchange/sdk && yarn link @drift/common && yarn link @velocity-exchange/icons && yarn link @velocity-exchange/vaults-sdk && yarn build

source ./scripts/utils.sh

function print() {
  local message=$1

  echo "#task: ${message}${NC}"
}

install_and_build_package() {
  local package_path=$1
  local links=$2
  local should_run_bun_link=$3
  local should_build=$4
  local custom_build_command=$5

  cd ${package_path} && bun install

  for link in ${links[@]}
  do
      print "bun link for ${folder} -> ${link}"
      bun link ${link}
  done

  if [ "${should_run_bun_link}" = "true" ]; then
    print "Running bun link for ${folder}"
    bun link
  fi

  if [ "${should_build}" = "true" ]; then
    if [ -n "${custom_build_command}" ]; then
      print "Running custom build command: ${custom_build_command}"
      eval ${custom_build_command}
    else
      print "Running yarn build for ${folder}"
      yarn build
    fi
  fi

  cd - &> /dev/null
}

# Install packages
install_and_build_package "drift-common" "" "" "" ""
install_and_build_package "drift-common/protocol" "" "" "" ""
install_and_build_package "drift-common/protocol/sdk" "" "true" "true" "bun run build:browser"
install_and_build_package "drift-common/common-ts" "@velocity-exchange/sdk" "true" "true" ""
install_and_build_package "drift-common/icons" "" "true" "true" "bun run build:rollup"
install_and_build_package "drift-common/react" "@velocity-exchange/sdk @drift/common @velocity-exchange/icons" "true" "true" ""
install_and_build_package "drift-vaults/ts/sdk" "" "true" "true" ""

install_and_build_package "ui" "@velocity-exchange/react @velocity-exchange/sdk @drift/common @velocity-exchange/icons @velocity-exchange/vaults-sdk" "" "true" ""