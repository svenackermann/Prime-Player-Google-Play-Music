/**
 * Functions to handle lyrics.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
function fetchLyrics(songInfo, callback) {
  var artist = "";
  var title = "";
  var search = "";
  if (songInfo.artist) {
    artist = encodeURIComponent(songInfo.artist).replace(/%20/g, "+");
    search = artist;
  }
  if (songInfo.title) {
    title = songInfo.title;
    if (title.indexOf("(") > 0) {//remove remix/version info
      title = title.replace(/\(.*\)/, "").trim();
    }
    title = encodeURIComponent(title).replace(/%20/g, "+");
    search = (search ? search + "+" : "") + title;
  }
  if (search) {
    var url = "http://www.songlyrics.com/index.php?section=search&searchW=" + search + "&submit=Search";
    if (artist) url += "&searchIn1=artist";
    if (title) url += "&searchIn3=song";
    console.debug(url);
    $.get(url)
      .done(function(data) {
        var href = $(data).find(".serpresult > a").attr("href");
        console.debug(href);
        if (href) {
          $.get(href)
            .done(function(data) {
              var page = $(data);
              var lyrics = page.find("#songLyricsDiv");
              if (lyrics.text().trim().indexOf("We do not have the lyrics for") == 0) callback({noresults: true})
              else {
                var credits = page.find(".albuminfo > li > p");
                if (credits.length == 0) credits = null;
                callback({title: page.find(".pagetitle h1"), lyrics: lyrics, credits: credits, src: href, searchSrc: url});
              }
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
              console.error(textStatus, errorThrown);
              callback({error: true});
            });
        } else {
          callback({noresults: true});
        }
      })
      .fail(function(jqXHR, textStatus, errorThrown) {
        console.error(textStatus, errorThrown);
        callback({error: true});
      });
  } else {
    callback({noresults: true});
  }
}