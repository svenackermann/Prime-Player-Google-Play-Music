/**
 * Functions to handle lyrics.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome, fixForUri */
/* exported initLyricsProviders */
/* jshint jquery: true */

function initLyricsProviders(GA) {
  var chromePermissions = chrome.permissions;

  function cleanAndParse(data) {
    //remove images to avoid them to be loaded
    var parsed = $(data.replace(/<img[^>]*>/gi, ""));
    parsed = parsed.not("script");//remove top level scripts
    parsed.find("script").remove();//remove other scripts
    return parsed;
  }

  function fixTitle(title) {
    if (title.indexOf("(") > 0) {//remove remix/version info
      title = title.replace(/\(.*\)/, "").trim();
    }
    return fixForUri(title);
  }

  var lyricsProviders = { available: [] };

  function LyricsProvider(name, homepage, searchLyrics, buildSearchUrl) {
    var permissions = { origins: [homepage + "/*"] };

    var injectScript = { file: "js/cs-" + name + ".js" };

    /** cache if we have permission */
    var hasPermission = null;

    function lyricsGaEvent(evt) {
      GA.event("Lyrics-" + name, evt);
    }

    function errorNoUrl() {
      lyricsGaEvent("Error-noURL");
    }

    function errorNoPermission() {
      lyricsGaEvent("Error-noPermission");
    }

    this.checkPermission = function(cb) {
      if (hasPermission !== null) return cb(hasPermission);
      chromePermissions.contains(permissions, function(result) {
        hasPermission = result;
        cb(result);
      });
    };

    this.checkPermission($.noop);//cache it now

    this.getUrl = function() {
      return homepage.substr(homepage.indexOf("://") + 3);
    };

    this.getHomepage = function() {
      return homepage;
    };

    this.requestPermission = function(cb) {
      chrome.permissions.request(permissions, function(granted) {
        hasPermission = granted;
        cb(granted);
      });
    };

    this.errorGetSearch = function(cb, searchSrc) {
      lyricsGaEvent("Error-GET-Search");
      cb({ error: true, searchSrc: searchSrc });
    };

    this.noResult = function(cb, searchSrc) {
      lyricsGaEvent("NoResult");
      cb({ noresults: true, searchSrc: searchSrc });
    };

    this.noLyrics = function(cb, src, searchSrc) {
      lyricsGaEvent("NoLyrics");
      cb({ noresults: true, src: src, searchSrc: searchSrc });
    };

    this.errorGetResult = function(cb, src, searchSrc) {
      lyricsGaEvent("Error-GET-Result");
      cb({ error: true, src: src, searchSrc: searchSrc });
    };

    this.foundLyrics = function(cb, title, lyrics, credits, src, searchSrc) {
      lyricsGaEvent("OK");
      cb({ title: title, lyrics: lyrics, credits: credits && credits.length ? credits : null, src: src, searchSrc: searchSrc });
    };

    /**
     * Get lyrics for a song.
     * The callback gets an object with either:
     * - 'title' (jQuery h1 containing the song title), 'lyrics' (jQuery div containing the lyrics), 'credits' (jQuery element containing the credits or null)
     * - 'noresults' set to true
     * - 'error' set to true
     * In addition the following attributes might be provided:
     * - 'src': the URL to the song lyrics page
     * - 'searchSrc': the URL to the search results page
     */
    this.fetchLyrics = function(song, cb) {
      if (!hasPermission) {
        errorNoPermission();
        cb({ error: true });
        return;
      }
      var searchUrl = buildSearchUrl.call(this, song);
      if (searchUrl) {
        searchLyrics(cb, searchUrl, this);
      } else {
        errorNoUrl();
        cb({ error: true });
      }
    };

    this.openLyrics = function(song, chromeTabs, cb, tabId) {
      if (!hasPermission) {
        errorNoPermission();
        cb(false, tabId);
        return;
      }
      var searchUrl = buildSearchUrl.call(this, song);

      function tabReadyCallback(tab) {
        var executed = false;
        function executeScript(theTabId, changeInfo) {
          if (theTabId == tab.id && !executed && changeInfo.status == "complete") {
            executed = true;
            chromeTabs.onUpdated.removeListener(executeScript);
            chromeTabs.executeScript(theTabId, injectScript, function(result) {
              cb(result[0], theTabId);
            });
          }
        }
        chromeTabs.onUpdated.addListener(executeScript);
        executeScript(tab.id, { status: tab.status });
      }

      if (searchUrl) {
        if (tabId) {
          chromeTabs.update(tabId, { url: searchUrl }, tabReadyCallback);
          lyricsGaEvent("Update");
        } else {
          chromeTabs.create({ url: searchUrl }, tabReadyCallback);
          lyricsGaEvent("Open");
        }
      } else {
        errorNoUrl();
        cb(false, tabId);
      }
    };

    lyricsProviders[name] = this;
    lyricsProviders.available.push(name);
  }

  new LyricsProvider("musixmatch", "https://www.musixmatch.com", function(cb, searchUrl, report) {
    $.get(searchUrl).done(function(resultPage) {
      var body = cleanAndParse(resultPage).find(".media-card-body").filter(function() { return !$(".add-lyrics-button", this).length; });
      var href = body.find("a.title").attr("href");
      if (href) {
        href = report.getHomepage() + href;
        $.get(href)
          .done(function(lyricsPage) {
            var page = cleanAndParse(lyricsPage);
            var lyrics = page.find(".mxm-lyrics__content");
            var trimmedLyrics = lyrics.text().trim();
            if (!trimmedLyrics.length) {
              report.noLyrics(cb, href, searchUrl);
            } else {
              lyrics = $("<div>").html(trimmedLyrics.replace(/\n/g, "<br>"));
              var credits = $.trim(page.find(".mxm-lyrics__copyright").text());
              if (credits) credits = $("<div>").html(credits);
              else credits = null;
              var title = $.trim(page.find(".mxm-track-title__track").first().text());
              var artist = $.trim(page.find(".mxm-track-title__artist").first().text());
              if (artist) title = artist + " - " + title;
              report.foundLyrics(cb, $("<h1>").text(title), lyrics, credits, href, searchUrl);
            }
          })
          .fail(function() {
            report.errorGetResult(cb, href, searchUrl);
          });
      } else report.noResult(cb, searchUrl);
    }).fail(function() {
      report.errorGetSearch(cb, searchUrl);
    });
  }, function(song) {
    if (!song.artist || !song.title) return null;
    return this.getHomepage() + "/search/" + fixForUri(song.artist) + "+" + fixTitle(song.title) + "/tracks";
  });

  new LyricsProvider("lyricswikia", "http://lyrics.wikia.com", function(cb, searchUrl, report) {
    $.getJSON(searchUrl, "fmt=realjson").done(function(result) {
      if (result.url && result.lyrics && $.trim(result.lyrics) != "Not found") {
        $.get(result.url)
          .done(function(lyricsPage) {
            var page = cleanAndParse(lyricsPage);
            var lyrics = page.find(".lyricbox");
            var trimmedLyrics = lyrics.text().trim();
            if (!trimmedLyrics.length) {
              report.noLyrics(cb, result.url, searchUrl);
            } else {
              var credits = page.find(".song-credit-box");
              if (credits.length) {
                var parsed = $("<p>");
                credits.find("tr").each(function() {
                  parsed.append($(this).text(), "<br>");
                });
                if (parsed.children().length) {
                  parsed.find("br").last().remove();
                  credits = parsed;
                }
              }
              report.foundLyrics(cb, page.find("#WikiaPageHeader h1"), lyrics, credits, result.url, searchUrl);
            }
          })
          .fail(function() {
            report.errorGetResult(cb, result.url, searchUrl);
          });
      } else report.noResult(cb, searchUrl);
    }).fail(function() {
      report.errorGetSearch(cb, searchUrl);
    });
  }, function(song) {
    if (!song.artist || !song.title) return null;
    return this.getHomepage() + "/api.php?func=getSong&artist=" + fixForUri(song.artist) + "&song=" + fixTitle(song.title);
  });

  new LyricsProvider("songlyrics", "http://www.songlyrics.com", function(cb, searchUrl, report) {
    $.get(searchUrl).done(function(resultPage) {
      var href = cleanAndParse(resultPage).find(".serpresult > a").attr("href");
      if (href) {
        $.get(href)
          .done(function(lyricsPage) {
            var page = cleanAndParse(lyricsPage);
            var lyrics = page.find("#songLyricsDiv");
            var trimmedLyrics = lyrics.text().trim();
            if (!trimmedLyrics.length || trimmedLyrics.indexOf("We do not have the lyrics for") === 0) {
              report.noLyrics(cb, href, searchUrl);
            } else {
              report.foundLyrics(cb, page.find(".pagetitle h1"), lyrics, page.find(".albuminfo > li > p"), href, searchUrl);
            }
          })
          .fail(function() {
            report.errorGetResult(cb, href, searchUrl);
          });
      } else report.noResult(cb, searchUrl);
    }).fail(function() {
      report.errorGetSearch(cb, searchUrl);
    });
  }, function(song) {
    var artist = "";
    var title = "";
    var search = "";
    if (song.artist) {
      artist = fixForUri(song.artist);
      search = artist;
    }
    if (song.title) {
      title = fixTitle(song.title);
      search = (search ? search + "+" : "") + title;
    }
    var searchUrl = null;
    if (search) {
      searchUrl = this.getHomepage() + "/index.php?section=search&searchW=" + search + "&submit=Search";
      if (artist) searchUrl += "&searchIn1=artist";
      if (title) searchUrl += "&searchIn3=song";
    }
    return searchUrl;
  });

  return lyricsProviders;
}
