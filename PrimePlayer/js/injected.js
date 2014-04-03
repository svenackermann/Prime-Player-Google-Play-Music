/**
 * This script is injected directly to the Google Play Music window to run in its context.
 * Handles commands from content script.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
(function() {
  function dispatchMouseEvent(eventname, element, clientX, clientY) {
    var event = document.createEvent("MouseEvents");
    event.initMouseEvent(eventname, true, true, window, 1, 0, 0, clientX || 0, clientY || 0, false, false, false, false, 0, element);
    element.dispatchEvent(event);
  }
  
  var simClick = dispatchMouseEvent.bind(window, "click");
  
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
  
  function clickFeelingLucky() {
    var buttons = document.getElementsByTagName("button");
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].dataset.id == "im-feeling-lucky") {
        simClick(buttons[i]);
        break;
      }
    }
  }
  
  function clickPlayerButton(id) {
    var player = document.getElementById("player");
    if (player) {
      var btns = player.getElementsByClassName("player-middle")[0];
      if (btns) {
        btns = btns.childNodes;
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].dataset.id == id) {
            simClick(btns[i]);
            break;
          }
        }
      }
    }
  }
  
  function withPlaylistCols(index, callback) {
    var main = document.getElementById("main");
    if (!main) return callback([]);
    var rows = main.getElementsByClassName("song-row");
    if (!rows[0]) return callback([]);
    index = index - rows[0].dataset.index;
    if (index < 0 || index > rows.length - 1) return callback([]);
    callback(rows[index].getElementsByTagName("td"));
  }
  
  function sendPlaylistSongResult(msg, index) {
    window.postMessage({ type: "FROM_PRIMEPLAYER", msg: msg, index: index }, location.href);
  }
  
  function startPlaylistRow(cols, success) {
    if (!cols[0]) return false;
    var span = cols[0].getElementsByClassName("content")[0];
    if (span) {
      dispatchMouseEvent("mouseover", span);
      setTimeout(function() {
        simClick(span.getElementsByClassName("hover-button")[0]);
        success();
      }, 250);
      return true;
    }
    return false;
  }
  
  function startPlaylistSong(options) {
    withPlaylistCols(options.index, function(cols) {
      if (!startPlaylistRow(cols, sendPlaylistSongResult.bind(window, "playlistSongStarted", options.index))) {
        sendPlaylistSongResult("playlistSongError", options.index);
      }
    });
  }
  
  function resumePlaylistSong(options) {
    withPlaylistCols(options.index, function(cols) {
      startPlaylistRow(cols, function() {
        if (options.position > 0) setTimeout(setPositionPercent.bind(window, "slider", options.position), 1000);
      });
    });
  }
  
  function ratePlaylistSong(options) {
    withPlaylistCols(options.index, function(cols) {
      for (var i = cols.length - 1; i >= 0; i--) {
        if (cols[i].dataset.col == "rating") {
          dispatchMouseEvent("mouseover", cols[i]);
          setTimeout(function() {
            rate(cols[i], options.rating);
            setTimeout(sendPlaylistSongResult.bind(window, "playlistSongRated", options.index), 250);
          }, 250);
          return;
        }
      }
      sendPlaylistSongResult("playlistSongError", options.index);
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
    dispatchMouseEvent("mousedown", slider, rect.left + (percent * rect.width), rect.top + 1);
  }
  
  function cleanup() {
    console.debug("Cleanup injected script for Prime Player...");
    window.removeEventListener("message", onMessage);
  }
  
  function onMessage(event) {
    // We only accept messages from ourselves
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER" || !event.data.command) return;
    switch (event.data.command) {
      case "playPause":
      case "toggleRepeat":
      case "toggleShuffle":
        SJBpost(event.data.command);
        break;
      case "nextSong":
        clickPlayerButton("forward");
        break;
      case "prevSong":
        clickPlayerButton("rewind");
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
      case "feelingLucky":
        clickFeelingLucky();
        break;
      case "startPlaylistSong":
        startPlaylistSong(event.data.options);
        break;
      case "resumePlaylistSong":
        resumePlaylistSong(event.data.options);
        break;
      case "ratePlaylistSong":
        ratePlaylistSong(event.data.options);
        break;
      case "cleanup":
        cleanup();
        break;
    }
  }
  
  window.addEventListener("message", onMessage);
  console.debug("Prime Player extension connected.");
})();
