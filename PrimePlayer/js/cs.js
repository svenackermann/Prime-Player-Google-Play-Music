/**
 * Content script to be injected to Google Play Music.
 * This watches the DOM for relevant changes and notifies the background page.
 * It also delivers commands to the Google Play Music window.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
$(function() {
  var port;
  var registeredListeners = [];
  var observers = [];
  var executeOnContentLoad;
  var contentLoadDestination;
  var listRatings;
  var asyncListTimer;
  var pausePlaylistParsing = false;
  var resumePlaylistParsingFn;
  
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
    if (cover && cover.indexOf("//") == 0) cover = "https:" + cover;
    return cover;
  }
  
  function parseRating(ratingContainer) {
    if (ratingContainer == null) return -1;
    var rating = parseInt(ratingContainer.dataset.rating);
    return isNaN(rating) ? 0 : rating;
  }
  
  /**
   * Execute a function after DOM manipulation on selected elements is finished.
   * @param fn function to execute, gets the jQuery object for the selector as parameter
   * @param selector element(s) to be watched for DOM manipulation
   * @param removeAfterExecute if true, the function will be called only once, otherwise the event listener stays attached
   * @param timeout time to wait after DOM manipulation before executing the function
   */
  function executeAfterContentLoad(fn, selector, timeout) {
    var content = $(selector);
    if (content.length == 0) {
      console.error("element does not exist (did Google change their site?): " + selector);
      return;
    }
    var contentTimer;
    var listener = function() {
      clearTimeout(contentTimer);
      contentTimer = setTimeout(function() {
        contentTimer = null;
        fn(content);
      }, timeout);//wait til the DOM manipulation is finished
    };
    content.on("DOMSubtreeModified", listener);
    registeredListeners.push({ selector: selector, listener: listener });
    listener();
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
  
  function enableLyrics() {
    disableLyrics();
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
  
  function init() {
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
          artistLink: getLink(artist) || "ar/" + forHash($.trim(artist.text())),
          album: $.trim(album.text()),
          albumLink: getLink(album),
          cover: cover
        };
      }
      $("#ppLyricsButton").toggleClass("active", info != null);
      post("song-info", info);
    }
    
    function sendPosition(el) {
      post("song-position", $.trim(el.text()));
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
      if (container.is(":visible")) return parseRating(container.children("li.selected").get(0));
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
          mutations.forEach(function(mutation) {
            post(type, getValue(mutation.target, mutation.attributeName));
          });
        });
        observers.push(observer);
        observer.observe(element, { attributes: true, attributeFilter: attrs.split(" ") });
        post(type, getValue(element, attrs));//trigger once to initialize the info
      } else {
        console.error("element does not exist (did Google change their site?): " + selector);
      }
    }
    
    executeAfterContentLoad(sendSong, "#time_container_duration, #playerSongInfo", 500);
    executeAfterContentLoad(sendPosition, "#time_container_current", 0);
    executeAfterContentLoad(mainLoaded, "#main", 500);
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
    
    //we must add this script to the DOM for the code to be executed in the correct context
    var injected = document.createElement("script"); injected.type = "text/javascript";
    injected.src = chrome.extension.getURL("js/injected.js");
    document.getElementsByTagName("head")[0].appendChild(injected);
    window.addEventListener("message", onMessage);
    
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
    if (event.source != window || event.data.type != "FROM_PRIMEPLAYER_INJECTED") return;
    switch (event.data.msg) {
      case "playlistSongRated":
        $("#main .song-row[data-index='" + event.data.index + "']").find("td[data-col='rating']").trigger("DOMSubtreeModified");
      case "playlistSongStarted":
      case "playlistSongError":
        pausePlaylistParsing = false;
        if (typeof(resumePlaylistParsingFn) == "function") resumePlaylistParsingFn();
        resumePlaylistParsingFn = null;
        break;
    }
  }
  
  /** Send a command to the injected script. */
  function sendCommand(command, options) {
    if (command == "startPlaylistSong" || command == "ratePlaylistSong") pausePlaylistParsing = true;
    window.postMessage({ type: "FROM_PRIMEPLAYER", command: command, options: options }, location.href);
  }
  
  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    sendCommand("cleanup");
    for (var i = 0; i < registeredListeners.length; i++) {
      var l = registeredListeners[i];
      $(l.selector).off("DOMSubtreeModified", l.listener);
    }
    $("#main").off("DOMSubtreeModified");
    $(window).off("hashchange");
    for (var i = 0; i < observers.length; i++) {
      observers[i].disconnect();
    }
    hideConnectedIndicator();
    disableLyrics();
    port = null;
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
      if (callback == false) return playlists;
      callback(playlists);
    },
    playlist: function(parent, end, callback) {
      listRatings = [];
      var count = parent.find(".song-row").parent().data("count");
      var update = false;
      var lastIndex = -1;
      function loadNextSongs() {
        //scroll to last needed song row to trigger lazy loading
        var playlist = [];
        var lastLoaded = null;
        parent.find(".song-row").slice(0, end).each(function() {
          var song = $(this);
          lastLoaded = this;
          if (song.data("index") <= lastIndex) return;
          lastIndex = song.data("index");
          var item = {};
          item.index = lastIndex;
          var title = song.find("td[data-col='title'] .content");
          item.cover = parseCover(title.find("img"));
          item.title = $.trim(title.text());
          if (song.find(".song-indicator").length > 0) item.current = true;
          item.artist = $.trim(song.find("td[data-col='artist'] .content").text());
          if (item.artist) item.artistLink = "ar/" + forHash(item.artist);
          var album = song.find("td[data-col='album']");
          item.album = $.trim(album.find(".content").text());
          var alAr = album.data("album-artist");
          if (item.album && alAr) item.albumLink = "album//" + forHash(alAr) + "/" + forHash(item.album);
          var duration = $.trim(song.find("td[data-col='duration']").text());
          if (/^\d\d?(\:\d\d)*$/.test(duration)) item.duration = duration;//no real duration on recommandation page
          item.rating = parseRating(song.find("td[data-col='rating']").get(0));
          listRatings.push(item.rating);
          playlist.push(item);
        });
        if (callback == false) return playlist;
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
      if (callback == false) return loadNextSongs();
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
      if (callback == false) return items;
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
      case "lyricsEnabled":
        if (msg.enabled) enableLyrics()
        else disableLyrics();
        break;
      case "alreadyConnected":
        port.disconnect();
        port = null;
        break;
    }
  });
});
