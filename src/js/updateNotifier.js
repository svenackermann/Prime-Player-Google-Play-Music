/**
 * This script just adds text to HTML template.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {
  $(function() {
    var i18n = chrome.i18n.getMessage;
    $("h1").text(i18n("updateNotifierTitle")).after(i18n("updateNotifierText"));
    $("body").click(bp.openOptions).click(window.close);
    bp.updateNotifierDone();
  });
});
