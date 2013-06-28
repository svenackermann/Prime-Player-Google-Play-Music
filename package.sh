sass --style compressed PrimePlayer/css/player.scss PrimePlayer/css/player.css
#crxmake --pack-extension=PrimePlayer --pack-extension-key=PrimePlayer.pem --ignore-file="\.(scss|map)$"
rm PrimePlayer.zip
cd PrimePlayer
7za a -xr@../exclude.lst -tzip ../PrimePlayer.zip *
cd ..
