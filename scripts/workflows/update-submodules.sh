#!/bin/bash
set -e

TARGET_BRANCH="workflow/update-submodules-$(date +'%Y%m%d-%H%M%S')"

pwd
echo "moving to $TARGET_REPO"
cd "$TARGET_REPO"
git checkout -b "$TARGET_BRANCH"
git submodule update --init --recursive
git add .
git commit --allow-empty  -m "AUTOMATED: Update submodules"
echo "Attempting to pusH"
echo "Using token: ${GH_PAT:0:4}...${GH_PAT:(-4)}"
# git remote set-url origin https://lunohomachine:${GH_PAT}@github.com/velocity-exchange/drift-common.git
git remote -v
git config --unset-all http.https://github.com/.extraheader
git push --set-upstream origin "$TARGET_BRANCH"
echo "Successfully cloned repo, created branch '$TARGET_BRANCH', updated submodules, and pushed to remote."