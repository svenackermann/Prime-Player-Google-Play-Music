#!/bin/bash
cd PrimePlayer/css
rm -f player.css
rm -f player.css.map
rm -f gpm.css
rm -f gpm.css.map
rm -f options.css
rm -f options.css.map
rm -f updateNotifier.css
rm -f updateNotifier.css.map
sass --sourcemap --watch player.scss:player.css gpm.scss:gpm.css options.scss:options.css updateNotifier.scss:updateNotifier.css
cd ../..
