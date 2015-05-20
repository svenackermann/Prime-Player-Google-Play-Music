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

$(function() {
  var port;
  var observers = [];
  var executeOnContentLoad;
  var contentLoadDestination;
  var listRatings;
  var asyncListTimer;
  var pausePlaylistParsing = false;
  var resumePlaylistParsingFn;
  var lyricsAutoReload = false;
  var lyricsAutoReloadTimer;
  var position;
  var currentRating = -1;
  var ratedInGpm = 0;
  var CLUSTER_SELECTOR = ".cluster,.genre-stations-container";
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
        .toggleClass("active", !!$("#player-song-title").length)
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

  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    sendCommand("cleanup");
    window.removeEventListener("message", onMessage);
    $("#primeplayerinjected").remove();
    $("#music-content").off("DOMSubtreeModified mouseup");
    $("#playerSongInfo").off("click");
    $(window).off("hashchange");
    observers.forEach(function(o) { o.disconnect(); });
    hideConnectedIndicator();
    disableLyrics();
    port = null;
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
    if ($("#playerSongInfo").find("div").length) {
      var artist = $("#player-artist");
      var album = $("#playerSongInfo").find(".player-album");
      var albumId = album.data("id");
      var info = {
        artist: $.trim(artist.text()),
        title: $.trim($("#player-song-title").text()),
        album: $.trim(album.text()),
        albumArtist: albumId && parseHash(albumId.split("/")[1]),
        duration: $.trim($("#time_container_duration").text())
      };
      if (extended) {
        info.artistLink = getLink(artist) || "artist//" + forHash(info.artist);
        info.albumLink = getLink(album);
        info.cover = parseCover($("#playingAlbumArt"));
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

  /** add listeners/observers and extend DOM */
  function init() {
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
      if (info && lyricsAutoReload && $("#ppLyricsContainer").is(":visible")) {
        clearTimeout(lyricsAutoReloadTimer);
        lyricsAutoReloadTimer = setTimeout(loadLyrics, 1000);
      }
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

    /** @return null if play button is disabled or true/false if a song is playing/paused */
    function playingGetter(el) {
      var play = $(el);
      return play.is(":disabled") ? null : play.hasClass("playing");
    }

    /** @return shuffle state (NO_SHUFFLE/ALL_SHUFFLE) or null if shuffle is not available */
    function shuffleGetter(el) {
      return $(el).is(":disabled") ? null : el.getAttribute("value");
    }

    function sendRating() {
      sendCommand("getRating");
    }

    /** Execute 'executeOnContentLoad' (if set) when #queue-container is changed. */
    function queueLoaded() {
      if (contentLoadDestination == "ap/queue" && $.isFunction(executeOnContentLoad)) {
        var fn = executeOnContentLoad;
        executeOnContentLoad = null;
        contentLoadDestination = null;
        fn();
      }
    }

    /** Execute 'executeOnContentLoad' (if set) when #music-content is changed. */
    function musicContentLoaded() {
      if ($.isFunction(executeOnContentLoad)) {
        if (contentLoadDestination && location.hash != "#/" + contentLoadDestination) return;//wait til we are on the correct page
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
    function watchContent(fn, selector, timeout) {
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
        observer.observe(content[0], { childList: true, subtree: true });
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

    watchContent(sendSong, "#playerSongInfo", 500);
    watchContent(sendRating, "#playerSongInfo", 250);
    watchContent(sendPosition, "#time_container_current");
    watchContent(musicContentLoaded, "#music-content", 1000);
    watchContent(queueLoaded, "#queue-container", 1000);
    watchAttr("class disabled", "#player > div.material-player-middle > [data-id='play-pause']", "player-playing", playingGetter, 500);
    watchAttr("value", "#player > div.material-player-middle > [data-id='repeat']", "player-repeat");
    watchAttr("value", "#player > div.material-player-middle > [data-id='shuffle']", "player-shuffle", shuffleGetter);
    watchAttr("aria-valuenow", "#material-vslider", "player-volume");

    $("#music-content").on("DOMSubtreeModified", ".song-row td[data-col='rating']", function() {
      if (listRatings) {
        var rating = parseRating(this);
        var td = $(this);
        var index = td.closest(".song-row").data("index");
        var cluster = getClusterIndex(td);
        var clusterRatings = listRatings[cluster];
        if (clusterRatings && clusterRatings[index] != rating) {
          clusterRatings[index] = rating;
          post("player-listrating", { index: index, cluster: cluster, rating: rating, controlLink: location.hash });
        }
      }
    });
    $(window).on("hashchange", function() {
      listRatings = null;
      resumePlaylistParsingFn = null;
      pausePlaylistParsing = false;
      clearTimeout(asyncListTimer);
    });

    $("#playerSongInfo").on("click", ".rating-container > *[data-rating]", function(e) {
      //when click is simulated by injected script, clientX will be 0
      if (e.clientX) ratedInGpm = parseRating(e);
    });
    //listen for "mouseup", because "click" won't bubble up to "#music-content" and we can't attach this directly to ".rating-container" because it's dynamically created
    $("#music-content").on("mouseup", ".song-row td[data-col='rating'] ul.rating-container li:not(.selected)[data-rating]", function() {
      post("rated", { song: parseSongRow($(this).closest(".song-row"), true), rating: parseRating(this) });
    });

    window.addEventListener("message", onMessage);
    //we must add this script to the DOM for the code to be executed in the correct context
    $("<script id='primeplayerinjected'></script>").attr("src", getExtensionUrl("js/injected.js")).appendTo("head");

    var sendConnectedInterval;
    function sendConnected() {
      if (!$("#loading-progress").is(":visible")) {
        clearInterval(sendConnectedInterval);
        var ql = {};
        var nav = $("#nav_collections");
        ql.now = $.trim(nav.children("a[data-type='now']").text());
        ql.rd = $.trim(nav.children("a[data-type='rd']").text());
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
    sendConnected();
  }

  /** callback for messages from the injected script */
  function onMessage(event) {
    // We only accept messages from the injected script
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER" || !event.data.msg) return;
    console.debug("inj->cs: ", event.data);
    switch (event.data.msg) {
    case "rating":
      if (currentRating !== event.data.rating) {
        currentRating = event.data.rating;
        //post player-listrating if neccessary, we must check all song rows (not just the current playing), because if rated "1", the current song changes immediately
        if (listRatings) $("#music-content .song-row td[data-col='rating']").trigger("DOMSubtreeModified");
        post("song-rating", currentRating);
        if (ratedInGpm > 0 && ratedInGpm === currentRating) post("rated", { song: parseSongInfo(), rating: currentRating });
        ratedInGpm = 0;
      }
      break;
    case "plSongRated":
      $("#music-content .song-row[data-index='" + event.data.index + "']").find("td[data-col='rating']").trigger("DOMSubtreeModified");
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

  /** Send a command for a playlist row to the injected script. Ensures that the row is visible. */
  function sendPlaylistRowCommand(command, options) {
    if (location.hash != options.link) return;
    var body = $("#music-content");
    if (options.cluster) body = $(body.find(CLUSTER_SELECTOR)[options.cluster - 1]);
    body = body.find(".song-table > tbody").filter(subclusterFilter(body));
    if (!body.length || options.index > body.data("count") - 1) return;
    pausePlaylistParsing = true;
    /* jshint -W082 */
    function callForRow() {//make sure row with requested index is available
      var rows = body.find(".song-row");
      var scrollToRow;
      if (rows.first().data("index") > options.index) scrollToRow = rows[0];
      else if (rows.last().data("index") < options.index) scrollToRow = rows.last()[0];
      if (scrollToRow) {
        scrollToRow.scrollIntoView(true);
        setTimeout(callForRow, 50);
      } else {
        sendCommand(command, options);
      }
    }
    callForRow();
  }

  function isAutoQueueList(link) {
    return link == "ap/queue" || !link.indexOf("im/") || !link.indexOf("st/") || !link.indexOf("sm/") || !link.indexOf("situations/");
  }

  /**
   * Click a card to start a playlist. Should always lead to the queue.
   * @return true, if the card was found
   */
  function clickListCard(hash) {
    var id = hash.substr(hash.indexOf("/") + 1);
    var type = hash.substr(0, hash.indexOf("/"));
    if ($(".card[data-id='" + id + "'][data-type='" + type + "']").length) {
      contentLoadDestination = "ap/queue";
      sendCommand("clickCard", { id: id });
      return true;
    }
    return false;
  }

  /** Set the hash to the given value to navigate to another page and call the function when finished. */
  function selectAndExecute(hash, cb) {
    if (location.hash == "#/" + hash) {
      if (cb) cb();
    } else if (hash == "ap/queue") {
      if ($("#queue-container").is(":visible")) {
        if (cb) cb();
      } else {
        executeOnContentLoad = cb;
        contentLoadDestination = "ap/queue";
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
        contentLoadDestination = !hash.indexOf("im/") ? "ap/queue" : hash;//type im is automatically started
        location.hash = "/" + hash;
      }
    }
  }

  /** @return parsed song info for a playlist row */
  function parseSongRow(song, basic) {
    var title = song.find("td[data-col='title'] .content");
    var artist = song.find("td[data-col='artist']");
    var album = song.find("td[data-col='album']");
    var item = {
      title: $.trim(title.text()),
      artist: $.trim(artist.find(".content").text()),
      album: $.trim(album.find(".content").text())
    };
    var duration = $.trim(song.find("td[data-col='duration']").text());
    if (/^\d\d?(\:\d\d)*$/.test(duration)) item.duration = duration;//no real duration on recommendation page
    if (!basic) {
      item.index = song.data("index");
      item.cover = parseCover(title.find("img"));
      var artistId = artist.data("matched-id") || "";
      if (item.artist || artistId) item.artistLink = "artist/" + forHash(artistId) + "/" + forHash(item.artist);
      var albumId = album.data("matched-id") || "";
      if (albumId || item.album) item.albumLink = "album/" + forHash(albumId) + "/" + forHash(album.data("album-artist") || "") + "/" + forHash(item.album);
    }
    return item;
  }

  /** parse handlers for the different list types (playlistsList, playlist or albumContainers) */
  var parseNavigationList = {
    playlistsList: function(parent, end, cb, omitUnknownAlbums) {
      var playlists = [];
      parent.children(".card").slice(0, end).each(function() {
        var card = $(this);
        var id = card.data("id");
        if (omitUnknownAlbums && id.substr(1).indexOf("/") < 0) return;
        var item = {};
        item.titleLink = getLink(card);
        if (item.titleLink === null) return;
        item.cover = parseCover(card.find(".image-wrapper img"));
        item.title = $.trim(card.find(".title").text());
        var subTitle = card.find(".sub-title");
        item.subTitle = $.trim(subTitle.text());
        item.subTitleLink = getLink(subTitle);
        playlists.push(item);
      });
      if (!cb) return playlists;
      cb(playlists);
    },
    playlist: function(parent, end, cb) {
      listRatings = listRatings || [];
      var ci = getClusterIndex(parent);
      var clusterRatings = [];
      var count = parent.find("[data-count]").data("count");
      var update = false;
      var lastIndex = -1;
      function loadNextSongs() {
        listRatings[ci] = clusterRatings;
        var rows = parent.find(".song-row");
        if (!update && count && rows.first().data("index") !== 0) {//not yet there
          parent.scrollTop(0);
          asyncListTimer = setTimeout(loadNextSongs, 150);
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
          clusterRatings.push(item.rating);
          playlist.push(item);
        });
        if (!cb) {
          return playlist;
        }
        if (!update || playlist.length) {
          cb(playlist, update);
          update = true;
        }
        if (count && lastIndex + 1 < count && (end === undefined || lastIndex + 1 < end)) {
          if (pausePlaylistParsing) {
            resumePlaylistParsingFn = loadNextSongs;
          } else {
            if (lastLoaded) {
              listRatings[ci] = null;//avoid conflicts with DOMSubtreeModified handler that listens for list rating changes
              lastLoaded.scrollIntoView(true);
            }
            asyncListTimer = setTimeout(loadNextSongs, 150);
          }
        }
      }
      if (!cb) return loadNextSongs();
      pausePlaylistParsing = false;
      loadNextSongs();
    },
    albumContainers: function(parent, end, cb) {
      var items = [];
      parent.children(".card").slice(0, end).each(function() {
        var card = $(this);
        var item = {};
        var img = card.find(".image-inner-wrapper img:first");
        if (img.attr("src").indexOf("/default_artist.png") < 0) item.cover = parseCover(img);
        item.title = $.trim(card.find(".details .title").text());
        item.link = getLink(card);
        items.push(item);
      });
      if (!cb) return items;
      cb(items);
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
    case "rd":
    case "artist":
    case "sar":
    case "tg":
    case "sral":
    case "srp":
    case "saral":
    case "ar":
    case "exprec":
    case "expnew":
      return "playlistsList";
    case "exptop": //depend on content
    case "expgenremore":
      return $("#music-content .song-table").length ? "playlist" : "playlistsList";
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
      //look at first ".card" and check its type, our type must be one step higher in the hierarchy
      var firstCard = cont.find(".card").filter(filter).first();
      var cardType = firstCard.data("type");
      if (!cardType) return null;//maybe no ".card" found
      type = getListType(cardType) == "playlist" ? "playlistsList" : "albumContainers";
      listParent = firstCard.parent();
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
      } else if (link == "exptop" || link == "exprec" || link == "rd" || !link.indexOf("expgenres/") || !link.indexOf("artist/") || !link.indexOf("sr/")) {
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
            contentId = "#queue-container";
            response.controlLink = "#/ap/queue";
          }
          parseNavigationList[type]($(contentId).find(":has(>.card),.song-table"), undefined, function(list, update) {
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
          if (rows.first().data("index") !== 0) {
            $("#music-content").scrollTop(0);
            asyncListTimer = setTimeout(sendResume, 150);
            return;
          }
          topFound = true;
        }
        var found = false;
        rows.each(function() {
          var song = parseSongRow($(this));
          if (song.title == msg.title && song.duration == msg.duration && (!song.artist || !msg.artist || song.artist == msg.artist)) {
            found = true;
            sendPlaylistRowCommand("resumePlaylistSong", { index: song.index, position: msg.position, link: location.hash });
            return false;
          }
        });
        var last = found || rows.last();
        if (!found && last.data("index") < last.parent().data("count") - 1) {
          last[0].scrollIntoView(true);
          asyncListTimer = setTimeout(sendResume, 150);
        }
      }
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
    case "alreadyConnected":
      port.disconnect();
      port = null;
      break;
    }
  });
});
