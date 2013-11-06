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
  
  function withPlaylistCols(controlLink, index, callback) {
    if (location.hash != controlLink) return callback([]);
    var tbody = document.getElementsByClassName("song-table")[0];
    if (tbody == null) return callback([]);
    tbody = tbody.getElementsByTagName("tbody")[0];
    if (index > tbody.dataset.count - 1) return callback([]);
    function callForRow() {
      var rows = document.getElementsByClassName("song-row");
      var scrollToRow;
      if (tbody.dataset.startIndex > index) scrollToRow = rows[0];
      else if (tbody.dataset.endIndex - 1 < index) scrollToRow = rows[rows.length - 1];
      if (scrollToRow) {
        scrollToRow.scrollIntoView(true);
        setTimeout(callForRow, 50);
      } else {
        callback(rows[index - tbody.dataset.startIndex].getElementsByTagName("td"));
      }
    }
    callForRow();
  }
  
  function sendPlaylistSongResult(msg, index) {
    window.postMessage({ type: "FROM_PRIMEPLAYER_INJECTED", msg: msg, index: index }, location.href);
  }
  
  function startPlaylistSong(controlLink, index) {
    withPlaylistCols(controlLink, index, function(cols) {
      if (cols[0]) {
        var span = cols[0].getElementsByClassName("content")[0];
        if (span) {
          dispatchMouseEvent(span, "mouseover");
          setTimeout(function() {
            simClick(span.getElementsByClassName("hover-button")[0]);
            sendPlaylistSongResult("playlistSongStarted", index);
          }, 250);
          return;
        }
      }
      sendPlaylistSongResult("playlistSongError", index);
    });
  }
  
  function ratePlaylistSong(controlLink, index, rating) {
    withPlaylistCols(controlLink, index, function(cols) {
      for (var i = cols.length - 1; i >= 0; i--) {
        if (cols[i].dataset.col == "rating") {
          dispatchMouseEvent(cols[i], "mouseover");
          setTimeout(function() {
            rate(cols[i], rating);
            sendPlaylistSongResult("playlistSongRated", index);
          }, 250);
          return;
        }
      }
      sendPlaylistSongResult("playlistSongError", index);
    });
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
      case "startPlaylistSong":
        startPlaylistSong(event.data.options.link, event.data.options.index);
        break;
      case "ratePlaylistSong":
        ratePlaylistSong(event.data.options.link, event.data.options.index, event.data.options.rating);
        break;
      case "cleanup":
        cleanup();
        break;
    }
  }
  
  window.addEventListener("message", onMessage);
  console.debug("Prime Player extension connected.");
})();
