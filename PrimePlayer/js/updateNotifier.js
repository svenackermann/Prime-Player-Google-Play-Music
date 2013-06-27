/**
 * This script just adds text to HTML template.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
$(function() {
  $("h1").text(chrome.i18n.getMessage('updateNotifierTitle'))
  .after(chrome.i18n.getMessage('updateNotifierText'));
  var bp = chrome.extension.getBackgroundPage();
  $("body").click(bp.openOptions).click(window.close);
  bp.updateNotifierDone();
});