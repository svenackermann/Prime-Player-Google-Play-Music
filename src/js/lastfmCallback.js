/**
 * This script just adds text to HTML template.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */

chrome.runtime.getBackgroundPage(function(bp) {
  var token;
  if (bp.localSettings.lastfmSessionName === null && (token = bp.extractUrlParam("token", location.search))) bp.getLastfmSession(token);
});
