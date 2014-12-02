/**
 * Content script for song lyrics.
 * Will only be injected in tabs opened by the extension to automatically open the first search result.
 * @author Sven Ackermann (svenrecknagel@googlemail.com)
 * @license BSD license
 */
(function() {
  var result = document.getElementsByClassName("serpresult")[0];
  if (result) {
    var link = result.getElementsByTagName("a")[0];
    if (link) {
      document.location.href = link.href;
    }
  }
})();
