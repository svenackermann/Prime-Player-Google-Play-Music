/*jshint node: true, devel: false, browser: false */
var gulp = require("gulp");
var jshint = require("gulp-jshint");
var jscs = require("gulp-jscs");
var jscsstylish = require("gulp-jscs-stylish");
var concat = require("gulp-concat");
var uglify = require("gulp-uglify");
var sass = require("gulp-sass");
var sourcemaps = require("gulp-sourcemaps");
var changed = require("gulp-changed");
var del = require("del");
var replace = require("gulp-replace");
var zip = require("gulp-zip");
var merge = require("merge-stream");
var htmlmin = require("gulp-htmlmin");
var jsonedit = require("gulp-json-transform");
var n2a = require("gulp-native2ascii");
var runSequence = require("run-sequence");
var gulpif = require("gulp-if");
var polybuild = require("polybuild");
var polylint = require("gulp-polylint");
var argv = require("yargs").argv;
var develop = !argv.dist;
var full = argv.full;

var PATHS = {
  JS_BP: ["src/js/md5.min.js", "src/js/lastfm.api.js", "src/js/beans.js", "src/js/lyrics.js", "src/js/bp.js"],
  JS_SINGLE: ["src/js/cs.js", "src/js/cs-*.js", "src/js/ga.js", "src/js/injected.js", "src/js/lastfmCallback.js", "src/js/options.js", "src/js/player.js", "src/js/updateNotifier.js"],
  SCSS: ["src/css/*.scss", "!src/css/layouts.scss"],
  SCSS_ALL: "src/css/*.*",
  POLYMER: "src/polymer.html",
  OTHER: ["src/img/**/*.*", "src/**/*.json", "src/**/*.html", "!src/polymer.html"],
  JQUERY: "node_modules/jquery/dist/jquery.min.js",
  JQUERY_MAP: "node_modules/jquery/dist/jquery.min.map",
  DEST: "build/",
  DEST_JS: "build/js/",
  DEST_CSS: "build/css/",
  SRC: "src"
};

function myUglify() {
  // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
  return gulpif(!full, uglify({ preserveComments: "some", compress: { drop_console: !develop } }));
  // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
}

gulp.task("style", function() {
  // gulp-jscs does not support "extract" yet, so html can't be checked, see https://github.com/jscs-dev/gulp-jscs/issues/95
  var polymer = gulp.src(PATHS.POLYMER)
    .pipe(polylint())
    .pipe(jshint.extract("always"));
  var js = gulp.src(["gulpfile.js", "src/js/*.js", "!src/js/*.min.js"]).pipe(jscs());
  return merge(polymer, js)
    .pipe(jshint())
    .on("error", function() {})
    .pipe(jscsstylish.combineWithHintResults())
    .pipe(polylint.combineWithJshintResults())
    .pipe(jshint.reporter("jshint-stylish"))
    .pipe(jshint.reporter("fail"));
});

gulp.task("clean", function(cb) {
  del(["build", "PrimePlayer.zip"]).then(function() { cb(); });
});

gulp.task("compile-js-bp", function() {
  return gulp.src(PATHS.JS_BP)
    .pipe(gulpif(develop && !full, sourcemaps.init()))
    .pipe(concat("bp.js"))
    .pipe(myUglify())
    .pipe(gulpif(develop && !full, sourcemaps.write("./")))
    .pipe(gulp.dest(PATHS.DEST_JS));
});

gulp.task("compile-js-single", function() {
  return gulp.src(PATHS.JS_SINGLE)
    .pipe(changed(PATHS.DEST))
    .pipe(gulpif(function(file) { return !develop && /.*[\/|\\]ga\.js$/.test(file.path); }, replace("UA-41499181-3", "UA-41499181-1")))
    .pipe(gulpif(develop && !full, sourcemaps.init()))
    .pipe(myUglify())
    .pipe(gulpif(develop && !full, sourcemaps.write("./")))
    .pipe(gulp.dest(PATHS.DEST_JS));
});

gulp.task("compile-css", function() {
  return gulp.src(PATHS.SCSS)
    .pipe(gulpif(develop, sourcemaps.init()))
    .pipe(sass({ outputStyle: "compressed" }).on("error", sass.logError))
    .pipe(gulpif(develop, sourcemaps.write("./")))
    .pipe(gulp.dest(PATHS.DEST_CSS));
});

gulp.task("compile-polymer", function() {
  return gulp.src(PATHS.POLYMER)
    .pipe(polybuild({ maximumCrush: !full }))
    .pipe(gulp.dest(PATHS.DEST));
});

gulp.task("copy-jquery", function() {
  var src = PATHS.JQUERY;
  if (develop) src = [src, PATHS.JQUERY_MAP];
  return gulp.src(src)
    .pipe(changed(PATHS.DEST_JS))
    .pipe(gulpif(!develop, replace(/^\/\/# sourceMappingURL=.*$/m, "")))
    .pipe(gulp.dest(PATHS.DEST_JS));
});

gulp.task("copy-other", function() {
  return gulp.src(PATHS.OTHER, { base: PATHS.SRC })
    .pipe(changed(PATHS.DEST))
    .pipe(gulp.dest(PATHS.DEST));
});

gulp.task("build", ["compile-js-bp", "compile-js-single", "compile-css", "compile-polymer", "copy-other", "copy-jquery"], function(cb) { cb(); });

gulp.task("watch", function() {
  gulp.watch(PATHS.JS_BP, ["compile-js-bp"]);
  gulp.watch(PATHS.JS_SINGLE, ["compile-js-single"]);
  gulp.watch(PATHS.SCSS_ALL, ["compile-css"]);
  gulp.watch(PATHS.POLYMER, ["compile-polymer"]);
  gulp.watch(PATHS.OTHER, ["copy-other"]);
});

gulp.task("zip", function() {
  //remove descriptions and examples
  var JSON_LOCALE = gulp.src("build/_locales/**/messages.json", { base: "build" })
    .pipe(jsonedit(function(json) {
      function replacer(key, value) {
        if (typeof value === "string" && (key == "description" || key == "example")) return undefined;
        return value;
      }
      return JSON.stringify(json, replacer);
    }))
    .pipe(n2a({ reverse: false }));

  var JSON_MANIFEST = gulp.src("build/manifest.json")
    .pipe(jsonedit(function(json) {
      if (!develop) {
        //remove *.map from web_accessible_resources
        // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
        var war = json.web_accessible_resources;
        for (var i = 0; i < war.length;) {
          if (war[i].search(/\.map\b/) > 0) war.splice(i, 1);
          else i++;
        }
        delete json.key;
        delete json.homepage_url;
        // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
      }
      return json;
    }))
    .pipe(n2a({ reverse: false }));

  var html = gulp.src("build/**/*.html", { base: "build" })
    .pipe(gulpif(!full, htmlmin({ collapseWhitespace: true })));

  var rest = gulp.src(["build/**", "!**/*.json", "!**/*.html"]);

  return merge(JSON_LOCALE, JSON_MANIFEST, html, rest)
    .pipe(zip("PrimePlayer.zip"))
    .pipe(gulp.dest("./"));
});

gulp.task("release", ["clean"], function(cb) {
  develop = false;
  runSequence("style", "build", "zip", cb);
});

gulp.task("default", ["build", "watch"]);
