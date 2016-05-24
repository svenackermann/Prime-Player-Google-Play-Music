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

### Adding a setting to the options page
These are the steps if you add sth. that should be configurable with an option:

1. In ```bp.js``` add a property with its default value (e.g. ```myNewSetting: false```) to ```settings``` (or ```localSettings``` if it's not intended to be synchronized with Chrome sync). Take care that you add it at the position corresponding to the position where you'd like it on the options page. Because of the large number of options I need some order here.
2. In ```options.html``` add an element to edit the setting at the desired position  (e.g. ```<pp-toggle id="myNewSetting"></pp-toggle>``` for a toggle button). Its ```id``` must be the name of the setting. The version and mode filter classes (e.g. ```v-3.8 adv```) will be added by me later. For local settings (see above) the attribute ```local``` must be added. The type of element should be:
  * ```<pp-toggle>``` for boolean properties.
  * ```<pp-input>``` for number properties, minimum/maximum allowed values can be provided with ```min```/```max``` attributes.
  * ```<pp-select>``` for enum properties (i.e. type string/number with predefined values), possible values can be defined with attribute ```options``` (comma-separated). If an option needs a special CSS class added (e.g. to conditionally hide the option), you can add a colon and the class after the value (e.g. ```options="option1,option2:myCssClass,option3"```). If it's a numeric value, ```type="number"``` must be added to ensure correct conversion. You can also provide a custom function to determine the labels for the options with ```getoptionstext="myCustomFunction"``` if you need more control than described below (that function must be added to the ```optionsTextGetter``` object in function ```initInputs()``` in options.js).
  * Other rare cases are color inputs (```<pp-input type="color">```) and select inputs that have their values copied from another select (```<pp-select from="anotherSelector">```). See ```options.html``` and code in ```options.js``` for examples.
  * If the setting needs detailed explanation with a hint (green question mark icon), attribute ```hint``` must be added and additional texts provided (see below).
3. Add texts to the resource bundles (```_locales/*/messages.json```) (at least English is required):
  * The label for the option has key "setting_" followed by the name of the setting (e.g. "setting_myNewSetting").
  * If the setting has a hint, the same key with suffix "Hint" is used for that (e.g. "setting_myNewSettingHint").
  * For enum properties, the options labels have the same key with suffix "_(option)" (e.g. "setting_myNewSetting_option1"; if you provided a custom function with ```getoptionstext```, you don't need that).
4. Use the new setting (```bp.settings.myNewSetting```) wherever you need it and register listeners as described below.

### Using settings for control
You can use the ```settings```, ```localSettings```, ```song``` and ```player``` objects from the background page to react on current state of user settings, the current song and the Google player.

You can access the current value like with a normal object (e.g. ```if (settings.myNewSetting) ...```). Note that this value is actually hidden behind a Javascript get property. If you set the value, all registered listeners will be notified if and only if it really changed (so setting the same value multiple times will only trigger one notification).

To register or remove a listener you have the following functions:
* ```al```: add a listener function
* ```rl```: remove a listener function
* ```arl```: add or remove a listener function (depending on value of the ```add``` attribute)
* ```ral```: remove all listeners for a given source (e.g. the miniplayer)
* ```w```: add a watcher function, that is the same as ```al```, except that the listener will be called immediately with the current value for old and new value, this is useful for initialisation
* ```wrl```: same as ```arl```, except that the listener will be called immediately if the ```add``` attribute is ```true```

You e.g. call ```settings.al("myNewSetting", myListener)```. The listener function will be called with 3 arguments: The new value, the old value and the name of the property that changed. Just look at the existing examples in the code.

If you add a listener to the miniplayer (in ```player.js```) or options page (in ```options.js```), be sure to provide the ```src``` attribute (either ```typeClass``` or ```CONTEXT```). This is needed for the listener to be removed when the miniplayer/popup/toast/page closes (```ral``` is called on unload for that).

For more details see ```beans.js```.

### Adding a lyrics provider
If you want to add a new provider, you basically need the following steps. For details see the existing implementations.

1. In ```manifest.json``` add an optional permission for the providers URL.
2. In ```lyrics.js``` implement a new ```LyricsProvider``` object to search/load/parse the lyrics from the page via AJAX.
3. Add a file ```cs-myProvider.js``` to be used as content script on the provider page if the user decides to open the lyrics on the page directly.
4. Add a new ```div``` below the other providers in ```options.html``` to make it available to the user.
