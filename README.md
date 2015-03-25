# Prime Player for Google Play Music

[![Build Status](https://travis-ci.org/svenackermann/Prime-Player-Google-Play-Music.svg?branch=develop)](https://travis-ci.org/svenackermann/Prime-Player-Google-Play-Music)
[![devDependency Status](https://david-dm.org/svenackermann/Prime-Player-Google-Play-Music/develop/dev-status.svg)](https://david-dm.org/svenackermann/Prime-Player-Google-Play-Music/develop#info=devDependencies)

### Description

This is the repository for the Chrome extension for Google Play Music.
It is based on ideas of the extension "Better Music For Google Music".

Features include:

* last.fm integration (now playing, scrobbling, like/unlike)
* a powerful miniplayer with different layouts and color schemes
* toast notifications
* support for thumbs and 5-star ratings
* and more

You can install it from [here] (https://chrome.google.com/webstore/detail/prime-player-for-google-p/npngaakpdgeaajbnidkkginekmnaejbi).

### Notes for contributers

If you find any bugs or would like to see new features, please file an issue here on GitHub or - even better - send a pull request.

Please use the "develop" branch for contributing, as I use [git-flow](http://nvie.com/posts/a-successful-git-branching-model/)
(I know, that's pushing it a bit, but I try to learn sth. on developing this).

You'll need [Gulp](http://gulpjs.com/) for development. Make sure you have [node.js](http://nodejs.org/) installed, then just run `npm i` from the project root directory to install Gulp and all required plugins.
Afterwards you can execute `gulp` from the project root directory to let Gulp watch for changes and automatically recompile artifacts (CSS/JS/...) as needed.
