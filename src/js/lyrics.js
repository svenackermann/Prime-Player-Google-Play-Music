/**
 * Functions to handle lyrics.
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
/** @return an URL to songlyrics.com for the song or null if too little information */
function buildLyricsSearchUrl(song) {
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
}

/**
 * Get lyrics for a song from songlyrics.com.
 * The callback gets an object with either:
 * - 'title' (jQuery h1 containing the song title), 'lyrics' (jQuery div containing the lyrics), 'credits' (jQuery p containing the credits or null)
 * - 'noresults' set to true
 * - 'error' set to true
 * In addition the following attributes might be provided:
 * - 'src': the URL to the song lyrics page
 * - 'searchSrc': the URL to the search results page
 */
function fetchLyrics(song, cb) {
  var url = buildLyricsSearchUrl(song);
  if (url) {
    $.get(url)
      .done(function(data) {
        var href = $(data).find(".serpresult > a").attr("href");
        if (href) {
          $.get(href)
            .done(function(data) {
              var page = $(data);
              var lyrics = page.find("#songLyricsDiv");
              var trimmedLyrics = lyrics.text().trim();
              if (trimmedLyrics.length === 0 || trimmedLyrics.indexOf("We do not have the lyrics for") === 0) {
                gaEvent("Lyrics", "NoLyrics");
                cb({noresults: true, src: href, searchSrc: url});
              } else {
                var credits = page.find(".albuminfo > li > p");
                if (credits.length === 0) credits = null;
                gaEvent("Lyrics", "OK");
                cb({title: page.find(".pagetitle h1"), lyrics: lyrics, credits: credits, src: href, searchSrc: url});
              }
            })
            .fail(function() {
              gaEvent("Lyrics", "Error-GET-Result");
              cb({error: true, src: href, searchSrc: url});
            });
        } else {
          gaEvent("Lyrics", "NoResult");
          cb({noresults: true, searchSrc: url});
        }
      })
      .fail(function() {
        gaEvent("Lyrics", "Error-GET-Search");
        cb({error: true, searchSrc: url});
      });
  } else {
    gaEvent("Lyrics", "Error-noURL");
    cb({error: true});
  }
}
