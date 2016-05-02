/**
 * Content script for songlyrics.com.
 * Will only be injected in tabs opened by the extension to automatically open the first search result.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
(function() {
  var link;
  [].some.call(document.querySelectorAll(".media-card-body"), function(body) {
    var lyricsExist = !body.querySelector(".add-lyrics-button");
    if (lyricsExist) link = body.querySelector(".title");
    return lyricsExist;
  });

  if (link && link.href) {
    document.location.href = link.href;
    return true;
  }
  return false;
})();
