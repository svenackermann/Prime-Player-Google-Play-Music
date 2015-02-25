/**
 * This script is injected directly to the Google Play Music window to run in its context.
 * Handles commands from content script.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
(function() {
  /**
   * Simulate a mouse event.
   * @param eventname type of event
   * @param element the DOM element on which to dispatch the event
   * @param clientX x-coordinate of the event, defaults to 0
   * @param clientY y-coordinate of the event, defaults to 0
   */
  function simulateMouseEvent(eventname, element, clientX, clientY) {
    if (!element) return;
    var event = document.createEvent("MouseEvents");
    event.initMouseEvent(eventname, true, true, window, 1, 0, 0, clientX || 0, clientY || 0, false, false, false, false, 0, element);
    element.dispatchEvent(event);
  }
  
  /** Simulate a click event on an element. */
  var simulateClick = simulateMouseEvent.bind(window, "click");
  
  /**
   * Execute a function for an element which matches a dataset attribute.
   * @param list the array to lookup the element
   * @param prop the name of the dataset attribute
   * @param value the value that the dataset attribute should match
   * @param cb callback function to execute for the first matching element (this element is passed as parameter)
   * @return true, if and only if a matching element was found
   */
  function withMatchingDataset(list, prop, value, cb) {
    if (!list) return false;
    return [].some.call(list, function(el) {
      if (el.dataset[prop] == value) {
        cb(el);
        return true;
      }
    });
  }
  
  /** Start the currently displayed playlist. */
  function startPlaylist() {
    if (location.hash.indexOf("artist/") == 2) {
      if (withMatchingDataset(document.getElementsByClassName("button"), "id", "radio", simulateClick)) return;
    }
    if (location.hash.indexOf("expgenres/") == 2) {
      if (withMatchingDataset(document.getElementsByClassName("button"), "id", "start-genre-radio", simulateClick)) return;
    }
    var overlay = document.getElementsByClassName("overlay-icon")[0];
    if (overlay) simulateClick(overlay);
    else startPlaylistSong({ index: 0 });
  }
  
  /** Simulate a click on a .card with given id. */
  function clickCard(id) {
    withMatchingDataset(document.getElementsByClassName("card"), "id", id, function(card) {
      simulateClick(card.getElementsByClassName("title")[0]);
    });
  }
  
  /** Click the feeling lucky button. */
  function clickFeelingLucky() {
    withMatchingDataset(document.getElementsByClassName("button"), "id", "im-feeling-lucky", simulateClick);
  }
  
  /** Click the player button with given id. If given, only click if the button has class includeClass and doesn't have class excludeClass. */
  function clickPlayerButton(id, includeClass, excludeClass) {
    var player = document.getElementById("player");
    if (player) withMatchingDataset(player.getElementsByClassName("player-middle")[0].childNodes, "id", id, function(el) {
      var classes = el.className || "";
      if (includeClass && classes.indexOf(includeClass) < 0) return;
      if (excludeClass && classes.indexOf(excludeClass) >= 0) return;
      simulateClick(el);
    });
  }
  
  /** Execute callback with the list of TD elements for the playlist row with given index and cluster or with an empty array if not found. */
  function withPlaylistCols(index, cluster, cb) {
    var content = document.getElementById("music-content");
    if (content) {
      if (cluster) content = content.getElementsByClassName("cluster")[cluster] || content;
      content = content.getElementsByClassName("song-table")[0];
      if (content) {
        var rows = content.getElementsByClassName("song-row");
        if (rows[0]) {
          index = index - rows[0].dataset.index;
          if (rows[index]) {
            cb(rows[index].getElementsByTagName("td"));
            return;
          }
        }
      }
    }
    cb([]);
  }
  
  /** Post back to cs that a playlist song action is done. */
  function sendPlaylistSongResult(msg, index) {
    window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "plSong" + msg, index: index }, location.href);
  }
  
  /**
   * Start a playlist song.
   * @param cols the columns (TD elements) of the row as returned by withPlaylistCols
   * @param success function to call after the song was started
   * @return true if the song could be started
   */
  function startPlaylistRow(cols, success) {
    if (!cols[0]) return false;
    var span = cols[0].getElementsByClassName("content")[0];
    if (span) {
      simulateMouseEvent("mouseover", span);
      setTimeout(function() {
        simulateClick(span.getElementsByClassName("hover-button")[0]);
        success();
      }, 250);
      return true;
    }
    return false;
  }
  
  /** Start a song of a playlist specified by index and cluster. */
  function startPlaylistSong(options) {
    withPlaylistCols(options.index, options.cluster, function(cols) {
      if (!startPlaylistRow(cols, sendPlaylistSongResult.bind(window, "Started", options.index))) {
        sendPlaylistSongResult("Error", options.index);
      }
    });
  }
  
  /** Resume a song of a playlist specified by index at the given position. */
  function resumePlaylistSong(options) {
    withPlaylistCols(options.index, 0, function(cols) {
      startPlaylistRow(cols, function() {
        if (options.position > 0) setTimeout(setPositionPercent.bind(window, "slider", options.position), 1000);
      });
    });
  }
  
  /** Rate a song of a playlist specified by index and cluster. */
  function ratePlaylistSong(options) {
    withPlaylistCols(options.index, options.cluster, function(cols) {
      var done = withMatchingDataset([].reverse.call(cols), "col", "rating", function(col) {
        simulateMouseEvent("mouseover", col);
        setTimeout(function() {
          rate(col, options.rating);
          setTimeout(sendPlaylistSongResult.bind(window, "Rated", options.index), 250);
        }, 250);
      });
      if (!done) sendPlaylistSongResult("Error", options.index);
    });
  }
  
  /** Rate sth. within the given container. */
  function rate(parent, rating) {
    var container = parent.getElementsByClassName("rating-container")[0];
    if (container) withMatchingDataset(container.getElementsByTagName("li"), "rating", rating, simulateClick);
  }
  
  /** Set the position of a given slider (volume or song progress). */
  function setPositionPercent(elementId, percent) {
    var slider = document.getElementById(elementId);
    var rect = slider.getBoundingClientRect();
    simulateMouseEvent("mousedown", slider, rect.left + (percent * rect.width), rect.top + 1);
  }
  
  /** Cleanup this script, i.e. remove the message listener from the window. */
  function cleanup() {
    console.info("Cleanup injected script for Prime Player...");
    window.removeEventListener("message", onMessage);
  }
  
  /** Message listener for commands from cs. */
  function onMessage(event) {
    // We only accept messages from ourselves
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER" || !event.data.command) return;
    console.debug("cs->inj: ", event.data);
    switch (event.data.command) {
      case "playPause":
        var resume = event.data.options.resume;
        clickPlayerButton("play-pause", resume === false ? "playing" : null, resume ? "playing" : null);
        break;
      case "nextSong":
        clickPlayerButton("forward");
        break;
      case "prevSong":
        clickPlayerButton("rewind");
        break;
      case "toggleRepeat":
        clickPlayerButton("repeat");
        break;
      case "toggleShuffle":
        clickPlayerButton("shuffle");
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
  console.info("Prime Player extension connected.");
})();
