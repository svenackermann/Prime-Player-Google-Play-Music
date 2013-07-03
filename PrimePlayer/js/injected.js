/**
 * This script is injected directly to the Google Play Music window to run in its context.
 * Handles commands from content script.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
(function() {
  function dispatchMouseEvent(element, eventname, clientX, clientY) {
    var event = document.createEvent('MouseEvents');
    event.initMouseEvent(eventname, true, true, window, 1, 0, 0, clientX || 0, clientY || 0, false, false, false, false, 0, element);
    element.dispatchEvent(event);
  }
  
  function simClick(element) {
    dispatchMouseEvent(element, 'click');
  }
  
  function startPlaylist(plsId) {
    location.hash = '#/pl/' + encodeURIComponent(plsId);
    setTimeout(function() {
      simClick(document.getElementsByClassName('overlay-icon')[0]);
    }, 1000);
  }
  
  function rate(n) {
    var lis = document.getElementById('player-right-wrapper').getElementsByClassName('rating-container')[0].getElementsByTagName('li');
    for (var i in lis) {
      if (lis[i].dataset.rating == n) {
        simClick(lis[i]);
        break;
      }
    }
  }
  
  function setPosition(percent) {
    var slider = document.getElementById('slider');
    var rect = slider.getBoundingClientRect();
    dispatchMouseEvent(slider, "mousedown", rect.left + (percent * rect.width), rect.top + 1);
  }
  
  function cleanup() {
    console.debug("Cleanup injected script for Prime Player...");
    window.removeEventListener("message", onMessage);
    primePlayerExt = null;
  }
  
  function onMessage(event) {
    // We only accept messages from ourselves
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER") return;
    switch (event.data.command) {
      case "cleanup":
        cleanup();
        break;
      case "playPause":
      case "prevSong":
      case "nextSong":
      case "toggleRepeat":
      case "toggleShuffle":
        SJBpost(event.data.command);
        break;
      case "rate":
        rate(event.data.options.rating);
        break;
      case "startPlaylist":
        startPlaylist(event.data.options.plsId);
        break;
      case "selectArtist":
        location.hash = '#/ar/' + event.data.options.artistId;
        break;
      case "selectAlbum":
        location.hash = '#/al/' + event.data.options.albumId;
        break;
      case "setPosition":
        setPosition(event.data.options.percent);
        break;
    }
  }
  
  window.addEventListener("message", onMessage);
  console.debug("Prime Player extension connected.");
  initPrimePlayerExt = null;
})();
