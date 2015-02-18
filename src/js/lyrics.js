/**
 * Functions to handle lyrics.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global gaEvent */
/* exported lyricsProviders */

(function(exports) {

  function cleanAndParse(data) {
    //remove images to avoid them to be loaded
    var parsed = $(data.replace(/<img[^>]*>/gi, ""));
    parsed = parsed.not("script");//remove top level scripts
    parsed.find("script").remove();//remove other scripts
    return parsed;
  }
  
  exports.lyricsProviders = {};
  
  function LyricsProvider(name, searchLyrics) {
    
    exports.lyricsProviders[name] = this;
    
    /** @return an URL to the search page for the song or null if too little information, takes a song as parameter */
    this.buildSearchUrl = function() {
      return null;
    };
    
    this.opened = function() {
      gaEvent("Lyrics-" + name, "Open");
    };
    
    this.errorNoUrl = function() {
      gaEvent("Lyrics-" + name, "Error-noURL");
    };
    
    this.errorGetSearch = function(cb, searchSrc) {
      gaEvent("Lyrics-" + name, "Error-GET-Search");
      cb({ error: true, searchSrc: searchSrc });
    };
    
    this.noResult = function(cb, searchSrc) {
      gaEvent("Lyrics-" + name, "NoResult");
      cb({ noresults: true, searchSrc: searchSrc });
    };
    
    this.noLyrics = function(cb, src, searchSrc) {
      gaEvent("Lyrics-" + name, "NoLyrics");
      cb({ noresults: true, src: src, searchSrc: searchSrc });
    };
    
    this.errorGetResult = function(cb, src, searchSrc) {
      gaEvent("Lyrics-" + name, "Error-GET-Result");
      cb({ error: true, src: src, searchSrc: searchSrc });
    };
    
    this.foundLyrics = function(cb, title, lyrics, credits, src, searchSrc) {
      gaEvent("Lyrics-" + name, "OK");
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
      var searchUrl = this.buildSearchUrl(song);
      if (searchUrl) {
        searchLyrics(cb, searchUrl, this);
      } else {
        this.errorNoUrl();
        cb({ error: true });
      }
    };
    
    this.getInjectScript = function() {
      return { file: "js/cs-" + name + ".js", runAt: "document_end" };
    };
  }
  
  var providerSongLyrics = new LyricsProvider("songlyrics", function(cb, searchUrl, report) {
    $.get(searchUrl)
      .done(function(resultPage) {
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
      })
      .fail(function() {
        report.errorGetSearch(cb, searchUrl);
      });
  });
  
  providerSongLyrics.buildSearchUrl = function(song) {
    var artist = "";
    var title = "";
    var search = "";
    if (song.artist) {
      artist = encodeURIComponent(song.artist).replace(/%20/g, "+");
      search = artist;
    }
    if (song.title) {
      title = song.title;
      if (title.indexOf("(") > 0) {//remove remix/version info
        title = title.replace(/\(.*\)/, "").trim();
      }
      title = encodeURIComponent(title).replace(/%20/g, "+");
      search = (search ? search + "+" : "") + title;
    }
    var url = null;
    if (search) {
      url = "http://www.songlyrics.com/index.php?section=search&searchW=" + search + "&submit=Search";
      if (artist) url += "&searchIn1=artist";
      if (title) url += "&searchIn3=song";
    }
    return url;
  };
  
  var providerLyricsWikia = new LyricsProvider("lyricswikia", function(cb, searchUrl, report) {
    $.getJSON(searchUrl, "fmt=realjson")
      .done(function(result) {
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
      })
      .fail(function() {
        report.errorGetSearch(cb, searchUrl);
      });
  });
  
  providerLyricsWikia.buildSearchUrl = function(song) {
    if (!song.artist || !song.title) return null;
    var artist = encodeURIComponent(song.artist).replace(/%20/g, "+");
    var title = song.title;
    if (title.indexOf("(") > 0) {//remove remix/version info
      title = title.replace(/\(.*\)/, "").trim();
    }
    title = encodeURIComponent(title).replace(/%20/g, "+");
    return "http://lyrics.wikia.com/api.php?artist=" + artist + "&song=" + title;
  };
})(this);
