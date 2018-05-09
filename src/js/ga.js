/**
 * Google Analytics code.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* exported initGA */
/*jshint unused:false */
function initGA(settings, context, initDimensions, initMetrics) {
  /** send an event to Google Analytics, if enabled */
  function event(category, eventName) {
    // disabled because of DSGVO
  }

  /** send a pageview to Google Analytics, if enabled */
  function pageview(title) {
    // disabled because of DSGVO
  }

  /** send a social interaction to Google Analytics, if enabled */
  function social(network, action, target) {
    // disabled because of DSGVO
  }

  function setOptions(prefix, startIndex, options) {
    // disabled because of DSGVO
  }

  var setDimensions = setOptions.bind(window, "dimension", 2);

  var setMetrics = setOptions.bind(window, "metric", 1);

  return {
    event: event,
    pageview: pageview,
    social: social,
    setDimensions: setDimensions,
    setMetrics: setMetrics
  };
}
