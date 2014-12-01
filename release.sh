#!/bin/bash
git diff --exit-code --quiet && git diff --exit-code --cached --quiet
if [ $? -ne 0 ];
then
  echo "You have uncommited changes"
  exit 1
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
  exit 2
fi

echo "Building from tag/branch $tag"
gulp release

git checkout -q develop
echo "Back on branch develop"
