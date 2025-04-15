#!/bin/bash

# Get the start time
start_time=$(date +%s)

# Source the utility script
source ./scripts/utils.sh

# Function to perform build tasks
build() {
    local folder=$1
    local build_cmd=${2:-"build"} # build cmd defaults to "build" if nothing provided
    local additional_cmd=$3

    cd ${folder}
    
    echo "Current directory: $(pwd)"
    print_message "build-vercel.sh" "Building :: folder:${folder}, build_cmd:${build_cmd}, additional_cmd:${additional_cmd}"
    
    if [ -n "${additional_cmd}" ]; then
        ${additional_cmd}
    fi

    bun run ${build_cmd}
}

print_message "Node version:"
node -v

# Build tasks
base_directory=$(pwd) # EXPECT THIS TO BE THE UI FOLDER

build "../drift-common/protocol/sdk" "build:browser" "bun add @project-serum/borsh"
cd ${base_directory}

build "../drift-common/common-ts" "" "bun add @solana/spl-token"
cd ${base_directory}

build "../drift-common/icons"  "" ""
cd ${base_directory}

build "../drift-common/react"  "" ""
cd ${base_directory}

build "../drift-vaults/ts/sdk" "" "bun add @drift-labs/sdk"
cd ${base_directory}

build "." "build" ""
cd ${base_directory}


# Get the end time
end_time=$(date +%s)

# Calculate and print the execution time
execution_time=$(expr $end_time - $start_time)
print_message "build-vercel.sh" "Execution time: ${execution_time} seconds"

print_message "Build completed."