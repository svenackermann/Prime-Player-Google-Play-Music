/**
 * Content script for lyrics.wikia.com.
 * Will only be injected in tabs opened by the extension to automatically open the first search result.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
(function() {
  var pre = document.getElementsByTagName("pre")[0];
  if (!pre || !pre.textContent || pre.textContent.trim() == "Not found") return false;
  
  var ul = document.getElementsByTagName("ul")[0];
  if (ul) {
    var link = ul.getElementsByTagName("a")[0];
    if (link) {
      document.location.href = link.href;
      return true;
    }
  }
  return false;
})();
