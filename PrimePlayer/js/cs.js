/**
 * Content script to be injected to Google Play Music.
 * This watches the DOM for relevant changes and notifies the background page.
 * It also delivers commands to the Google Play Music window.
 * @author Sven Ackermann (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
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
  
  /** send update to background page */
  function post(type, value) {
    if (port) {
      port.postMessage({type: type, value: value});
    }
  }
  
  function forHash(text) {
    return encodeURIComponent(text).replace(/%20/g, "+");
  }
  
  /** @return link (for hash) constructed from attributes data-type and data-id */
  function getLink(el) {
    if (el.data("id")) {
      return el.data("type") + "/" + el.data("id");
    }
    return null;
  }
  
  function parseCover(el) {
    var cover = el.attr("src");
    if (cover && cover.indexOf("/default_album_med.png") > 0) return null;
    if (cover && cover.indexOf("//") == 0) cover = "https:" + cover;
    return cover;
  }
  
  function parseRating(ratingContainer, onNullRating) {
    if (ratingContainer == null) return (typeof onNullRating == "number") ? onNullRating : -1;
    var rating = parseInt(ratingContainer.dataset.rating);
    return isNaN(rating) ? 0 : rating;
  }
  
  function showConnectedIndicator() {
    //inject icon with title to mark the tab as connected
    $(".music-banner-icon")
      .addClass("ppconnected")
      .attr("title", chrome.i18n.getMessage("connected"))
      .unbind().click(function() {
        port.disconnect();
        cleanup();
      });
  }
  
  function hideConnectedIndicator() {
    $(".music-banner-icon").removeAttr("title").removeClass("ppconnected").off("click");
  }
  
  function renderLyrics(result) {
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
      if (result.src) credits.append($("<a target='_blank'></a>").attr("href", result.src).text(chrome.i18n.getMessage("lyricsSrc"))).append($("<br/>"));
      if (result.searchSrc) credits.append($("<a target='_blank'></a>").attr("href", result.searchSrc).text(chrome.i18n.getMessage("lyricsSearchResult")));
    }
  }
  
  function loadLyrics() {
    $("#ppLyricsTitle").children("div").removeAttr("title").empty();
    $("#ppLyricsContent").empty();
    $("#ppLyricsCredits").empty();
    $("#ppLyricsContainer").addClass("loading").show();
    post("loadLyrics");
  }
  
  function contentResize() {
    $("#content").css("width", ($("#content-container").width() - $("#ppLyricsContainer").width() - 10) + "px");
  }
  
  function resetContentResize() {
    $(window).off("resize", contentResize);
    $("#content").removeAttr("style");
  }
  
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
  
  function disableLyrics() {
    $("#ppLyricsButton, #ppLyricsContainer").remove();
    resetContentResize();
  }
  
  function enableLyrics(fontSize, width) {
    if ($("#ppLyricsButton").length == 0) {
      $("<img id='ppLyricsButton'/>")
        .attr("src", chrome.extension.getURL("img/toast/openLyrics.png"))
        .attr("title", chrome.i18n.getMessage("command_openLyrics"))
        .toggleClass("active", $("#playerSongInfo").find("div").length > 0)
        .click(toggleLyrics)
        .appendTo("#player-right-wrapper");
      $("<div id='ppLyricsContainer'><div id='ppLyricsTitle'><a class='reloadLyrics'></a><div></div></div><div id='ppLyricsScroller'><div id='ppLyricsContent'></div><div id='ppLyricsCredits'></div></div></div>")
        .on("click", ".reloadLyrics", loadLyrics)
        .insertAfter("#content");
    }
    $("#ppLyricsContainer").css({"font-size": fontSize + "px", width: width});
    if ($("#ppLyricsContainer").is(":visible")) {
      contentResize();
    }
  }
  
  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    sendCommand("cleanup");
    window.removeEventListener("message", onMessage);
    $("#primeplayerinjected").remove();
    $("#main").off("DOMSubtreeModified");
    $(window).off("hashchange");
    for (var i = 0; i < observers.length; i++) {
      observers[i].disconnect();
    }
    hideConnectedIndicator();
    disableLyrics();
    port = null;
  }
  
  /** add listeners/observers and extend DOM */
  function init() {
    if ($("#primeplayerinjected").length > 0) {
      //cleanup old content script
      function onCleanupCsDone(event) {
        if (event.source == window && event.data.type == "FROM_PRIMEPLAYER" && event.data.msg == "cleanupCsDone") {
          window.removeEventListener("message", onCleanupCsDone);
          init();
        }
      }
      window.addEventListener("message", onCleanupCsDone);
      window.postMessage({ type: "FROM_PRIMEPLAYER", msg: "cleanupCs" }, location.href);
      return;//wait for callback
    }
  
    //when rating is changed, the page gets reloaded, so no need for event listening here
    var ratingMode;
    var ratingContainer = $("#player-right-wrapper > div.player-rating-container > ul.rating-container");
    if (ratingContainer.hasClass("thumbs")) ratingMode = "thumbs";
    else if (ratingContainer.hasClass("stars")) ratingMode = "star";
    ratingContainer = null;
    post("player-ratingMode", ratingMode);
    
    var ql = {};
    var nav = $("#nav_collections");
    ql.now = $.trim(nav.children("li[data-type='now']").text());
    ql.rd = $.trim(nav.children("li[data-type='rd']").text());
    var br = $("#browse-tabs");
    ql.artists = $.trim(br.children("div[data-type='artists']").text());
    ql.albums = $.trim(br.children("div[data-type='albums']").text());
    ql.genres = $.trim(br.children("div[data-type='genres']").text());
    $("#auto-playlists").children("li").each(function() {
      ql[getLink($(this))] = $.trim($(this).find("div.tooltip").text());
    });
    ql.searchPlaceholder = $.trim($("#oneGoogleWrapper input[name='q']").attr("placeholder"));
    post("player-quicklinks", ql);
    
    function sendSong() {
      var info = null;
      if ($("#playerSongInfo").find("div").length > 0) {
        var artist = $("#player-artist");
        var album = $("#playerSongInfo").find(".player-album");
        var cover = parseCover($("#playingAlbumArt"));
        info = {
          duration: $.trim($("#time_container_duration").text()),
          title: $.trim($("#playerSongTitle").text()),
          artist: $.trim(artist.text()),
          artistLink: getLink(artist) || "artist//" + forHash($.trim(artist.text())),
          album: $.trim(album.text()),
          albumLink: getLink(album),
          cover: cover
        };
        if (lyricsAutoReload && $("#ppLyricsContainer").is(":visible")) {
          clearTimeout(lyricsAutoReloadTimer);
          lyricsAutoReloadTimer = setTimeout(loadLyrics, 1000);
        }
      }
      $("#ppLyricsButton").toggleClass("active", info != null);
      post("song-info", info);
    }
    
    function sendPosition(el) {
      var parsed = $.trim(el.text());
      if (parsed != position) {
        position = parsed;
        post("song-position", position);
      }
    }
    
    function playingGetter(el) {
      var play = $(el);
      return play.is(":disabled") ? null : play.hasClass("playing");
    }
    
    function shuffleGetter(el) {
      return $(el).is(":disabled") ? null : el.value;
    }
    
    function ratingGetter(el) {
      //post player-listrating if neccessary, we must check all song rows (not just the current playing), because if rated "1", the current song changes immediately
      if (listRatings) $("#main .song-row td[data-col='rating']").trigger("DOMSubtreeModified");
      var container = $(el.parentElement);
      if (container.is(":visible")) return parseRating(container.children("li.selected").get(0), 0);
      return -1;
    }
    
    function mainLoaded() {
      if (typeof(executeOnContentLoad) == "function") {
        if (contentLoadDestination && location.hash != contentLoadDestination) return;//wait til we are on the correct page
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
      if (content.length > 0) {
        var listener = fn.bind(window, content);
        if (timeout) {
          var contentTimer;
          listener = function() {
            clearTimeout(contentTimer);
            contentTimer = setTimeout(function() {
              contentTimer = null;
              fn(content);
            }, timeout);//wait til the DOM manipulation is finished
          };
        }
        
        var observer = new MutationObserver(function (mutations) { mutations.forEach(listener); });
        observers.push(observer);
        observer.observe(content.get(0), { childList: true, subtree: true });
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
     */
    function watchAttr(attrs, selector, type, getValue) {
      var element = $(selector).get(0);
      if (element) {
        if (getValue == undefined) {
          getValue = function(el, attr) {return el.getAttribute(attr)};
        }
        var observer = new MutationObserver(function (mutations) {
          mutations.forEach(function(mutation) { post(type, getValue(mutation.target, mutation.attributeName)); });
        });
        observers.push(observer);
        observer.observe(element, { attributes: true, attributeFilter: attrs.split(" ") });
        post(type, getValue(element, attrs));//trigger once to initialize the info
      } else {
        console.error("element does not exist (did Google change their site?): " + selector);
      }
    }
    
    watchContent(sendSong, "#playerSongInfo", 500);
    watchContent(sendPosition, "#time_container_current");
    watchContent(mainLoaded, "#main", 500);
    watchAttr("class disabled", "#player > div.player-middle > button[data-id='play-pause']", "player-playing", playingGetter);
    watchAttr("value", "#player > div.player-middle > button[data-id='repeat']", "player-repeat");
    watchAttr("value", "#player > div.player-middle > button[data-id='shuffle']", "player-shuffle", shuffleGetter);
    watchAttr("class", "#player-right-wrapper > .player-rating-container ul.rating-container li", "song-rating", ratingGetter);
    watchAttr("aria-valuenow", "#vslider", "player-volume");
    
    $("#main").on("DOMSubtreeModified", ".song-row td[data-col='rating']", function() {
      if (listRatings) {
        var rating = parseRating(this);
        var index = $(this.parentNode).data("index");
        if (listRatings[index] != rating) {
          listRatings[index] = rating;
          post("player-listrating", {index: index, rating: rating, controlLink: location.hash});
        }
      }
    });
    $(window).on("hashchange", function() {
      listRatings = null;
      resumePlaylistParsingFn = null;
      pausePlaylistParsing = false;
      clearTimeout(asyncListTimer);
    });
    
    window.addEventListener("message", onMessage);
    //we must add this script to the DOM for the code to be executed in the correct context
    $("<script id='primeplayerinjected' type='text/javascript'></script>").attr("src", chrome.extension.getURL("js/injected.js")).appendTo("head");
    
    var sendConnectedInterval;
    function sendConnected() {
      if (!$("#loading-progress").is(":visible")) {
        clearInterval(sendConnectedInterval);
        post("player-connected", true);
      }
    }
    sendConnectedInterval = setInterval(sendConnected, 500);
    sendConnected();
  }
  
  function onMessage(event) {
    // We only accept messages from the injected script
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER" || !event.data.msg) return;
    switch (event.data.msg) {
      case "playlistSongRated":
        $("#main .song-row[data-index='" + event.data.index + "']").find("td[data-col='rating']").trigger("DOMSubtreeModified");
      case "playlistSongStarted":
      case "playlistSongError":
        pausePlaylistParsing = false;
        if (typeof(resumePlaylistParsingFn) == "function") resumePlaylistParsingFn();
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
    if (command == "startPlaylistSong" || command == "ratePlaylistSong") {
      if (location.hash != options.link) return;
      var body = $("#main .song-table > tbody");
      if (!body[0] || options.index > body.data("count") - 1) return;
      pausePlaylistParsing = true;
      function callForRow() {//make sure row with requested index is available
        var rows = body.find(".song-row");
        var scrollToRow;
        if (rows.first().data("index") > options.index) scrollToRow = rows[0];
        else if (rows.last().data("index") < options.index) scrollToRow = rows.last()[0];
        if (scrollToRow) {
          scrollToRow.scrollIntoView(true);
          setTimeout(callForRow, 50);
        } else {
          window.postMessage({ type: "FROM_PRIMEPLAYER", command: command, options: options }, location.href);
        }
      }
      callForRow();
    } else window.postMessage({ type: "FROM_PRIMEPLAYER", command: command, options: options }, location.href);
  }
  
  function clickListCard(listId) {
    if ($(".card[data-id='" + listId + "'][data-type='st']").length > 0) {
      contentLoadDestination = "#/ap/queue";
      sendCommand("clickCard", {id: listId});
      return true;
    }
    return false;
  }
  
  /** Set the hash to the given value to navigate to another page and call the function when finished. */
  function selectAndExecute(hash, callback) {
    if (location.hash == "#/" + hash) {//we're already here
      if (callback) callback();
    } else {
      executeOnContentLoad = callback;
      contentLoadDestination = null;
      if (hash.indexOf("st/") == 0) {//setting hash does not work for type "st"
        var listId = hash.substr(3);
        if (!clickListCard(listId)) {
          selectAndExecute("rd", function() {//try to find it on the mixes page
            executeOnContentLoad = callback;//set again (was overwritten by the recursive call)
            if (!clickListCard(listId)) {//still not found
              executeOnContentLoad = null;
              if (callback) callback(true);
            }
          });
        }
      } else {
        location.hash = "/" + hash;
      }
    }
  }
  
  function parseSongRow(song) {
    var item = {};
    item.index = song.data("index");
    var title = song.find("td[data-col='title'] .content");
    item.cover = parseCover(title.find("img"));
    item.title = $.trim(title.text());
    var artist = song.find("td[data-col='artist']");
    item.artist = $.trim(artist.find(".content").text());
    var arId = artist.data("matched-id") || "";
    if (item.artist || arId) item.artistLink = "artist/" + forHash(arId) + "/" + forHash(item.artist);
    var album = song.find("td[data-col='album']");
    item.album = $.trim(album.find(".content").text());
    var alAr = album.data("album-artist") || "";
    var alId = album.data("matched-id") || "";
    if (alId || item.album && typeof(alAr) == "string") item.albumLink = "album/" + forHash(alId) + "/" + forHash(alAr) + "/" + forHash(item.album);
    var duration = $.trim(song.find("td[data-col='duration']").text());
    if (/^\d\d?(\:\d\d)*$/.test(duration)) item.duration = duration;//no real duration on recommandation page
    return item;
  }
  
  var parseNavigationList = {
    playlistsList: function(parent, end, callback, omitUnknownAlbums) {
      var playlists = [];
      parent.find(".card").slice(0, end).each(function() {
        var card = $(this);
        var id = card.data("id");
        if (omitUnknownAlbums && id.substr(1).indexOf("/") < 0) return;
        var item = {};
        item.titleLink = getLink(card);
        if (item.titleLink == null) return;
        item.cover = parseCover(card.find(".image-wrapper img"));
        item.title = $.trim(card.find(".title").text());
        var subTitle = card.find(".sub-title");
        item.subTitle = $.trim(subTitle.text());
        item.subTitleLink = getLink(subTitle);
        playlists.push(item);
      });
      if (callback === false) return playlists;
      callback(playlists);
    },
    playlist: function(parent, end, callback) {
      listRatings = [];
      var count = parent.find(".song-row").parent().data("count");
      var update = false;
      var lastIndex = -1;
      function loadNextSongs() {
        var rows = parent.find(".song-row");
        if (!update && count > 0 && rows.first().data("index") != 0) {//not yet there
          parent.scrollTop(0);
          asyncListTimer = setTimeout(loadNextSongs, 150);
          return;
        }
        //scroll to last needed song row to trigger lazy loading
        var playlist = [];
        var lastLoaded = null;
        rows.slice(0, end).each(function() {
          var song = $(this);
          lastLoaded = this;
          if (song.data("index") <= lastIndex) return;
          var item = parseSongRow(song);
          lastIndex = item.index;
          if (song.find(".song-indicator").length > 0) item.current = true;
          item.rating = parseRating(song.find("td[data-col='rating']").get(0));
          listRatings.push(item.rating);
          playlist.push(item);
        });
        if (callback === false) return playlist;
        if (!update || playlist.length > 0) {
          callback(playlist, update);
          update = true;
        }
        if (count != null && lastIndex + 1 < count && (end == undefined || lastIndex + 1 < end)) {
          if (pausePlaylistParsing) {
            resumePlaylistParsingFn = loadNextSongs;
          } else {
            if (lastLoaded) lastLoaded.scrollIntoView(true);
            asyncListTimer = setTimeout(loadNextSongs, 150);
          }
        }
      }
      if (callback === false) return loadNextSongs();
      pausePlaylistParsing = false;
      parent.scrollTop(0);
      asyncListTimer = setTimeout(loadNextSongs, 150);
    },
    albumContainers: function(parent, end, callback) {
      var items = [];
      parent.find(".card").slice(0, end).each(function() {
        var card = $(this);
        var item = {};
        var img = card.find(".image-inner-wrapper img:first");
        if (img.attr("src").indexOf("/default_artist.png") < 0) item.cover = parseCover(img);
        item.title = $.trim(card.find(".details .title").text());
        item.link = getLink(card);
        items.push(item);
      });
      if (callback === false) return items;
      callback(items);
    }
  };
  
  function sendMyPlaylists() {
    var playlists = [];
    $("#playlists").children("li").each(function() {
      playlists.push({title: $.trim($(this).find(".tooltip").text()), titleLink: getLink($(this))});
    });
    post("player-navigationList", {type: "playlistsList", link: "myPlaylists", list: playlists, empty: playlists.length == 0});
  }
  
  function getListType(hash) {
    var i = hash.indexOf("/");
    if (i > 0) hash = hash.substring(0, i);
    switch (hash) {
      case "artists":
      case "genres":
      case "srar":
        return "albumContainers";
      case "now":
      case "albums":
      case "rd":
      case "artist":
      case "sar":
      case "tg":
      case "sral":
      case "ar":
        return "playlistsList";
      default:
        return "playlist";
    }
  }
  
  function sendNavigationList(link, omitUnknownAlbums, search) {
    selectAndExecute(link, function(error) {
      var response = {link: link, list: [], controlLink: location.hash};
      if (error) {
        response.error = true;
      } else {
        var type = getListType(link);
        //check if we are on a page with correct type
        //e.g. in recommendations list the album link might not work in which case we get redirected to albums page
        if (type == getListType(location.hash.substr(2))) {
          response.type = type;
          response.search = search;
          parseNavigationList[type]($("#main"), undefined, function(list, update) {
            response.list = list;
            response.update = update;
            response.empty = response.list.length == 0;
            post("player-navigationList", response);
          }, omitUnknownAlbums);
        } else {
          response.error = true;
          post("player-navigationList", response);
        }
      }
    });
  }
  
  function parseSublist(searchView, type, end) {
    var cont = searchView.children("div[data-type='" + type + "']");
    if (cont.length == 0) return null;
    var listType = getListType(type);
    var list = parseNavigationList[listType](cont, end, false);
    if (list.length == 0) return null;
    return {
      list: list,
      type: listType,
      header: $.trim(cont.find(".header .title").text()),
      moreLink: cont.hasClass("has-more") ? getLink(cont) : null
    };
  }
  
  function sendSearchResult(search) {
    selectAndExecute("sr/" + forHash(search), function() {
      var response = {type: "searchresult", link: "search", search: search, lists: [], controlLink: location.hash};
      response.header = $.trim($("#breadcrumbs").find(".tab-text").text());
      var searchView = $("#main .search-view");
      response.moreText = $.trim(searchView.find("div .header .more:visible").first().text());
      response.lists.push(parseSublist(searchView, "srar", 6));
      response.lists.push(parseSublist(searchView, "sral", 5));
      response.lists.push(parseSublist(searchView, "srs", 10));
      response.empty = response.lists[0] == null && response.lists[1] == null && response.lists[2] == null;
      post("player-navigationList", response);
    });
  }
  
  function resumeSong(msg, error) {
    if (error) return;
    function sendResume() {
      var rows = $("#main .song-row");
      if (rows.length > 0) {
        if (rows.first().data("index") != 0) {
          $("#main").scrollTop(0);
          asyncListTimer = setTimeout(sendResume, 150);
          return;
        }
        var found = false;
        rows.each(function() {
          var song = parseSongRow($(this));
          if (song.title == msg.title && song.duration == msg.duration && (!song.artist || !msg.artist || song.artist == msg.artist)) {
            found = true;
            sendCommand("resumePlaylistSong", {index: song.index, position: msg.position});
            return false;
          }
        });
        var last = found || rows.last();
        if (!found && last.data("index") < last.parent().data("count") - 1) {
          last.get(0).scrollIntoView(true);
          asyncListTimer = setTimeout(sendResume, 150);
        }
      }
    }
    sendResume();
  }
  
  port = chrome.runtime.connect({name: "googlemusic"});
  port.onDisconnect.addListener(cleanup);
  port.onMessage.addListener(function(msg) {
    switch (msg.type) {
      case "execute":
        sendCommand(msg.command, msg.options);
        break;
      case "getNavigationList":
        if (msg.link == "myPlaylists") {
          sendMyPlaylists();
        } else if (msg.link == "search") {
          sendSearchResult(msg.search);
        } else {
          sendNavigationList(msg.link, msg.omitUnknownAlbums, msg.search);
        }
        break;
      case "selectLink":
        selectAndExecute(msg.link);
        break;
      case "startPlaylist":
        selectAndExecute(msg.link, function(error) {
          //type "im"/"st" starts automatically
          if (!error && msg.link.indexOf("im/") != 0 && msg.link.indexOf("st/") != 0) sendCommand("startPlaylist");
        });
        break;
      case "resumeLastSong":
        selectAndExecute(msg.albumLink, resumeSong.bind(window, msg));
        break;
      case "lyrics":
        renderLyrics(msg.result);
        break;
      case "connected":
        init();
        break;
      case "connectedIndicator":
        if (msg.show) showConnectedIndicator()
        else hideConnectedIndicator();
        break;
      case "lyricsState":
        if (msg.enabled) enableLyrics(msg.fontSize, msg.width)
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
