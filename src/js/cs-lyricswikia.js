/**
 * Content script for lyrics.wikia.com.
 * Will only be injected in tabs opened by the extension to automatically open the first search result.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
(function() {
  var pre = document.querySelector("pre");
  if (!pre || !pre.textContent || pre.textContent.trim() == "Not found") return false;

  var link = document.querySelector("ul a");
  if (link) {
    document.location.href = link.href;
    return true;
  }
  return false;
})();
