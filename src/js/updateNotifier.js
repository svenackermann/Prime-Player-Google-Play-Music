/**
 * This script just adds text to HTML template.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */
/* jshint jquery: true */

chrome.runtime.getBackgroundPage(function(bp) {
  $(function() {
    var i18n = chrome.i18n.getMessage;
    var type = location.hash.substr(1);
    $("h1").text(i18n(type + "NotifierTitle")).after(i18n(type + "NotifierText"));
    $("body").click(bp.openOptions).click(window.close);
    bp.updateNotifierDone();
  });
});
