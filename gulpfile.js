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
var imagemin = require("gulp-imagemin");
var runSequence = require('run-sequence');

var paths = {
  js_bp: ["PrimePlayer/js/lastfm.api.js", "PrimePlayer/js/beans.js", "PrimePlayer/js/lyrics.js", "PrimePlayer/js/bp.js"],
  js_single: ["PrimePlayer/js/cs.js", "PrimePlayer/js/cs-songlyrics.js", "PrimePlayer/js/injected.js", "PrimePlayer/js/options.js", "PrimePlayer/js/player.js", "PrimePlayer/js/updateNotifier.js"],
  scss: ["PrimePlayer/css/player.scss", "PrimePlayer/css/gpm.scss", "PrimePlayer/css/options.scss", "PrimePlayer/css/updateNotifier.scss"],
  scss_all: "PrimePlayer/css/*.scss",
  dest: {
    js: "PrimePlayer/js/",
    css: "PrimePlayer/css/"
  }
};
paths.js_custom = paths.js_bp.concat(paths.js_single);

function myUglify() { return uglify({ preserveComments: "some" }); }

gulp.task("jshint", function() {
  return gulp.src(paths.js_custom)
    .pipe(jshint())
    .pipe(jshint.reporter("jshint-stylish"))
    .pipe(jshint.reporter("fail"));
});

gulp.task("clean", function(cb) {
  var outputs = ["PrimePlayer.zip", "**/*.css", "**/*.map", "PrimePlayer/js/bp.min.js"];
  paths.js_single.forEach(function(el) { outputs.push(el.replace(/\.js\b/, ".min.js")); });
  del(outputs, cb);
});

gulp.task("compile-js-bp", function() {
  return gulp.src(paths.js_bp)
    .pipe(sourcemaps.init())
    .pipe(concat("bp.min.js"))
    .pipe(myUglify())
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(paths.dest.js));
});

gulp.task("compile-js-single", function() {
  /*return gulp.src(paths.js_single)
    .pipe(rename({suffix: ".min"}))
    .pipe(changed(paths.dest.js, { extension: ".min.js" }))
    .pipe(sourcemaps.init())
    .pipe(myUglify())
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(paths.dest.js));*/
  //workaround for https://github.com/terinjokes/gulp-uglify/issues/56
  var merged = merge();
  paths.js_single.forEach(function(el) {
    merged.add(gulp.src(el)
      .pipe(changed(paths.dest.js, { extension: ".min.js" }))
      .pipe(sourcemaps.init())
      .pipe(concat(el.substring(el.lastIndexOf("/") + 1, el.lastIndexOf(".js")) + ".min.js"))
      .pipe(myUglify())
      .pipe(sourcemaps.write("./"))
    );
  });
  return merged.pipe(gulp.dest(paths.dest.js));;
});

gulp.task("compile-css", function () {
  return gulp.src(paths.scss)
    .pipe(sourcemaps.init())
    .pipe(sass({outputStyle: "compressed"}))
    .pipe(sourcemaps.write("./"))
    .pipe(gulp.dest(paths.dest.css));
});

gulp.task("build", ["compile-js-bp", "compile-js-single", "compile-css"], function(cb) { cb(); });

gulp.task("watch", function() {
  gulp.watch(paths.js_bp, ["compile-js-bp"]);
  gulp.watch(paths.js_single, ["compile-js-single"]);
  gulp.watch(paths.scss_all, ["compile-css"]);
});

gulp.task("zip", function() {
  //remove descriptions and examples
  var json_locale = gulp.src(["PrimePlayer/_locales/**/messages.json"], { base: "PrimePlayer" })
    .pipe(jsonedit(function(json) {
      function replacer(key, value) {
        if (typeof value === "string" && (key == "description" || key == "example")) return undefined;
        return value;
      }
      return JSON.stringify(json, replacer);
    }))
    .pipe(n2a({ reverse: false }));
  
  //remove *.map from web_accessible_resources
  var json_manifest = gulp.src(["PrimePlayer/manifest.json"])
    .pipe(jsonedit(function(json) {
      var war = json.web_accessible_resources;
      for (var i = 0; i < war.length;) {
        if (war[i].search(/\.map\b/) > 0) war.splice(i, 1);
        else i++;
      }
      return json;
    }))
    .pipe(n2a({ reverse: false }));
  
  var html = gulp.src(["PrimePlayer/**/*.html"])
    .pipe(htmlminify({ empty: true }));
  
  var rest = ["PrimePlayer/**", "!**/*.map", "!**/*.scss", "!**/*.json", "!**/*.html"];
  paths.js_custom.forEach(function(el) { rest.push("!" + el); });
  
  return merge(json_locale, json_manifest, html, gulp.src(rest))
    .pipe(zip("PrimePlayer.zip"))
    .pipe(gulp.dest("./"));
});

gulp.task("release", ["clean"], function(cb) {
  runSequence("jshint", "build", "zip", cb);
});

gulp.task("default", ["build", "watch"]);
