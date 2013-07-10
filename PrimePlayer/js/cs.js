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
  var initialized = false;
  
  function init() {

    /** send update to background page */
    function post(type, value) {
      if (port) {
        port.postMessage({type: type, value: value});
      }
    }
    
    //when rating is changed, the page gets reloaded, so no need for event listening here
    var ratingMode;
    var ratingContainer = $("#player-right-wrapper > div.player-rating-container > ul.rating-container");
    if (ratingContainer.hasClass("thumbs")) ratingMode = "thumbs";
    else if (ratingContainer.hasClass("stars")) ratingMode = "star";
    ratingContainer = null;
    post("player-ratingMode", ratingMode);
    
    var playlistTimer;
    function playlistListener(event) {
      clearTimeout(playlistTimer);
      playlistTimer = setTimeout(function() {
        playlistTimer = null;
        var playlists = [];
        $(event.data.selector).find("li").each(function() {
          var playlist = [$(this).attr("id"), $(this).text()];
          playlists.push(playlist);
        });
        post("player-playlists", playlists);
      }, 1000);//wait a second till the DOM manipulation is finished
    }
    
    var songTimer;
    function songListener(event) {
      clearTimeout(songTimer);
      songTimer = setTimeout(function() {
        songTimer = null;
        var hasSong = $("#playerSongInfo").find("div").length > 0;
        var info = null;
        if (hasSong) {
          var cover = $("#playingAlbumArt").attr("src");
          if (cover) cover = "http:" + cover;
          info = {
            duration: $.trim($("#time_container_duration").text()),
            title: $("#playerSongTitle").text(),
            artist: $("#player-artist").text(),
            artistId: $("#player-artist").data("id"),
            album: $("#playerSongInfo").find(".player-album").text(),
            albumId: $("#playerSongInfo").find(".player-album").data("id"),
            cover: cover
          };
        }
        post("song-info", info);
      }, 1000);//wait for all the song info to be loaded and send once
    }
    
    function positionListener(event) {
      post("song-position", $.trim($(event.data.selector).text()));
    }
    
    function playingGetter(el) {
      return $(el).hasClass("playing");
    }
    
    function ratingGetter(el) {
      return parseInt($(el.parentElement).find("li.selected").data("rating")) || 0;
    }
    
    /** call listener when the DOM subtree of the given selector changes */
    function watchDOM(selector, listener) {
      var el = $(selector);
      if (el.length == 0) {
        console.error("element does not exist (did Google change their site?): " + selector);
      } else {
        registeredListeners.push({ selector: selector, listener: listener});
        el.on("DOMSubtreeModified", {selector: selector}, listener)
          .triggerHandler("DOMSubtreeModified");//trigger once to initialize the info
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
        var observer = new WebKitMutationObserver(function (mutations) {
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
    
    watchDOM("#playlists", playlistListener);
    watchDOM("#time_container_duration, #playerSongInfo", songListener);
    watchDOM("#time_container_current", positionListener);
    watchAttr("class", "#player > div.player-middle > button[data-id='play-pause']", "player-playing", playingGetter);
    watchAttr("value", "#player > div.player-middle > button[data-id='repeat']", "player-repeat");
    watchAttr("value", "#player > div.player-middle > button[data-id='shuffle']", "player-shuffle");
    watchAttr("class", "#player-right-wrapper > .player-rating-container ul.rating-container li", "song-rating", ratingGetter);
    
    //we must add this script to the DOM for the code to be executed in the correct context
    var injected = document.createElement('script'); injected.type = 'text/javascript';
    injected.src = chrome.extension.getURL('js/injected.js');
    document.getElementsByTagName('head')[0].appendChild(injected);
    
    //inject icon with title to mark the tab as connected
    $(".music-banner-icon")
      .css({background: 'url(' + chrome.extension.getURL('img/icon-tabconnected.png') + ')'})
      .attr('title', chrome.i18n.getMessage('connected'));
    
    initialized = true;
  }
  
  /** remove all listeners/observers and revert DOM modifications */
  function cleanup() {
    initialized = false;
    window.postMessage({ type: "FROM_PRIMEPLAYER", command: "cleanup" }, "*");
    for (var i in registeredListeners) {
      var l = registeredListeners[i];
      $(l.selector).off("DOMSubtreeModified", l.listener);
    }
    for (var i in observers) {
      observers[i].disconnect();
    }
    $(".music-banner-icon").removeAttr("style").removeAttr("title");
    port = null;
  }

  port = chrome.extension.connect({name: "googlemusic"});
  port.onMessage.addListener(function(msg) {
    switch (msg.type) {
      case "execute":
        if (initialized) {
          window.postMessage({ type: "FROM_PRIMEPLAYER", command: msg.command, options: msg.options }, location.href);
        }
        break;
      case "connected":
        port.onDisconnect.addListener(cleanup);
        init();
        break;
      case "alreadyConnected":
        port.disconnect();
        port = null;
        break;
    }
  });
});
