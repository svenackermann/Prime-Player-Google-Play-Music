/**
 * Google Analytics code.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global ga, chrome */
/* exported initGA */

function initGA(settings, context, initDimensions, initMetrics) {
  /** send an event to Google Analytics, if enabled */
  function event(category, eventName) {
    if (settings.gaEnabled) ga("send", "event", category, eventName);
  }

  /** send a pageview to Google Analytics, if enabled */
  function pageview(title) {
    if (settings.gaEnabled) {
      ga("set", "title", title);
      ga("send", "pageview");
    }
  }

  /** send a social interaction to Google Analytics, if enabled */
  function social(network, action, target) {
    if (settings.gaEnabled) ga("send", "social", network, action, target);
  }

  function setOptions(prefix, startIndex, options) {
    if (settings.gaEnabled && options) {
      options.forEach(function(opt, i) {
        ga("set", prefix + (i + startIndex), opt);
      });
    }
  }

  var setDimensions = setOptions.bind(window, "dimension", 2);

  var setMetrics = setOptions.bind(window, "metric", 1);

  function gaEnabledChanged(val) {
    if (val) {
      settings.rl("gaEnabled", gaEnabledChanged, context);//init only once
      // jscs:disable
      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');//jshint ignore:line
      // jscs:enable
      ga("create", "UA-41499181-3", "auto");
      ga("set", {
        checkProtocolTask: function() {},
        dimension1: chrome.runtime.getManifest().version,
        page: "/primeplayer/" + context
      });
      setDimensions(initDimensions);
      setMetrics(initMetrics);
      pageview(context);
    }
  }

  settings.w("gaEnabled", gaEnabledChanged, context);

  return {
    event: event,
    pageview: pageview,
    social: social,
    setDimensions: setDimensions,
    setMetrics: setMetrics
  };
}
