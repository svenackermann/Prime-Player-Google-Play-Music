/**
 * This script just adds text to HTML template.
 * @author Sven Ackermann (svenrecknagel@googlemail.com)
 * @license BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {
  $(function() {
    $("h1").text(chrome.i18n.getMessage("updateNotifierTitle")).after(chrome.i18n.getMessage("updateNotifierText"));
    $("body").click(bp.openOptions).click(window.close);
    bp.updateNotifierDone();
  });
});
