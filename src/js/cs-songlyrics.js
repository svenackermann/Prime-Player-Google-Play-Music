/**
 * Content script for songlyrics.com.
 * Will only be injected in tabs opened by the extension to automatically open the first search result.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
(function() {
  var link = document.querySelector(".serpresult a");
  if (link) {
    document.location.href = link.href;
    return true;
  }
  return false;
})();
