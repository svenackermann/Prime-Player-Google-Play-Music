#!/bin/bash
echo "*** installing Gulp..."
npm install gulp -g
if [ $? -ne 0 ];
then
  echo "*** Gulp install failed"
  exit 1
fi
gulp -v
if [ $? -ne 0 ];
then
  echo "*** Gulp install failed"
  exit 1
fi
echo "*** Gulp install complete"

echo "*** installing Gulp and plugins locally..."
npm install --save-dev gulp gulp-jshint jshint-stylish gulp-concat gulp-uglify gulp-sass gulp-sourcemaps gulp-rename gulp-changed del gulp-zip merge-stream gulp-minify-html gulp-json-transform gulp-native2ascii
if [ $? -ne 0 ];
then
  echo "*** gulp/plugins install failed"
  exit 1
fi

echo "*** setup complete"
