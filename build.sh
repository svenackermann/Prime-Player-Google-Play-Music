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
sass --style compressed PrimePlayer/css/player.scss PrimePlayer/css/player.css
rm PrimePlayer.zip
cd PrimePlayer
7za a -xr@../exclude.lst -tzip ../PrimePlayer.zip *
cd ..

git checkout -q develop
echo "Back on branch develop"
