# How to contribute

If you find any bugs or would like to see new features, please file an issue here on GitHub or - even better - send a pull request.

### Pull requests
Please do not use the `master` branch for contributing, as I use [git-flow](http://nvie.com/posts/a-successful-git-branching-model/)
(I know, that's pushing it a bit, but I try to learn sth. on developing this). You can use the `develop` branch or create a new feature/bugfix branch (e.g. `feature/mynewfeature`, `hotfix/myfix`).

### Setup
You'll need [Gulp](http://gulpjs.com/) for development. Make sure you have [node.js](http://nodejs.org/) installed, then just run `npm install` from the project root directory to install Gulp and all required plugins.
Afterwards you can execute `gulp` from the project root directory to let Gulp watch for changes and automatically recompile artifacts (CSS/JS/...) as needed.

Gulp builds and minifies all [SASS](http://sass-lang.com/) files, minifies JavaScript files and copies them (together with the other files in the `src` folder) to a folder `build` that you can load as unpacked extension in your Chrome browser. Do not try to load the `src` folder as unpacked extension, it won't work. Gulp also creates source maps for the minified SASS and JS files, but Chrome has sometimes problems with them. For this reason you can instead run `gulp --full` to skip the minification, so debugging might be easier.

### Code style
I use [JSCS](http://jscs.info/) and [JSHint](http://jshint.com/about/) to check that all JavaScript files comply with some basic rules and formatting. Before commiting (or sending a pull request) please check if your changes are fine by running `gulp style` from the project root directory. You can look at the files `.jscsrc` and `.jshintrc` for the configuration that is used.

There's also a `.editorconfig` file that you might use with a [plugin](http://editorconfig.org/#download) for your IDE/editor.

In general please care about the following rules:
* all (non-binary) files should be UTF-8 encoded, use LF line endings and end with an empty line
* always use proper indentation with 2 spaces, no tabs
* do not put whitespace at the end of a line
* always use double quotes for strings (this makes searching much easier)
* do not duplicate code
* images should be either PNG or GIF, do not use JPG, BMP or sth. else and minimize the file as much as possible without making it look bad
* of course do not add sth. that violates copyrights (like non-open-source code or commercial images)

### Testing
I do not use any automated tests. That would just be too hard to implement, because we would need some kind of mocked Chrome browser and also a mock of the Google Music site. We could of course use the real browser and site, but this would still be too complicated and make the tests terribly slow.

So please take care that you tested your changes manually. Don't forget that users can have many different setups because of the large number of extension options and the different kinds of Google Music accounts (with or without "All Access" or with some labs enabled).

Your changes should work in the currently stable Chrome release. If you implement sth. that needs Chrome features which are only available for the Canary/Dev/Beta build at the moment, I might accept it but will not release it yet. Instead it will be moved to some branch and maybe merged in later. In such case please also take care of the `minimum_chrome_version` property in the `manifest.json`.
