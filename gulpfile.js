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
var develop = true;

var paths = {
  js_bp: ["src/js/md5-min.src.js", "src/js/lastfm.api.src.js", "src/js/beans.src.js", "src/js/lyrics.src.js", "src/js/bp.src.js"],
  js_single: ["src/js/cs.src.js", "src/js/cs-songlyrics.src.js", "src/js/injected.src.js", "src/js/options.src.js", "src/js/player.src.js", "src/js/updateNotifier.src.js"],
  scss: ["src/css/*.scss", "!src/css/layouts.scss"],
  scss_all: "src/css/*.*",
  other: ["src/**/*.*", "!src/css/*.*", "!src/js/*.src.js"],
  dest: "build/"
};

function myUglify() { return uglify({ preserveComments: "some", compress: { drop_console: !develop } }); }

gulp.task("jshint", function() {
  return gulp.src(["src/js/*.src.js", "!src/js/md5-min.src.js"])
    .pipe(jshint())
    .pipe(jshint.reporter("jshint-stylish"))
    .pipe(jshint.reporter("fail"));
});

gulp.task("clean", function(cb) {
  del(["build", "PrimePlayer.zip"], cb);
});

gulp.task("compile-js-bp", function() {
  return gulp.src(paths.js_bp)
    .pipe(gulpif(develop, sourcemaps.init()))
    .pipe(concat("js/bp.js"))
    .pipe(myUglify())
    .pipe(gulpif(develop, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest));
});

gulp.task("compile-js-single", function() {
  /*return gulp.src(paths.js_single, { base: "src" })
    .pipe(rename({suffix: ".min"}))//TODO
    .pipe(changed(paths.dest, { extension: ".min.js" }))//TODO
    .pipe(gulpif(develop, sourcemaps.init()))
    .pipe(myUglify())
    .pipe(gulpif(develop, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest));*/
  //workaround for https://github.com/terinjokes/gulp-uglify/issues/56
  var merged = merge();
  paths.js_single.forEach(function(el) {
    var name = "js/" + el.substring(el.lastIndexOf("/") + 1, el.lastIndexOf(".src.js")) + ".js";
    merged.add(gulp.src(el)
      .pipe(rename(name))
      .pipe(changed(paths.dest))
      .pipe(gulpif(develop, sourcemaps.init()))
      .pipe(concat(name))
      .pipe(myUglify())
      .pipe(gulpif(develop, sourcemaps.write("./")))
    );
  });
  return merged.pipe(gulp.dest(paths.dest));;
});

gulp.task("compile-css", function () {
  return gulp.src(paths.scss, { base: "src" })
    .pipe(gulpif(develop, sourcemaps.init()))
    .pipe(sass({outputStyle: "compressed"}))
    .pipe(gulpif(develop, sourcemaps.write("./")))
    .pipe(gulp.dest(paths.dest));
});

gulp.task("copy-other", function () {
  return gulp.src(paths.other, { base: "src" })
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
