/**
 * Content script to be injected to Google Play Music.
 * This watches the DOM for relevant changes and notifies the background page.
 * It also delivers commands to the Google Play Music window.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
$(function() {
  var registeredListeners = [];
  var observers = [];
  var initialized = false;
  
  function init() {

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
    var info = null;
    function songListener(event) {
      clearTimeout(songTimer);
      songTimer = setTimeout(function() {
        songTimer = null;
        var hasSong = $("#playerSongInfo").find("div").length > 0;
        var newInfo = null;
        if (hasSong) {
          var cover = $("#playingAlbumArt").attr("src");
          if (cover) cover = "http:" + cover;
          newInfo = {
            duration: $.trim($("#time_container_duration").text()),
            title: $("#playerSongTitle").text(),
            artist: $("#player-artist").text(),
            album: $("#playerSongInfo").find(".player-album").text(),
            cover: cover
          };
        }
        if (info == newInfo) return;//both null
        if (info != null && newInfo != null
            && info.duration == newInfo.duration
            && info.title == newInfo.title
            && info.artist == newInfo.artist
            && info.album == newInfo.album
            && info.cover == newInfo.cover) {
          return;
        }
        info = newInfo;
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
    
    function watchEvent(event, selector, listener) {
      registeredListeners.push({ event: event, selector: selector, listener: listener});
      $(selector).on(event, {selector: selector}, listener)
        .triggerHandler(event);//trigger once to initialize the info
    }
    
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
    
    watchEvent("DOMSubtreeModified", "#playlists", playlistListener);
    watchEvent("DOMSubtreeModified", "#time_container_duration, #playerSongInfo", songListener);
    watchEvent("DOMSubtreeModified", "#time_container_current", positionListener);
    watchAttr("class", "#player > div.player-middle > button[data-id='play-pause']", "player-playing", playingGetter);
    watchAttr("value", "#player > div.player-middle > button[data-id='repeat']", "player-repeat");
    watchAttr("value", "#player > div.player-middle > button[data-id='shuffle']", "player-shuffle");
    watchAttr("class", "#player-right-wrapper > .player-rating-container ul.rating-container li", "song-rating", ratingGetter);
    
    var injected = document.createElement('script'); injected.type = 'text/javascript';
    injected.src = chrome.extension.getURL('js/injected.js');
    document.getElementsByTagName('head')[0].appendChild(injected);
    
    $(".music-banner-icon")
      .css({background: 'url(' + chrome.extension.getURL('img/icon-tabconnected.png') + ')'})
      .attr('title', chrome.i18n.getMessage('connected'));
    initialized = true;
  }
  
  function cleanup() {
    initialized = false;
    window.postMessage({ type: "FROM_PRIMEPLAYER", command: "cleanup" }, "*");
    for (var i in registeredListeners) {
      var l = registeredListeners[i];
      $(l.selector).off(l.event, l.listener);
    }
    for (var i in observers) {
      observers[i].disconnect();
    }
    $(".music-banner-icon").removeAttr("style").removeAttr("title");
    port = null;
  }

  var port = chrome.extension.connect({name: "googlemusic"});
  port.onMessage.addListener(function(msg) {
    if (msg.type == "connected") {
      port.onDisconnect.addListener(cleanup);
      init();
    } else if (msg.type == "execute" && initialized) {
      window.postMessage({ type: "FROM_PRIMEPLAYER", command: msg.command, options: msg.options }, location.href);
    }
  });
});
