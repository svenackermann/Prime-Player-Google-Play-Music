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
  
  function getQueueCol(index, col) {
    if (location.hash != "#/ap/queue") return null;
    var row = document.getElementsByClassName("song-row")[index];
    var tds = row.getElementsByTagName("td");
    for (var i = 0; i < tds.length; i++) {
      if (tds[i].dataset.col == col) return tds[i];
    }
    return null;
  }
  
  function startQueueSong(index) {
    var col = getQueueCol(index, "title");
    if (col) {
      var span = col.getElementsByClassName("content")[0];
      dispatchMouseEvent(span, "mouseover");
      setTimeout(function() {
        simClick(span.getElementsByClassName("hover-button")[0]);
      }, 250);
    }
  }
  
  function rateQueueSong(index, rating) {
    var col = getQueueCol(index, "rating");
    if (col) {
      dispatchMouseEvent(col, "mouseover");
      setTimeout(function() {
        rate(col, rating);
      }, 250);
    }
  }
  
  function rate(parent, rating) {
    var lis = parent.getElementsByClassName("rating-container")[0].getElementsByTagName("li");
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].dataset.rating == rating) {
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
        rate(document.getElementById("player-right-wrapper"), event.data.options.rating);
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
      case "startQueueSong":
        startQueueSong(event.data.options.index);
        break;
      case "rateQueueSong":
        rateQueueSong(event.data.options.index, event.data.options.rating);
        break;
      case "cleanup":
        cleanup();
        break;
    }
  }
  
  window.addEventListener("message", onMessage);
  console.debug("Prime Player extension connected.");
})();
