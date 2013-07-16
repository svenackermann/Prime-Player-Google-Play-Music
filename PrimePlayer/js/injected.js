/**
 * This script is injected directly to the Google Play Music window to run in its context.
 * Handles commands from content script.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
(function() {
  function dispatchMouseEvent(element, eventname, clientX, clientY) {
    var event = document.createEvent("MouseEvents");
    event.initMouseEvent(eventname, true, true, window, 1, 0, 0, clientX || 0, clientY || 0, false, false, false, false, 0, element);
    element.dispatchEvent(event);
  }
  
  function simClick(element) {
    dispatchMouseEvent(element, "click");
  }
  
  function startPlaylist() {
    simClick(document.getElementsByClassName("overlay-icon")[0]);
  }
  
  function clickCard(id) {
    var cards = document.getElementsByClassName("card");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.id == id) {
        simClick(cards[i].getElementsByClassName("title")[0]);
        break;
      }
    }
  }
  
  function rate(n) {
    var lis = document.getElementById("player-right-wrapper").getElementsByClassName("rating-container")[0].getElementsByTagName("li");
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].dataset.rating == n) {
        simClick(lis[i]);
        break;
      }
    }
  }
  
  function setPositionPercent(elementId, percent) {
    var slider = document.getElementById(elementId);
    var rect = slider.getBoundingClientRect();
    dispatchMouseEvent(slider, "mousedown", rect.left + (percent * rect.width), rect.top + 1);
  }
  
  function cleanup() {
    console.debug("Cleanup injected script for Prime Player...");
    window.removeEventListener("message", onMessage);
  }
  
  function onMessage(event) {
    // We only accept messages from ourselves
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER") return;
    switch (event.data.command) {
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
        startPlaylist();
        break;
      case "setPosition":
        setPositionPercent("slider", event.data.options.percent);
        break;
      case "setVolume":
        setPositionPercent("vslider", event.data.options.percent);
        break;
      case "clickCard":
        clickCard(event.data.options.id);
        break;
      case "cleanup":
        cleanup();
        break;
    }
  }
  
  window.addEventListener("message", onMessage);
  console.debug("Prime Player extension connected.");
})();
