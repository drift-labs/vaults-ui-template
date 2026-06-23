#!/bin/bash

# Get the start time
start_time=$(date +%s)

# Source the utils script
source ./scripts/utils.sh

function print() {
  local message=$1

  print_message "install-vercel.sh" "${message}"
}

function print_exec_command() {
    local command=$1
    
    print_message "install-vercel.sh" "${command}"
    ${command}
}

# Function to pull public submodule
function handle_public_submodule() {
    local parent_path=$1
    local submodule_name=$2

    print "pulling submodule ${submodule_name}"

    cd ${parent_path}
    rm -rf ${submodule_name}
    git submodule update --init ${submodule_name}

    cd -
}

# Function to perform bun install and link
function bun_install_and_link() {
    local folder=$1
    local links=$2
    local should_run_bun_link=$3

    cd ${folder}
    print "bun install for ${folder}"
    bun install

    if [ "${should_run_bun_link}" = "true" ]; then
        print "Running bun link for ${folder}"
        bun link
    fi

    for link in ${links[@]}
    do
        print "bun link for ${folder} -> ${link}"
        bun link ${link}
    done

    cd - &> /dev/null
}

# Install submodules
handle_public_submodule ".." "drift-common"
handle_public_submodule "../drift-common" "protocol"

print_exec_command "cd .." # in root dir

# Install Drift SDK
bun_install_and_link "./drift-common/protocol" "" ""
bun_install_and_link "./drift-common/protocol/sdk" "" "true"

# Install common-ts, icons, react
bun_install_and_link "./drift-common/common-ts" "@velocity-exchange/sdk" "true"
bun_install_and_link "./drift-common/icons" "" "true"
bun_install_and_link "./drift-common/react" "@velocity-exchange/sdk @drift/common @velocity-exchange/icons" "true"

# Install vaults-sdk
bun_install_and_link "./drift-vaults/ts/sdk" "" "true"

# Install ui
bun_install_and_link "./ui" "@drift/common @velocity-exchange/sdk @velocity-exchange/icons @velocity-exchange/react" ""

# Get the end time
end_time=$(date +%s)

# Calculate and print the execution time
execution_time=$(expr $end_time - $start_time)
print "Execution time: ${execution_time} seconds"