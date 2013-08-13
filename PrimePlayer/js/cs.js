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
  var omitUnknownAlbums = false;
  var executeOnContentLoad;
  
  /** send update to background page */
  function post(type, value) {
    if (port) {
      port.postMessage({type: type, value: value});
    }
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

  function sendQuickLinks() {
    var ql = {};
    var nav = $("#nav_collections");
    ql.listenNowText = $.trim(nav.children("li[data-type='now']").text());
    ql.mixesText = $.trim(nav.children("li[data-type='rd']").text());
    var br = $("#browse-tabs");
    ql.artistsText = $.trim(br.children("div[data-type='artists']").text());
    ql.albumsText = $.trim(br.children("div[data-type='albums']").text());
    ql.genresText = $.trim(br.children("div[data-type='genres']").text());
    var apl = [];
    $("#auto-playlists").children("li").each(function() {
      apl.push({
        link: getLink($(this)),
        text: $.trim($(this).find("div.tooltip").text())
      });
    });
    ql.autoPlaylists = apl;
    post("player-quicklinks", ql);
  }
  
  /**
   * Execute a function after DOM manipulation on selected elements is finished.
   * @param fn function to execute, gets the jQuery object for the selector as parameter
   * @param selector element(s) to be watched for DOM manipulation
   * @param removeAfterExecute if true, the function will be called only once, otherwise the event listener stays attached
   * @param timeout time to wait after DOM manipulation before executing the function
   */
  function executeAfterContentLoad(fn, selector, removeAfterExecute, timeout) {
    if (timeout == null) timeout = 500;
    var content = $(selector);
    if (content.length == 0) {
      console.error("element does not exist (did Google change their site?): " + selector);
      return;
    }
    var contentTimer;
    var listener = function(event) {
      clearTimeout(contentTimer);
      contentTimer = setTimeout(function() {
        contentTimer = null;
        if (removeAfterExecute) content.off("DOMSubtreeModified", listener);
        fn(content);
      }, timeout);//wait til the DOM manipulation is finished
    };
    content.on("DOMSubtreeModified", listener);
    if (!removeAfterExecute) {
      registeredListeners.push({ selector: selector, listener: listener });
      content.triggerHandler("DOMSubtreeModified");
    }
  }
  
  function init() {
    //when rating is changed, the page gets reloaded, so no need for event listening here
    var ratingMode;
    var ratingContainer = $("#player-right-wrapper > div.player-rating-container > ul.rating-container");
    if (ratingContainer.hasClass("thumbs")) ratingMode = "thumbs";
    else if (ratingContainer.hasClass("stars")) ratingMode = "star";
    ratingContainer = null;
    post("player-ratingMode", ratingMode);
    
    function sendSong() {
      var hasSong = $("#playerSongInfo").find("div").length > 0;
      var info = null;
      if (hasSong) {
        var artist = $("#player-artist");
        var album = $("#playerSongInfo").find(".player-album");
        var cover = parseCover($("#playingAlbumArt"));
        info = {
          duration: $.trim($("#time_container_duration").text()),
          title: $.trim($("#playerSongTitle").text()),
          artist: $.trim(artist.text()),
          artistLink: getLink(artist),
          album: $.trim(album.text()),
          albumLink: getLink(album),
          cover: cover
        };
      }
      post("song-info", info);
    }
    
    function sendPosition(el) {
      post("song-position", $.trim(el.text()));
    }
    
    function playingGetter(el) {
      return $(el).hasClass("playing");
    }
    
    function ratingGetter(el) {
      var rating = parseInt($(el.parentElement).find("li.selected").data("rating"));
      return isNaN(rating) ? -1 : rating;
    }
    
    function mainLoaded() {
      if (typeof(executeOnContentLoad) == "function") {
        var fn = executeOnContentLoad;
        executeOnContentLoad = null;
        fn();
      }
    }
    
    /**
     * Watch changes of an attribute on DOM elements specified by the selector.
     * @param attr the name of the attribute
     * @param selector the jQuery selector
     * @param type the type of message to post on change
     * @param getValue an optional special function to get the value (default is element.getAttribute(attr))
     */
    function watchAttr(attr, selector, type, getValue) {
      var element = $(selector).get()[0];
      if (element) {
        if (getValue == undefined) {
          getValue = function(el) {return el.getAttribute(attr)};
        }
        var observer = new MutationObserver(function (mutations) {
          mutations.forEach(function(mutation) {
            post(type, getValue(mutation.target));
          });
        });
        observers.push(observer);
        observer.observe(element, { attributes: true, attributeFilter: [attr] });
        post(type, getValue(element));//trigger once to initialize the info
      } else {
        console.error("element does not exist (did Google change their site?): " + selector);
      }
    }
    
    executeAfterContentLoad(sendSong, "#time_container_duration, #playerSongInfo", false);
    executeAfterContentLoad(sendPosition, "#time_container_current", false, 0);
    executeAfterContentLoad(mainLoaded, "#main", false, 1000);
    watchAttr("class", "#player > div.player-middle > button[data-id='play-pause']", "player-playing", playingGetter);
    watchAttr("value", "#player > div.player-middle > button[data-id='repeat']", "player-repeat");
    watchAttr("value", "#player > div.player-middle > button[data-id='shuffle']", "player-shuffle");
    watchAttr("class", "#player-right-wrapper > .player-rating-container ul.rating-container li", "song-rating", ratingGetter);
    watchAttr("aria-valuenow", "#vslider", "player-volume");
    
    //we must add this script to the DOM for the code to be executed in the correct context
    var injected = document.createElement('script'); injected.type = 'text/javascript';
    injected.src = chrome.extension.getURL('js/injected.js');
    document.getElementsByTagName('head')[0].appendChild(injected);
    
    //inject icon with title to mark the tab as connected
    $(".music-banner-icon")
      .css({background: 'url(' + chrome.extension.getURL('img/icon-tabconnected.png') + ')', cursor: "pointer"})
      .attr('title', chrome.i18n.getMessage('connected'))
      .click(function() {
        port.disconnect();
        cleanup();
      });
    
    sendQuickLinks();
  }
  
  /** Send a command to the injected script. */
  function sendCommand(command, options) {
    window.postMessage({ type: "FROM_PRIMEPLAYER", command: command, options: options }, location.href);
  }
  
  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    sendCommand("cleanup");
    for (var i = 0; i < registeredListeners.length; i++) {
      var l = registeredListeners[i];
      $(l.selector).off("DOMSubtreeModified", l.listener);
    }
    for (var i = 0; i < observers.length; i++) {
      observers[i].disconnect();
    }
    $(".music-banner-icon").removeAttr("style").removeAttr("title").off("click");
    port = null;
  }
  
  /** Set the hash to the given link to navigate to another page. */
  function selectLink(link) {
    if (link.indexOf("st/") == 0) {//setting hash does not work for type "st"
      var listId = link.substr(3);
      if ($(".card[data-id='" + listId + "'][data-type='st']").length > 0) {
        sendCommand("clickCard", {id: listId});
      } else {
        var bakExecuteOnContentLoad = executeOnContentLoad;
        selectAndExecute("rd", function() {
          executeOnContentLoad = bakExecuteOnContentLoad;
          sendCommand("clickCard", {id: listId});
        });
      }
    } else {
      location.hash = "/" + link;
    }
  }
  
  function selectAndExecute(hash, callback) {
    if (location.hash == "#/" + hash) {
      callback();
    } else {
      executeOnContentLoad = callback;
      selectLink(hash);
    }
  }
  
  function forHash(text) {
    return encodeURIComponent(text).replace(/%20/g, "+");
  }
  
  var parseNavigationList = {
    playlistsList: function() {
      var playlists = [];
      $(".card").each(function() {
        var card = $(this);
        var item = {};
        var id = card.data("id");
        if (omitUnknownAlbums && id.charAt(id.length - 1) == "/") return;
        item.cover = parseCover(card.find(".image-wrapper img"));
        item.title = $.trim(card.find(".title").text());
        item.titleLink = getLink(card);
        var subTitle = card.find(".sub-title");
        item.subTitle = $.trim(subTitle.text());
        item.subTitleLink = getLink(subTitle);
        playlists.push(item);
      });
      return playlists;
    },
    playlist: function() {
      var playlist = [];
      $(".song-row").each(function() {
        var song = $(this);
        var item = {};
        var title = song.find("td[data-col='title'] .content");
        item.cover = parseCover(title.find("img"));
        item.title = $.trim(title.text());
        if (song.find(".song-indicator").length > 0) item.current = true;
        if (location.hash != "#/ap/google-play-recommends") {//no real duration on recommandation page
          item.duration = $.trim(song.find("td[data-col='duration']").text());
        }
        item.artist = $.trim(song.find("td[data-col='artist'] .content").text());
        if (item.artist) item.artistLink = "ar/" + forHash(item.artist);
        var album = song.find("td[data-col='album']");
        item.album = $.trim(album.find(".content").text());
        if (item.album) item.albumLink = "al/" + forHash(album.data("album-artist")) + "/" + forHash(item.album);
        var rating = parseInt(song.find("td[data-col='rating']").data("rating"));
        item.rating = isNaN(rating) ? -1 : rating;
        playlist.push(item);
      });
      return playlist;
    },
    albumContainers: function() {
      var items = [];
      $(".card").each(function() {
        var card = $(this);
        var item = {};
        var img = card.find(".image-inner-wrapper img:first");
        if (img.attr("src").indexOf("/default_artist.png") < 0) item.cover = parseCover(img);
        item.title = $.trim(card.find(".details .title").text());
        item.link = getLink(card);
        items.push(item);
      });
      return items;
    }
  };
  
  function sendMyPlaylists() {
    var playlists = [];
    $("#playlists").children("li").each(function() {
      playlists.push({title: $.trim($(this).find(".tooltip").text()), titleLink: getLink($(this))});
    });
    post("player-navigationList", {link: "myPlaylists", list: playlists});
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
        } else {
          omitUnknownAlbums = msg.omitUnknownAlbums;
          selectAndExecute(msg.link, function() {
            var list = parseNavigationList[msg.listType]();
            post("player-navigationList", {link: msg.link, list: list, controlLink: location.hash});
          });
        }
        break;
      case "startPlaylist":
        selectAndExecute(msg.link, function() {
          //type "im"/"st" starts automatically
          if (msg.link.indexOf("im/") != 0 && msg.link.indexOf("st/") != 0) sendCommand("startPlaylist");
        });
        break;
      case "connected":
        init();
        break;
      case "alreadyConnected":
        port.disconnect();
        port = null;
        break;
    }
  });
});
