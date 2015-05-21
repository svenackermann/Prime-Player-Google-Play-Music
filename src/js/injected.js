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
    var event = new MouseEvent(eventname, {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      clientX: clientX || 0,
      clientY: clientY || 0,
      buttons: 1,
      relatedTarget: element
    });
    element.dispatchEvent(event);
  }

  /** Simulate a click event on an element. */
  var simulateClick = simulateMouseEvent.bind(window, "click");

  /** Start the currently displayed playlist. */
  function startPlaylist() {
    var playButton;
    if (location.hash.indexOf("artist/") == 2) playButton = document.querySelector("#music-content .actions [data-id='radio']");
    else if (location.hash.indexOf("expgenres/") == 2) playButton = document.querySelector("#action_bar_container [data-id='start-genre-radio']");
    playButton = playButton || document.querySelector("#music-content .material-container-details [data-id='play']");
    if (playButton) simulateClick(playButton);
    else startPlaylistSong({ index: 0 });
  }

  /** Simulate a click on a .material-card with given id. */
  function clickCard(id) {
    simulateClick(document.querySelector(".material-card[data-id='" + id + "'] .title"));
  }

  /** Click the feeling lucky button. */
  function clickFeelingLucky() {
    simulateClick(document.querySelector("#action_bar_container [data-id='im-feeling-lucky']"));
  }

  /** Click the player button with given id. If given, only click if the button has class includeClass and doesn't have class excludeClass. */
  function clickPlayerButton(id, includeClass, excludeClass) {
    var button = document.querySelector("#player .material-player-middle [data-id='" + id + "']");
    if (button) {
      var classes = button.className || "";
      if (includeClass && classes.indexOf(includeClass) < 0) return;
      if (excludeClass && classes.indexOf(excludeClass) >= 0) return;
      simulateClick(button);
    }
  }

  /** @return the matching TD element for the playlist row with given index and cluster or null if not found. */
  function getPlaylistCol(index, cluster, queue, colName) {
    var content = document.querySelector(queue ? "#queue-container" : "#music-content");
    if (content) {
      if (cluster) content = content.querySelectorAll(".cluster")[cluster - 1];
      var songTables = content.querySelectorAll(".song-table");

      var songTable;
      if (cluster) songTable = songTables[0];
      else {
        //make sure that we do not take a song-table from a cluster
        [].some.call(songTables, function(el) {
          while (el && el.id != content.id) {
            if (el.classList.contains("cluster")) return false;
            el = el.parentElement;
          }
          songTable = el;
          return true;
        });
      }

      if (songTable) {
        var rows = songTable.querySelectorAll(".song-row");
        if (rows[0]) {
          index = index - rows[0].dataset.index;
          if (rows[index]) {
            var colSelector = "td";
            if (colName) colSelector += "[data-col='" + colName + "']";
            return rows[index].querySelector(colSelector);
          }
        }
      }
    }
    return null;
  }

  /** Post back to cs that a playlist song action is done. */
  function sendPlaylistSongResult(msg, index) {
    window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "plSong" + msg, index: index }, location.href);
  }

  /**
   * Start a playlist song.
   * @param col the column (TD element) of the row as returned by withPlaylistCol
   * @param success function to call after the song was started
   * @return true if the song could be started
   */
  function startPlaylistRow(col, success) {
    if (!col) return false;
    var span = col.querySelector(".content");
    if (span) {
      simulateMouseEvent("mouseover", span);
      setTimeout(function() {
        simulateClick(span.querySelector(".hover-button"));
        success();
      }, 250);
      return true;
    }
    return false;
  }

  /** Start a song of a playlist specified by index and cluster. */
  function startPlaylistSong(options) {
    var col = getPlaylistCol(options.index, options.cluster, options.link == "#/ap/queue");
    if (!startPlaylistRow(col, sendPlaylistSongResult.bind(window, "Started", options.index))) sendPlaylistSongResult("Error", options.index);
  }

  /** Resume a song of a playlist specified by index at the given position. */
  function resumePlaylistSong(options) {
    var col = getPlaylistCol(options.index, 0, false);
    startPlaylistRow(col, function() {
      if (options.position > 0) setTimeout(setPositionPercent.bind(window, "#material-player-progress", options.position), 1000);
    });
  }

  /** Rate a song of a playlist specified by index and cluster. */
  function ratePlaylistSong(options) {
    var col = getPlaylistCol(options.index, options.cluster, options.link == "#/ap/queue", "rating");
    if (col) {
      simulateMouseEvent("mouseover", col);
      setTimeout(function() {
        var li = col.querySelector(".rating-container li[data-rating='" + options.rating + "']");
        if (li) {
          simulateClick(li);
          setTimeout(sendPlaylistSongResult.bind(window, "Rated", options.index), 200);
        } else sendPlaylistSongResult("Error", options.index);
      }, 200);
    } else sendPlaylistSongResult("Error", options.index);
  }

  function rateSong(rating) {
    simulateClick(document.querySelector("#playerSongInfo .rating-container [data-rating='" + rating + "']"));
  }

  /** Set the position of a given slider (volume or song progress). */
  function setPositionPercent(selector, percent) {
    var slider = document.querySelector(selector);
    var progress = slider.shadowRoot.querySelector("#sliderBar");
    var rect = progress.getBoundingClientRect();
    simulateMouseEvent("mousedown", progress, rect.left + percent * rect.width, rect.top + 1);
  }

  function getRating() {
    var ratingContainer = document.querySelector("#playerSongInfo .rating-container");
    var rating = -1;
    if (ratingContainer) {
      rating = 0;
      [].some.call(ratingContainer.children, function(el) {
        var icon = el.icon;
        if (icon && icon.indexOf("-outline") < 0) {
          var parsedRating = parseInt(el.dataset.rating);
          if (!isNaN(rating)) {
            rating = parsedRating;
            return true;
          }
        }
      });
    }
    window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "rating", rating: rating }, location.href);
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
    case "openQueue":
      simulateClick(document.querySelector("#queue"));
      break;
    case "rate":
      rateSong(event.data.options.rating);
      break;
    case "startPlaylist":
      startPlaylist();
      break;
    case "setPosition":
      setPositionPercent("#material-player-progress", event.data.options.percent);
      break;
    case "setVolume":
      setPositionPercent("#material-vslider", event.data.options.percent);
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
    case "getRating":
      getRating();
      break;
    }
  }

  window.addEventListener("message", onMessage);
  console.info("Prime Player extension connected.");
})();
