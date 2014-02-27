/**
 * This script just adds text to HTML template.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {
  $(function() {
    $("h1").text(chrome.i18n.getMessage("updateNotifierTitle"))
    .after(chrome.i18n.getMessage("updateNotifierText"));
    $("body").click(bp.openOptions).click(window.close);
    bp.updateNotifierDone();
  });
});
