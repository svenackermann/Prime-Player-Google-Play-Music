/**
 * This script is injected directly to the Google Play Music window to run in its context.
 * Handles commands from content script.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
primePlayerExt = {
  dispatchMouseEvent : function(element, eventname) {
    var event = document.createEvent('MouseEvents');
    event.initMouseEvent(eventname, true, true, document.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, element);
    element.dispatchEvent(event);
  },
  simClick: function(element) {
    primePlayerExt.dispatchMouseEvent(element, 'click');
  },
  startPlaylist: function(plsId) {
    location.hash = '#/pl/' + encodeURIComponent(plsId);
    setTimeout(function() {
      primePlayerExt.simClick(document.getElementsByClassName('overlay-icon')[0]);
    }, 1000);
  },
  rate: function(n) {
    var lis = document.getElementById('player-right-wrapper').getElementsByClassName('rating-container')[0].getElementsByTagName('li');
    for (var i in lis) {
      if (lis[i].dataset.rating == n) {
        primePlayerExt.simClick(lis[i]);
        break;
      }
    }
  },
  cleanup: function() {
    window.removeEventListener("message", primePlayerExt.onMessage);
    delete primePlayerExt;
  },
  onMessage: function(event) {
    // We only accept messages from ourselves
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER") return;
    switch (event.data.command) {
      case "cleanup":
        primePlayerExt.cleanup();
        break;
      case "playPause":
      case "prevSong":
      case "nextSong":
      case "toggleRepeat":
      case "toggleShuffle":
        SJBpost(event.data.command);
        break;
      case "rate":
        primePlayerExt.rate(event.data.options.rating);
        break;
      case "startPlaylist":
        primePlayerExt.startPlaylist(event.data.options.plsId);
        break;
    }
  }
};

window.addEventListener("message", primePlayerExt.onMessage);
