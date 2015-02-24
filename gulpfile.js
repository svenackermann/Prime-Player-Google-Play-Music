var gulp = require("gulp");
var jshint = require("gulp-jshint");
var concat = require("gulp-concat");
var uglify = require("gulp-uglify");
var sass = require("gulp-sass");
var sourcemaps = require("gulp-sourcemaps");
var changed = require("gulp-changed");
var del = require("del");
var rename = require("gulp-rename");
var zip = require("gulp-zip");
var merge = require("merge-stream");
var htmlminify = require("gulp-minify-html");
var jsonedit = require("gulp-json-transform");
var n2a = require("gulp-native2ascii");
var runSequence = require('run-sequence');
var gulpif = require("gulp-if");
var argv = require("yargs").argv;
var develop = true;
var full = argv.full;

var paths = {
  js_bp: ["src/js/md5.min.js", "src/js/lastfm.api.js", "src/js/beans.js", "src/js/lyrics.js", "src/js/bp.js"],
  js_single: ["src/js/cs.js", "src/js/cs-*.js", "src/js/injected.js", "src/js/options.js", "src/js/player.js", "src/js/updateNotifier.js"],
  scss: ["src/css/*.scss", "!src/css/layouts.scss"],
  scss_all: "src/css/*.*",
  other: ["src/img/**/*.*", "src/**/*.json", "src/**/*.html", "src/js/jquery-2.0.2.min.js"],
  dest: "build/",
  dest_js: "build/js/",
  dest_css: "build/css/",
  src: "src"
};

function myUglify() { return gulpif(!full, uglify({ preserveComments: "some", compress: { drop_console: !develop } })); }

gulp.task("jshint", function() {
  return gulp.src(["src/js/*.js", "!src/js/*.min.js"])
    .pipe(jshint({ undef: true, browser: true, jquery: true, unused: true, devel: true, bitwise: true, quotmark: "double" }))
    .pipe(jshint.reporter("jshint-stylish"))
    .pipe(jshint.reporter("fail"));
});

gulp.task("clean", function(cb) {
  del(["build", "PrimePlayer.zip"], cb);
});

gulp.task("compile-js-bp", function() {
  return gulp.src(paths.js_bp)
    .pipe(gulpif(develop && !full, sourcemaps.init()))
    .pipe(concat("bp.js"))
    .pipe(myUglify())
    .pipe(gulpif(develop && !full, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest_js));
});

gulp.task("compile-js-single", function() {
  return gulp.src(paths.js_single)
    .pipe(changed(paths.dest))
    .pipe(gulpif(develop && !full, sourcemaps.init()))
    .pipe(myUglify())
    .pipe(gulpif(develop && !full, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest_js));
});

gulp.task("compile-css", function () {
  return gulp.src(paths.scss)
    .pipe(gulpif(develop, sourcemaps.init()))
    .pipe(sass({outputStyle: "compressed"}))
    .pipe(gulpif(develop, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest_css));
});

gulp.task("copy-other", function () {
  return gulp.src(paths.other, { base: paths.src })
    .pipe(changed(paths.dest))
    .pipe(gulp.dest(paths.dest));
});

gulp.task("build", ["compile-js-bp", "compile-js-single", "compile-css", "copy-other"], function(cb) { cb(); });

gulp.task("watch", function() {
  gulp.watch(paths.js_bp, ["compile-js-bp"]);
  gulp.watch(paths.js_single, ["compile-js-single"]);
  gulp.watch(paths.scss_all, ["compile-css"]);
  gulp.watch(paths.other, ["copy-other"]);
});

gulp.task("zip", function() {
  //remove descriptions and examples
  var json_locale = gulp.src("build/_locales/**/messages.json", { base: "build" })
    .pipe(jsonedit(function(json) {
      function replacer(key, value) {
        if (typeof value === "string" && (key == "description" || key == "example")) return undefined;
        return value;
      }
      return JSON.stringify(json, replacer);
    }))
    .pipe(n2a({ reverse: false }));

  var json_manifest = gulp.src("build/manifest.json")
    .pipe(jsonedit(function(json) {
      if (!develop) {
        //remove *.map from web_accessible_resources
        var war = json.web_accessible_resources;
        for (var i = 0; i < war.length;) {
          if (war[i].search(/\.map\b/) > 0) war.splice(i, 1);
          else i++;
        }
      }
      return json;
    }))
    .pipe(n2a({ reverse: false }));

  var html = gulp.src("build/**/*.html", { base: "build" })
    .pipe(htmlminify({ empty: true }));

  var rest = gulp.src(["build/**", "!**/*.json", "!**/*.html"]);

  return merge(json_locale, json_manifest, html, rest)
    .pipe(zip("PrimePlayer.zip"))
    .pipe(gulp.dest("./"));
});

gulp.task("release", ["clean"], function(cb) {
  develop = false;
  runSequence("jshint", "build", "zip", cb);
});

gulp.task("default", ["build", "watch"]);
