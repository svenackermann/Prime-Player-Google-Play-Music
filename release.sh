#!/bin/bash
current_branch=$(git symbolic-ref --short HEAD)
if [ $? -ne 0 ];
then
  echo "Cannot release from detached state"
  exit 1
fi

git diff --exit-code --quiet && git diff --exit-code --cached --quiet
if [ $? -ne 0 ];
then
  echo "You have uncommited changes"
  exit 2
fi

tag=master
if [ $# -eq 1 ]
then
  tag=$1
fi
git checkout -q $tag
if [ $? -ne 0 ];
then
  echo "Invalid tag or branch: $tag"
  exit 3
fi

echo "Building from tag/branch $tag"
gulp release

git checkout -q $current_branch
echo "Back on branch $current_branch"
