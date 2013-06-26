/**
 * Google Analytics stuff.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
var _gaq;

function initGA(version) {
  _gaq = _gaq || [];
  _gaq.push(['_setCustomVar', 1, 'Version', version, 3]);
  _gaq.push(['_setAccount', 'UA-41499181-1'], ['_trackPageview']);

  (function() {
   var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
   ga.src = 'https://ssl.google-analytics.com/ga.js';
   var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();
}
