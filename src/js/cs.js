/**
 * Content script to be injected to Google Play Music.
 * This watches the DOM for relevant changes and notifies the background page.
 * It also delivers commands to the Google Play Music window.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */
/* jshint jquery: true */

$(function() {
  var port;
  var observers = [];
  var executeOnContentLoad;
  var contentLoadDestination;
  var listRatings;
  var queueRatings;
  var asyncListTimer;
  var playlistRowCommandTimer;
  var pausePlaylistParsing = false;
  var resumePlaylistParsingFn;
  var lyricsAutoReload = false;
  var lyricsAutoReloadTimer;
  var starRatingMode = false;
  var position;
  var playing;
  var currentRating = -1;
  var currentSong;
  var ratedInGpm = -1;
  var needActiveTabId;
  var needActiveTabCb;
  var CLUSTER_SELECTOR = ".cluster,.genre-stations-container";
  var HASH_QUEUE = "ap/queue";
  var i18n = chrome.i18n.getMessage;
  var getExtensionUrl = chrome.runtime.getURL;

  /** send update to background page */
  function post(type, value) {
    if (port) port.postMessage({ type: type, value: value });
  }

  /** @return converted text (e.g. from artist name) that is usable in the URL hash */
  function forHash(text) {
    return encodeURIComponent($.trim(text)).replace(/(%20)+/g, "+");
  }

  /** @return hash(-part) converted back to text (e.g. to extract album artist from album hash) */
  function parseHash(hash) {
    return hash && decodeURIComponent(hash.replace(/(\+)+/g, "%20"));
  }

  /** @return true, if the current location's hash matches the given one */
  function matchesHash(hash) {
    var subHash = location.hash.substr(2);
    return subHash == hash || decodeURIComponent(subHash) == hash;
  }

  /** @return link (for hash) constructed from attributes data-type and data-id */
  function getLink(el) {
    if (el.data("id")) return el.data("type") + "/" + el.data("id");
    return null;
  }

  /** @return valid cover URL from src attribute of the element or null */
  function parseCover(el) {
    var cover = el.attr("src");
    if (cover && cover.indexOf("/default_album_med.png") > 0) return null;
    if (cover && cover.indexOf("//") === 0) cover = "https:" + cover;
    return cover;
  }

  /** @return parsed rating from the element's 'data-rating' attribute, 0 if this attribute is missing or -1 if the element is missing */
  function parseRating(container) {
    if (container) {
      var rating = parseInt(container.dataset.rating);
      return isNaN(rating) ? 0 : rating;
    }
    return -1;
  }

  /** @return true, if title and duration match and if artist is present on both songs they must also match */
  function areSongsEqual(song1, song2) {
    return song1.title == song2.title && song1.duration == song2.duration && (!song1.artist || !song2.artist || song1.artist == song2.artist);
  }

  /** Show the P-icon as indicator for successful connection. */
  function showConnectedIndicator() {
    hideConnectedIndicator();
    $("<div class='ppconnected'>")
      .attr("title", i18n("connected"))
      .click(function() {
        port.disconnect();
        cleanup();
      })
      .insertBefore("#material-breadcrumbs");
  }

  /** Hide the P-icon as indicator for successful connection. */
  function hideConnectedIndicator() {
    $(".ppconnected").remove();
  }

  /** Render lyrics sent from the bp if the lyrics container is visible. */
  function renderLyrics(result, providers, srcUrl) {
    var lyrics = $("#ppLyricsContainer");
    if (lyrics.is(":visible")) {
      lyrics.removeClass("loading");
      var content = lyrics.find("#ppLyricsContent");
      var credits = lyrics.find("#ppLyricsCredits");
      if (result.error) {
        content.html("<div class='error'></div>");
      } else if (result.noresults) {
        content.html("<div class='empty'></div>");
      } else {
        lyrics.children("#ppLyricsTitle").children("div").text(result.title).attr("title", result.title);
        content.html(result.lyrics);
        if (result.credits) credits.html(result.credits + "<br/>");
      }
      credits.append(i18n("lyricsSrcProvider", srcUrl));
      credits.append("<br>");
      if (result.src) credits.append($("<a target='_blank'></a>").attr("href", result.src).text(i18n("lyricsSrc"))).append($("<br/>"));
      if (result.searchSrc) credits.append($("<a target='_blank'></a>").attr("href", result.searchSrc).text(i18n("lyricsSearchResult")));

      providers = providers || credits.data("providers");
      credits.removeData("providers");
      providers.forEach(function(provider) {
        credits.append("<br>");
        $("<a>")
          .text(i18n("lyricsSearchProvider", provider.url))
          .click(function() {
            var otherProviders = providers.slice();
            otherProviders.splice(otherProviders.indexOf(provider), 1);
            credits.data("providers", otherProviders);
            loadLyrics(provider.provider);
          })
          .appendTo(credits);
      });
    }
  }

  /** Request lyrics from the bp. */
  function loadLyrics(provider) {
    $("#ppLyricsTitle").children("div").removeAttr("title").empty();
    $("#ppLyricsContent").empty();
    $("#ppLyricsCredits").empty();
    $("#ppLyricsContainer").addClass("loading").show();
    post("loadLyrics", provider);
  }

  /** Adjust the music content size to make the lyrics container fit in the page. */
  function contentResize() {
    $("#music-content").css("width", $("#content-container").width() - $("#ppLyricsContainer").width() - 10 + "px");
  }

  /** Undo the music content resize. */
  function resetContentResize() {
    $(window).off("resize", contentResize);
    $("#music-content").css("width", "");
  }

  /** Show/hide the lyrics container. */
  function toggleLyrics() {
    var lyrics = $("#ppLyricsContainer");
    if (lyrics.is(":visible")) {
      lyrics.removeClass().hide();
      resetContentResize();
    } else if ($(this).hasClass("active")) {
      loadLyrics();
      $(window).on("resize", contentResize);
      contentResize();
    }
  }

  /** Remove all artifacts for the lyrics feature from the site. */
  function disableLyrics() {
    $("#ppLyricsButton, #ppLyricsContainer").remove();
    resetContentResize();
  }

  /** Setup lyrics feature on the site. */
  function enableLyrics(fontSize, width) {
    if (!$("#ppLyricsButton").length) {
      $("<img id='ppLyricsButton'/>")
        .attr("src", getExtensionUrl("img/cmd/openLyrics.png"))
        .attr("title", i18n("command_openLyrics"))
        .toggleClass("active", !!$("#currently-playing-title").length)
        .click(toggleLyrics)
        .appendTo("#material-player-right-wrapper");
      $("<div id='ppLyricsContainer'><div id='ppLyricsTitle'><a class='reloadLyrics'></a><div></div></div><div id='ppLyricsScroller'><div id='ppLyricsContent'></div><div id='ppLyricsCredits'></div></div></div>")
        .on("click", ".reloadLyrics", loadLyrics.bind(window, null))
        .css({ bottom: $("#player").height() + 5 + "px", top: $("#material-app-bar").height() + 5 + "px" })
        .insertAfter("#music-content");
    }
    $("#ppLyricsContainer").css({ "font-size": fontSize + "px", width: width });
    if ($("#ppLyricsContainer").is(":visible")) contentResize();
  }

  function toggleStarRatingMode(state) {
    starRatingMode = state;
    currentRating = -1;
    if (state) {
      $("#queueContainer").on("DOMSubtreeModified", ".song-row.currently-playing [data-col='rating']", sendRating);
    } else {
      $("#queueContainer").off("DOMSubtreeModified", sendRating);
    }
    sendRating();
  }

  function confirmCloseWhenPlaying() {
    if (playing) return i18n("musicIsPlaying");
  }

  function setConfirmClose(confirmClose) {
    $(window).off("beforeunload", confirmCloseWhenPlaying);
    if (confirmClose) $(window).on("beforeunload", confirmCloseWhenPlaying);
  }

  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    sendCommand("cleanup");
    window.removeEventListener("message", onMessage);
    $("#primeplayerinjected").remove();
    $("#music-content,#queueContainer").off("DOMSubtreeModified mouseup");
    $("#playerSongInfo").off("click");
    $(window).off("hashchange");
    setConfirmClose(false);
    observers.forEach(function(o) { o.disconnect(); });
    hideConnectedIndicator();
    disableLyrics();
    port = null;
    toggleStarRatingMode(false);
  }

  function getClusterIndex(el) {
    var cluster = el.closest(".cluster");
    return cluster.length ? cluster.parent().children(".cluster").index(cluster) + 1 : 0;
  }

  function subclusterFilter(cont) {
    return function() {
      var cluster = $(this).closest(CLUSTER_SELECTOR);
      //include if not contained in a cluster (top level sublist) or if contained in this cluster
      return !cluster.length || cluster[0] == cont[0];
    };
  }

  /** @return info object for the current song or null if none is playing */
  function parseSongInfo(extended) {
    var playerSongInfo = $("#playerSongInfo");
    if (playerSongInfo.is(":visible") && playerSongInfo.find("div").length) {
      var artist = $("#player-artist");
      var album = playerSongInfo.find(".player-album");
      var albumId = album.data("id");
      var info = {
        artist: $.trim(artist.text()),
        title: $.trim($("#currently-playing-title").text()),
        album: $.trim(album.text()),
        albumArtist: albumId && parseHash(albumId.split("/")[1]),
        duration: $.trim($("#time_container_duration").text())
      };
      if (extended) {
        info.artistLink = getLink(artist) || "artist//" + forHash(info.artist);
        info.albumLink = getLink(album);
        info.cover = parseCover($("#playerBarArt"));
        var playlistSong = $(".song-row.currently-playing");
        if (playlistSong[0]) {
          info.playlist = location.hash.substr(2);
          info.index = playlistSong.data("index");
          info.cluster = getClusterIndex(playlistSong);
        }
      }
      return info;
    }
    return null;
  }

  function isRatingActive(iconButton) {
    return !$(iconButton).find("iron-icon>svg>g").attr("transform");
  }

  function sendRating() {
    var ratingContainer = $("#playerSongInfo .rating-container");
    var rating = -1;
    if (ratingContainer[0]) {
      if (starRatingMode) {
        //this must be loaded from the queue, because we only have the thumbs rating in playerSongInfo
        var currentSongRow = $("#queueContainer .song-row.currently-playing");
        if (!currentSongRow[0]) {
          //open the queue (needed before it is opened the very first time) and get triggered again by event listener
          selectAndExecute(HASH_QUEUE, $.noop);
          return;
        }
        rating = parseRating(currentSongRow.children("[data-col='rating']")[0]);
      } else {
        rating = 0;
        ratingContainer.children("[data-rating]").each(function() {
          if (isRatingActive(this)) {
            rating = parseRating(this);
            return false;
          }
        });
      }
    }

    if (currentRating !== rating) {
      currentRating = rating;
      //post player-listrating if neccessary, we must check all song rows (not just the current playing), because if rated "1", the current song changes immediately
      if (listRatings || queueRatings) $("#music-content,#queueContainer").find(".song-row td[data-col='rating']").trigger("DOMSubtreeModified");
      post("song-rating", currentRating);
      if (ratedInGpm >= 0 && ratedInGpm === currentRating) post("rated", { song: parseSongInfo(), rating: currentRating });
      ratedInGpm = -1;
    }
  }

  function init() {
    if ($("#playerSongInfo").length) doInit();
    else setTimeout(init, 250);
  }

  /** add listeners/observers and extend DOM */
  function doInit() {
    function onCleanupCsDone(event) {
      if (event.source == window && event.data.type == "FROM_PRIMEPLAYER" && event.data.msg == "cleanupCsDone") {
        window.removeEventListener("message", onCleanupCsDone);
        init();
      }
    }
    if ($("#primeplayerinjected").length) {
      //cleanup old content script
      window.addEventListener("message", onCleanupCsDone);
      window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "cleanupCs" }, location.href);
      return;//wait for callback
    }

    /** Send current song info to bp. */
    function sendSong() {
      var info = parseSongInfo(true);
      if (info && lyricsAutoReload && $("#ppLyricsContainer").is(":visible") && !areSongsEqual(info, currentSong)) {
        clearTimeout(lyricsAutoReloadTimer);
        lyricsAutoReloadTimer = setTimeout(loadLyrics, 1000);
      }
      currentSong = info;
      $("#ppLyricsButton").toggleClass("active", !!info);
      post("song-info", info);
    }

    /** Send current position info to bp. */
    function sendPosition(el) {
      var parsed = $.trim(el.text());
      if (parsed != position) {
        position = parsed;
        post("song-position", position);
      }
    }

    function enabledGetter(el) {
      var $el = $(el);
      return $el.attr("disabled") === undefined && !$el.hasClass("disabled");
    }

    /** @return null if play button is disabled or true/false if a song is playing/paused */
    function playingGetter(el) {
      playing = enabledGetter(el) ? $(el).hasClass("playing") : null;
      return playing;
    }

    /** @return shuffle state (NO_SHUFFLE/ALL_SHUFFLE) or null if shuffle is not available */
    function shuffleGetter(el) {
      return enabledGetter(el) ? el.getAttribute("value") : null;
    }

    /** Execute 'executeOnContentLoad' (if set) when #queueContainer is changed. */
    function queueLoaded() {
      if (contentLoadDestination == HASH_QUEUE && $.isFunction(executeOnContentLoad)) {
        var fn = executeOnContentLoad;
        executeOnContentLoad = null;
        contentLoadDestination = null;
        fn();
      }
    }

    /** Execute 'executeOnContentLoad' (if set) when #music-content is changed. */
    function musicContentLoaded() {
      if ($.isFunction(executeOnContentLoad)) {
        if (contentLoadDestination && !matchesHash(contentLoadDestination)) return;//wait til we are on the correct page
        var fn = executeOnContentLoad;
        executeOnContentLoad = null;
        contentLoadDestination = null;
        fn();
      }
    }

    /**
     * Execute a function after DOM manipulation on selected elements is finished.
     * @param fn function to execute, gets the jQuery object for the selector as parameter
     * @param selector element(s) to be watched for DOM manipulation
     * @param timeout time to wait after DOM manipulation before executing the function
     */
    function watchContent(fn, selector, timeout, attributes) {
      var content = $(selector);
      if (content.length) {
        var listener;
        if (timeout) {
          var contentTimer;
          listener = function() {
            clearTimeout(contentTimer);
            contentTimer = setTimeout(function() {
              contentTimer = null;
              fn(content);
            }, timeout);//wait til the DOM manipulation is finished
          };
        } else listener = fn.bind(window, content);

        var observer = new MutationObserver(function(mutations) { mutations.forEach(listener); });
        observers.push(observer);
        var params = { childList: true, subtree: true };
        if (attributes) {
          params.attributes = true;
          params.attributeFilter = attributes.split(" ");
        }
        observer.observe(content[0], params);
        listener();
      } else {
        console.error("element(s) do(es) not exist (did Google change their site?): " + selector);
      }
    }

    /**
     * Watch changes of attributes on DOM elements specified by the selector.
     * @param attrs the space separated names of the attributes
     * @param selector the jQuery selector
     * @param type the type of message to post on change
     * @param getValue an optional special function to get the value (default is to return the changed attribute value)
     * @param timeout time to wait after DOM manipulation before executing the function
     */
    function watchAttr(attrs, selector, type, getValue, timeout) {
      var elements = $(selector);
      if (elements.length) {
        getValue = getValue || function(el, attr) { return el.getAttribute(attr); };
        var value = getValue(elements[0], attrs);
        var postTimer;
        var observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            clearTimeout(postTimer);
            function update() {
              var newValue = getValue(mutation.target, mutation.attributeName);
              if (newValue !== value) {
                value = newValue;
                post(type, value);
              }
            }
            postTimer = setTimeout(update, timeout || 0);
          });
        });
        observers.push(observer);
        elements.each(function() {
          observer.observe(this, { attributes: true, attributeFilter: attrs.split(" ") });
        });
        post(type, value);//trigger once to initialize the info
      } else {
        console.error("element(s) not exist (did Google change their site?): " + selector);
      }
    }

    watchContent(sendSong, "#playerSongInfo", 500, "style");
    watchContent(sendRating, "#playerSongInfo", 250);
    watchContent(sendPosition, "#time_container_current");
    watchContent(musicContentLoaded, "#music-content", 1000);
    watchContent(queueLoaded, "#queueContainer", 1000);
    var playerButtonPrefix = "#player > div.material-player-middle > [data-id='";
    watchAttr("class disabled", playerButtonPrefix + "play-pause']", "player-playing", playingGetter, 500);
    watchAttr("class disabled", playerButtonPrefix + "rewind']", "player-rewind", enabledGetter);
    watchAttr("class disabled", playerButtonPrefix + "forward']", "player-forward", enabledGetter);
    watchAttr("value", playerButtonPrefix + "repeat']", "player-repeat");
    watchAttr("value", playerButtonPrefix + "shuffle']", "player-shuffle", shuffleGetter);
    watchAttr("aria-valuenow", "#material-vslider", "player-volume");

    $("#music-content,#queueContainer").on("DOMSubtreeModified", ".song-row td[data-col='rating']", function() {
      var td = $(this);
      var queue = !!td.closest("#queueContainer").length;
      if (!queue && listRatings || queue && queueRatings) {
        var rating = parseRating(this);
        var index = td.closest(".song-row").data("index");
        var selectedRatings;
        var cluster = 0;
        if (queue) selectedRatings = queueRatings;
        else {
          cluster = getClusterIndex(td);
          selectedRatings = listRatings[cluster];
        }
        if (selectedRatings && selectedRatings[index] != rating) {
          selectedRatings[index] = rating;
          post("player-listrating", { index: index, cluster: cluster, rating: rating, controlLink: queue ? "#/ap/queue" : location.hash });
        }
      }
    });
    $(window).on("hashchange", function() {
      listRatings = queueRatings = null;
      resumePlaylistParsingFn = null;
      restoreActiveTab(needActiveTabCb);
      pausePlaylistParsing = false;
      clearTimeout(asyncListTimer);
      clearTimeout(playlistRowCommandTimer);
    });

    $("#playerSongInfo").on("click", ".rating-container > *[data-rating]", function(e) {
      //when click is simulated by injected script, clientX will be 0
      if (e.clientX) ratedInGpm = isRatingActive(this) ? 0 : parseRating(this);
    });
    //listen for "mouseup", because "click" won't bubble up to "#music-content" and we can't attach this directly to ".rating-container" because it's dynamically created
    $("#music-content,#queueContainer").on("mouseup", ".song-row td[data-col='rating'] ul.rating-container li[data-rating]", function() {
      var button = $(this);
      post("rated", { song: parseSongRow(button.closest(".song-row"), true), rating: button.hasClass("selected") ? 0 : parseRating(this) });
    });

    window.addEventListener("message", onMessage);
    //we must add this script to the DOM for the code to be executed in the correct context
    $("<script id='primeplayerinjected'></script>").attr("src", getExtensionUrl("js/injected.js")).appendTo("head");

    var sendConnectedInterval;
    function sendConnected() {
      if (!$("#loading-progress").is(":visible")) {
        clearInterval(sendConnectedInterval);
        var ql = {};
        $("#nav_collections > *[data-type]").each(function() {
          ql[$(this).data("type")] = $.trim($(this).text());
        });
        $("#header-tabs-container .tab-container > *[data-type]").each(function() {
          ql[$(this).data("type")] = $.trim($(this).text());
        });
        $("#auto-playlists").children("a").each(function() {
          ql[getLink($(this))] = $.trim($(this).find(".tooltip").text());
        });
        ql.searchPlaceholder = $.trim($("#material-one-middle input.material-search").attr("placeholder"));
        post("connected", {
          ratingMode: "thumbs",
          quicklinks: ql
        });
      }
    }
    sendConnectedInterval = setInterval(sendConnected, 500);
  }

  /** callback for messages from the injected script */
  function onMessage(event) {
    // We only accept messages from the injected script
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER" || !event.data.msg) return;
    console.debug("inj->cs: ", event.data);
    switch (event.data.msg) {
    case "plSongRated":
      $("#music-content,#queueContainer").find(".song-row[data-index='" + event.data.index + "']").find("td[data-col='rating']").trigger("DOMSubtreeModified");
      /* falls through */
    case "plSongStarted":
    case "plSongError":
      pausePlaylistParsing = false;
      if ($.isFunction(resumePlaylistParsingFn)) resumePlaylistParsingFn();
      resumePlaylistParsingFn = null;
      break;
    case "cleanupCs":
      port.disconnect();
      cleanup();
      window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "cleanupCsDone" }, location.href);
      break;
    }
  }

  /** Send a command to the injected script. */
  function sendCommand(command, options) {
    window.postMessage({ type: "FROM_PRIMEPLAYER", command: command, options: options }, location.href);
  }

  function needActiveTab(cb) {
    if (document.hidden && !needActiveTabId) {
      post("needActiveTab", needActiveTabId = $.now());
      needActiveTabCb = cb;
    }
  }

  function restoreActiveTab(cb) {
    if (needActiveTabId && cb == needActiveTabCb) {
      post("restoreActiveTab", needActiveTabId);
      needActiveTabId = null;
      needActiveTabCb = null;
    }
  }

  function scrollAndContinue(scrollTo, cb, alignToTop) {
    scrollTo.scrollIntoView(alignToTop);
    needActiveTab(cb);
    return setTimeout(cb, 100);
  }

  /** Send a command for a playlist row to the injected script. Ensures that the row is visible. */
  function sendPlaylistRowCommand(command, options) {
    var queue = options.link == "#/ap/queue";
    if (!queue && location.hash != options.link) return;
    var bodySelector = "#music-content";
    if (queue) {
      bodySelector = "#queueContainer";
      if (!$("#queueContainer").is(":visible")) sendCommand("openQueue");
    }
    var body = $(bodySelector);
    if (options.cluster) body = $(body.find(CLUSTER_SELECTOR)[options.cluster - 1]);
    body = body.find(".song-table > tbody").filter(subclusterFilter(body));
    if (!body.length || options.index > body.data("count") - 1) return;
    pausePlaylistParsing = true;
    /* jshint -W082 */
    function callForRow() {//make sure row with requested index is available
      var rows = body.find(".song-row");
      var scrollToRow, alignToTop;
      if (rows.first().data("index") > options.index) {
        scrollToRow = rows[0];
        alignToTop = true;
      } else if (rows.last().data("index") < options.index) {
        scrollToRow = rows.last()[0];
        alignToTop = false;
      }
      if (scrollToRow) playlistRowCommandTimer = scrollAndContinue(scrollToRow, callForRow, alignToTop);
      else {
        sendCommand(command, options);
        restoreActiveTab(callForRow);
      }
    }
    callForRow();
  }

  function isAutoQueueList(link) {
    return link == HASH_QUEUE || !link.indexOf("im/") || !link.indexOf("st/") || !link.indexOf("sm/") || !link.indexOf("situations/");
  }

  /**
   * Click a card to start a playlist. Should always lead to the queue.
   * @return true, if the card was found
   */
  function clickListCard(hash) {
    var id = hash.substr(hash.indexOf("/") + 1);
    var type = hash.substr(0, hash.indexOf("/"));
    if ($(".material-card[data-id='" + id + "'][data-type='" + type + "']").length) {
      contentLoadDestination = HASH_QUEUE;
      sendCommand("clickCard", { id: id });
      return true;
    }
    return false;
  }

  /** Set the hash to the given value to navigate to another page and call the function when finished. */
  function selectAndExecute(hash, cb) {
    if (matchesHash(hash)) {
      if (cb) cb();
    } else if (hash == HASH_QUEUE) {
      if ($("#queueContainer").is(":visible")) {
        if (cb) cb();
      } else {
        executeOnContentLoad = cb;
        contentLoadDestination = HASH_QUEUE;
        sendCommand("openQueue");
      }
    } else {
      executeOnContentLoad = cb;
      if (!hash.indexOf("st/") || !hash.indexOf("sm/") || !hash.indexOf("situations/")) {//setting hash does not work for these types
        if (!clickListCard(hash)) {
          selectAndExecute("rd", function() {//try to find it on the mixes page
            executeOnContentLoad = cb;//set again (was overwritten by the recursive call)
            if (!clickListCard(hash)) {//still not found
              executeOnContentLoad = null;
              if (cb) cb(true);
            }
          });
        }
      } else {
        contentLoadDestination = !hash.indexOf("im/") ? HASH_QUEUE : hash;//type im is automatically started
        location.hash = "/" + hash;
      }
    }
  }

  /** @return parsed song info for a playlist row */
  function parseSongRow(song, basic) {
    var title = song.find("td[data-col='title'] .column-content");
    if (!title[0]) title = song.find("td[data-col='song-details'] .song-title");
    var artist = song.find("td[data-col='artist']");
    var album = song.find("td[data-col='album']");
    var item = {
      title: $.trim(title.text()),
      artist: $.trim(artist.text()),
      album: $.trim(album.text())
    };
    var duration = $.trim(song.find("td[data-col='duration']").text());
    if (/^\d\d?(\:\d\d)*$/.test(duration)) item.duration = duration;//no real duration on recommendation page
    if (!basic) {
      item.index = song.data("index");
      item.cover = parseCover(song.find("td[data-col='title'],td[data-col='song-details']").find(".column-content img"));
      var artistId = artist.data("matched-id") || "";
      if (item.artist || artistId) item.artistLink = "artist/" + forHash(artistId) + "/" + forHash(item.artist);
      var albumId = album.data("matched-id") || "";
      if (albumId || item.album) item.albumLink = "album/" + forHash(albumId) + "/" + forHash(album.data("album-artist") || "") + "/" + forHash(item.album);
    }
    return item;
  }

  function parseCards(parser, parent, end, cb) {
    var pageCount = parseInt(parent.data("row-count"));
    var cardsPerPage = parseInt(parent.data("cards-per-page")) || parent.find(".cluster-page:first .material-card").length;
    var update = false;
    var lastIndex = -1;
    var lastPageNum = -1;
    function loadNextCards() {
      var firstPage = parent.find(".cluster-page:first");
      if (!update && pageCount && cb && firstPage[0] && firstPage.data("page-num") !== 0) {//not yet there
        asyncListTimer = scrollAndContinue(firstPage[0], loadNextCards, true);
        return;
      }
      var items = [];
      var lastLoaded = null;
      parent.find(".material-card").slice(0, end).each(function() {
        var card = $(this);
        var page = card.closest(".cluster-page");
        lastLoaded = page[0];
        var pageNum = parseInt(page.data("page-num"));
        var index = cardsPerPage * pageNum + page.find(".material-card").index(card);
        if (index <= lastIndex) return;
        lastPageNum = pageNum;
        var item = parser(card);
        if (item) {
          item.index = index;
          items.push(item);
          lastIndex = index;
        }
      });
      if (!cb) return items;

      if (!update || items.length) {
        cb(items, update);
        update = true;
      }
      if (lastLoaded && pageCount && lastPageNum + 1 < pageCount && (end === undefined || lastIndex + 1 < end)) asyncListTimer = scrollAndContinue(lastLoaded, loadNextCards, false);
      else restoreActiveTab(loadNextCards);
    }
    return loadNextCards();
  }

  /** parse handlers for the different list types (playlistsList, playlist or albumContainers) */
  var parseNavigationList = {
    playlistsList: function(parent, end, cb, omitUnknownAlbums) {
      return parseCards(function(card) {
        var id = card.data("id");
        if (omitUnknownAlbums && id.substr(1).indexOf("/") < 0) return null;
        var item = {};
        item.titleLink = getLink(card);
        if (!item.titleLink) return null;
        item.cover = parseCover(card.find(".image-wrapper img"));
        item.title = $.trim(card.find(".title").text());
        var subTitle = card.find(".sub-title");
        item.subTitle = $.trim(subTitle.text());
        item.subTitleLink = getLink(subTitle);
        return item;
      }, parent, end, cb);
    },
    playlist: function(parent, end, cb) {
      var queue = !!parent.closest("#queueContainer").length;
      var selectedRatings = [];
      var ci;
      if (!queue) {
        listRatings = listRatings || [];
        ci = getClusterIndex(parent);
      }
      var count = parent.find("[data-count]").data("count");
      var update = false;
      var lastIndex = -1;
      function loadNextSongs() {
        if (queue) queueRatings = selectedRatings;
        else listRatings[ci] = selectedRatings;
        var rows = parent.find(".song-row");
        if (!update && count && cb && rows[0] && rows.first().data("index") !== 0) {//not yet there
          asyncListTimer = scrollAndContinue(rows[0], loadNextSongs, true);
          return;
        }
        //scroll to last needed song row to trigger lazy loading
        var playlist = [];
        var lastLoaded = null;
        rows.slice(0, end).each(function() {
          if (pausePlaylistParsing) return false;
          var song = $(this);
          lastLoaded = this;
          if (song.data("index") <= lastIndex) return;
          var item = parseSongRow(song);
          if (song.find(".song-indicator").length) item.current = true;
          item.rating = parseRating(song.find("td[data-col='rating']")[0]);
          lastIndex = item.index;
          selectedRatings.push(item.rating);
          playlist.push(item);
        });
        if (!cb) return playlist;

        if (!update || playlist.length) {
          cb(playlist, update);
          update = true;
        }
        if (count && lastIndex + 1 < count && (end === undefined || lastIndex + 1 < end)) {
          if (pausePlaylistParsing) {
            resumePlaylistParsingFn = loadNextSongs;
          } else {
            if (lastLoaded) {
              //avoid conflicts with DOMSubtreeModified handler that listens for list rating changes
              if (queue) queueRatings = null;
              else listRatings[ci] = null;
              lastLoaded.scrollIntoView(false);
              needActiveTab(loadNextSongs);
            }
            asyncListTimer = setTimeout(loadNextSongs, 150);
          }
        } else restoreActiveTab(loadNextSongs);
      }
      if (!cb) return loadNextSongs();
      pausePlaylistParsing = false;
      loadNextSongs();
    },
    albumContainers: function(parent, end, cb) {
      return parseCards(function(card) {
        var link = getLink(card);
        return link ? {
          cover: parseCover(card.find(".image-inner-wrapper img")),
          title: $.trim(card.find(".details .title").text()),
          link: link
        } : null;
      }, parent, end, cb);
    }
  };

  /** Send the user's playlists to bp. */
  function sendMyPlaylists() {
    var playlists = [];
    $("#playlists").children("a").each(function() {
      playlists.push({ title: $.trim($(this).find(".tooltip").text()), titleLink: getLink($(this)) });
    });
    post("player-navigationList", { type: "playlistsList", link: "myPlaylists", list: playlists, empty: !playlists.length });
  }

  /** @return the type of list for a hash value ("playlistsList" [e.g. artist page showing albums], "playlist" [e.g. album page] or "albumContainers" [e.g. genre page showing artists]) */
  function getListType(hash) {
    var i = hash.indexOf("/");
    if (i > 0) hash = hash.substring(0, i);
    switch (hash) {
    case "artists":
    case "genres":
    case "srar":
    case "sarrar":
      return "albumContainers";
    case "now":
    case "albums":
    case "artist":
    case "wta":
    case "wnr":
    case "sar":
    case "tg":
    case "sral":
    case "srp":
    case "saral":
    case "ar":
      return "playlistsList";
    default:
      return "playlist";
    }
  }

  /** @return parsed sublist (e.g. found albums on search page) or null if no matching content found */
  function parseSublist(cont) {
    var type;
    var filter = subclusterFilter(cont);
    var listParent = cont.find(".song-table").filter(filter);
    if (listParent.length) type = "playlist";
    else {
      //look at first ".material-card" and check its type, our type must be one step higher in the hierarchy
      var firstCard = cont.find(".material-card").filter(filter).first();
      var cardType = firstCard.data("type");
      if (!cardType) return null;//maybe no ".material-card" found
      type = getListType(cardType) == "playlist" ? "playlistsList" : "albumContainers";
      listParent = firstCard.closest(".material-cluster");
    }
    var list = parseNavigationList[type](listParent, 10);
    if (!list.length) return null;
    return {
      list: list,
      type: type,
      header: $.trim(cont.find(".header .title").filter(filter).text()) || $.trim(cont.find(".section-header").filter(filter).text()),
      moreLink: cont.hasClass("has-more") ? getLink(cont) : null,
      cluster: getClusterIndex(cont)
    };
  }

  function sendMixed(response) {
    var view = $("#music-content");
    response.type = "mixed";
    response.lists = [];
    response.moreText = $.trim(view.find("div .header .more:visible").first().text());
    response.header = $.trim($("#header-tabs-container .header-tab-title.selected:visible").text()) || $.trim($("#breadcrumbs .tab-text:visible").text()) || $.trim($("#header-tabs-container .genre-dropdown-title .dropdown-title-text:visible").text());
    view.find(CLUSTER_SELECTOR).addBack().each(function() {
      var list = parseSublist($(this));
      if (list) response.lists.push(list);
    });
    response.empty = !response.lists.length;
    post("player-navigationList", response);
  }

  /** Select, parse and send a list to bp. */
  function sendNavigationList(link, omitUnknownAlbums) {
    selectAndExecute(link, function(error) {
      var response = { link: link, controlLink: location.hash };
      function sendError() {
        response.error = true;
        post("player-navigationList", response);
      }
      if (error) {
        sendError();
      } else if (!link.indexOf("artist/") || !link.indexOf("sr/") || !link.indexOf("wtc/") || !link.indexOf("wms/")) {
        sendMixed(response);
      } else {
        var autoQueueList = isAutoQueueList(link);
        var type = getListType(link);
        //check if we are on a page with correct type
        //e.g. in recommendations list the album link might not work in which case we get redirected to albums page
        if (autoQueueList || type == getListType(location.hash.substr(2))) {
          response.type = type;
          var contentId = "#music-content";
          if (autoQueueList) {
            contentId = "#queueContainer";
            response.controlLink = "#/ap/queue";
          }
          parseNavigationList[type]($(contentId).find(".material-cluster,.song-table").first(), undefined, function(list, update) {
            response.list = list;
            response.update = update;
            response.empty = !list.length;
            post("player-navigationList", response);
          }, omitUnknownAlbums);
        } else {
          sendError();
        }
      }
    });
  }

  /** Try to find and resume the last played song from previous session. */
  function resumeSong(msg, error) {
    if (error) return;
    var topFound = false;
    function sendResume() {
      var rows = $("#music-content .song-row");
      if (rows.length) {
        if (!topFound) {
          if (rows[0] && rows.first().data("index") !== 0) {
            asyncListTimer = scrollAndContinue(rows[0], sendResume, true);
            return;
          }
          topFound = true;
        }
        var found = false;
        rows.each(function() {
          var song = parseSongRow($(this));
          if (areSongsEqual(song, msg)) {
            found = true;
            sendCommand("resumePlaylistSong", { index: song.index, position: msg.position });
            return false;
          }
        });
        var last = found || rows.last();
        console.debug("resumeSong - last", last);
        if (!found && last[0] && last.data("index") < last.parent().data("count") - 1) asyncListTimer = scrollAndContinue(last[0], sendResume, false);
        else restoreActiveTab(sendResume);
      } else console.debug("resumeSong - no rows");
    }
    sendResume();
  }

  port = chrome.runtime.connect({ name: "googlemusic" });
  port.onDisconnect.addListener(cleanup);
  port.onMessage.addListener(function(msg) {
    console.debug("bp->cs: ", msg);
    switch (msg.type) {
    case "execute":
      if (msg.command == "startPlaylistSong" || msg.command == "ratePlaylistSong") sendPlaylistRowCommand(msg.command, msg.options);
      else sendCommand(msg.command, msg.options);
      break;
    case "getNavigationList":
      clearTimeout(asyncListTimer);
      listRatings = null;
      if (msg.link == "myPlaylists") sendMyPlaylists();
      else sendNavigationList(msg.link, msg.omitUnknownAlbums);
      break;
    case "selectLink":
      selectAndExecute(msg.link);
      break;
    case "startPlaylist":
      selectAndExecute(msg.link, function(error) {
        //types im, st, sm and situations start automatically
        if (!error && !isAutoQueueList(msg.link)) sendCommand("startPlaylist");
      });
      break;
    case "resumeLastSong":
      selectAndExecute(msg.albumLink, resumeSong.bind(window, msg));
      break;
    case "lyrics":
      renderLyrics(msg.result, msg.providers, msg.srcUrl);
      break;
    case "feelingLucky":
      selectAndExecute("now", sendCommand.bind(window, "feelingLucky"));
      break;
    case "connected":
      init();
      break;
    case "connectedIndicator":
      if (msg.show) showConnectedIndicator();
      else hideConnectedIndicator();
      break;
    case "lyricsState":
      if (msg.enabled) enableLyrics(msg.fontSize, msg.width);
      else disableLyrics();
      lyricsAutoReload = msg.autoReload;
      break;
    case "starRatingMode":
      toggleStarRatingMode(msg.value);
      break;
    case "setConfirmClose":
      setConfirmClose(msg.confirmClose);
      break;
    case "alreadyConnected":
      port.disconnect();
      port = null;
      break;
    }
  });
});
