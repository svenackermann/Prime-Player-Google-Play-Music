/**
 * This script does all the magic for the miniplayer, popup and toasts.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var typeClass = bp.extractUrlParam("type", location.search) || "popup";

  function layoutWatcher(val, old) {
    $("html").removeClass("layout-" + old).addClass("layout-" + val);
  }
  if (typeClass == "miniplayer" || typeClass == "toast") {
    bp.settings.watch("layout", layoutWatcher);
  } else {
    $("html").addClass("layout-normal");
  }

  function repeatWatcher(val) {
    $("#repeat").attr("class", val);
  }

  function shuffleWatcher(val) {
    $("#shuffle").attr("class", val);
  }

  function playlistsWatcher(val) {
    if (val.length > 0) {
      $("#playlistButton").show();
    } else {
      $("#playlistButton").hide();
      hidePlaylists();
    }
    if ($("#playlists").is(":visible")) {
      showPlaylists();//re-render
    }
  }

  function playingWatcher(val) {
    $("body").toggleClass("playing", val);
  }

  function songInfoWatcher(val) {
    $("body").toggleClass("hasSong", val != null);
    if (val) {
      $("#songTime").text(val.duration);
      $("#track").text(val.title);
      $("#artist").text(val.artist);
      $("#album").text(val.album);
      $("#cover").attr("src", val.cover || "img/cover.png");
      //although the value of scrobbleTime might have not changed, the relative position might have
      updateScrobblePosition(bp.song.scrobbleTime);
    } else {
      $("#cover").attr("src", "img/cover.png");
    }
  }

  function positionSecWatcher(val) {
    var width = 0;
    if (bp.song.info && bp.song.info.durationSec > 0) {
      width = (val / bp.song.info.durationSec * 100) + "%";
    }
    $("#currentTime").text(bp.song.position);
    $("#timeBar").css({width: width});
  }

  function ratingModeWatcher(val) {
    var buttons = $("#googleRating");
    buttons.removeClass("star-rating thumbs-rating");
    if (val) {
      buttons.addClass(val + "-rating");
    }
  }

  function ratingWatcher(val, old) {
    $("#googleRating").removeClass("rating-" + old).addClass("rating-" + val);
  }

  function updateScrobblePosition(scrobbleTime) {
    if (scrobbleTime >= 0 && bp.song.info && bp.song.info.durationSec > 0) {
      $("#scrobblePosition").addClass("songscrobble").css({left: (scrobbleTime / bp.song.info.durationSec * 100) + "%"});
    } else {
      $("#scrobblePosition").removeClass("songscrobble");
    }
  }

  function scrobbleWatcher(val) {
    $("body").toggleClass("scrobbleEnabled", val);
  }

  function colorWatcher(val, old) {
    $("html").removeClass("color-" + old).addClass("color-" + val);
  }

  /** listen for resize events and poll for position changes to update the settings */
  function setupResizeMoveListeners() {
    function doneResizing() {
      var sizing = bp.localSettings.miniplayerSizing;
      sizing[bp.settings.layout].width = window.innerWidth;
      sizing[bp.settings.layout].height = window.innerHeight;
      bp.localSettings.miniplayerSizing = sizing;//trigger listener notification
    }
    var timerId;
    $(window).resize(function() {
      clearTimeout(timerId);
      timerId = setTimeout(doneResizing, 1000);
    });
    
    var oldX = window.screenX;
    var oldY = window.screenY;
    setInterval(function() {
      if (oldX != window.screenX || oldY != window.screenY) {
        oldX = window.screenX;
        oldY = window.screenY;
        var sizing = bp.localSettings.miniplayerSizing;
        sizing[bp.settings.layout].left = oldX;
        sizing[bp.settings.layout].top = oldY;
        bp.localSettings.miniplayerSizing = sizing;//trigger listener notification
      }
    }, 1000);
  }

  function setToastAutocloseTimer() {
    var windowTimer = setTimeout(function() { window.close(); }, bp.settings.toastDuration * 1000);
    //do not close as long as the mouse is over
    $(window).mouseover(function() { clearTimeout(windowTimer); });
    //after the mouse is out, close in 3 seconds
    $(window).mouseout(function() { windowTimer = setTimeout(function() { window.close(); }, 3000); });
  }

  function lastfmUserWatcher(user) {
    $("body").toggleClass("lastfm", user != null);
    if (user) {
      $("#lastfmUser")
        .attr("title", chrome.i18n.getMessage("lastfmUser") + user)
        .attr("href", "http://last.fm/user/" + user);
    }
  }

  function volumeWatcher(val) {
    if (val == null) {
      $("#volumeBarContainer").hide();
    } else {
      $("#volumeBar").css({width: val + "%"});
    }
  }
  
  function connectedWatcher(val) {
    $("body").toggleClass("connected", val);
    $("#coverContainer").unbind();
    if (val) $("#coverContainer").click(showListenNow);
  }
  
  function showPlaylists() {
    var playlistSectionTitle = chrome.i18n.getMessage("playlists");
    var playlists = bp.player.playlists;
    var playlistLinks = "";
    for (var i = 0; i < playlists.length; i++) {
      playlistLinks += "<div><a href='#' data-link='" + playlists[i][0] + "' title='" + playlists[i][1] + "'>" + playlists[i][1] + "</a></div>";
    }
    $("#playlistContainer").html("<h2>" + playlistSectionTitle + "</h2>" + playlistLinks);
    $("#playlistContainer a").click(function() { playlistStart($(this).data("link")); });
    $("#player").hide();
    $("#playlists").unbind().click(hidePlaylists).show();
  }

  function hidePlaylists() {
    $("#playlists").hide();
    $("#player").show();
  }

  function renderListenNow(val) {
    bp.player.removeListener("listenNowList", renderListenNow);
    var html = "";
    for (var i = 0; i < val.length; i++) {
      var e = val[i];
      html += "<div>";
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<a href='#' data-link='" + e.titleLink + "' title='" + e.title + "'>" + e.title + "</a>"
      html += e.subTitleLink ? "<a href='#' data-link='" + e.subTitleLink + "'" : "<span";
      html += " title='" + e.subTitle + "'>" + e.subTitle + "</";
      html += e.subTitleLink ? "a>" : "span>";
      html += "</div>";
    }
    $("#listenNow").removeClass("loading").html(html).find("a").click(function() {
      selectLink($(this).data("link"));
      return false;
    });
    $("#listenNow").find("img").click(function() {
      playlistStart($(this).next("a").data("link"));
    });
  }
  
  function showListenNow() {
    $("#player").hide();
    $("#listenNow").empty().addClass("loading").click(hideListenNow).show();
    bp.player.addListener("listenNowList", renderListenNow);
    bp.loadListenNow();
  }

  function hideListenNow() {
    bp.player.removeListener("listenNowList", renderListenNow);
    $("#listenNow").hide();
    $("#player").show();
  }
  
  function renderPlayControls() {
    $(".playPause").click(googleMusicExecutor("playPause")).each(function() {
      $(this).attr("title", chrome.i18n.getMessage(this.id + "Song"));
    });
    $("#prev").click(googleMusicExecutor("prevSong")).attr("title", chrome.i18n.getMessage("prevSong"));
    $("#next").click(googleMusicExecutor("nextSong")).attr("title", chrome.i18n.getMessage("nextSong"));
    $("#repeat").click(googleMusicExecutor("toggleRepeat")).attr("title", chrome.i18n.getMessage("repeat"));
    $("#shuffle").click(googleMusicExecutor("toggleShuffle")).attr("title", chrome.i18n.getMessage("shuffle"));
    $("#playlistButton").click(showPlaylists).attr("title", chrome.i18n.getMessage("showPlaylists"));
    $("#volume").click(toggleVolumeControl).attr("title", chrome.i18n.getMessage("volumeControl"));
    $("#volumeBarBorder").click(setVolume);
  }

  function setupGoogleRating() {
    $("#googleRating").find("div.rating-container").find("a").click(function() {
      var cl = $(this).attr("class");
      var rating = cl.substr(cl.indexOf("rating-") + 7, 1);
      rate(rating);
    });
  }

  function songLovedWatcher(loved) {
    $("#lastfmRating").removeClass("loved notloved error");
    if (typeof(loved) == "string") {
      $("#lastfmRating").addClass("error")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmError") + loved)
        .unbind().click(bp.getLovedInfo);
    } else if (loved === true) {
      $("#lastfmRating").addClass("loved")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmUnlove"))
        .unbind().click(bp.unloveTrack);
    } else if (loved === false) {
      $("#lastfmRating").addClass("notloved")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmLove"))
        .unbind().click(bp.loveTrack);
    }
  }

  function toggleVolumeControl() {
    if (bp.player.volume != null) {
      $("#volumeBarContainer").toggle();
    }
  }
  
  function googleMusicExecutor(command) {
    return function() { bp.executeInGoogleMusic(command); };
  }

  function rate(rating) {
    var reset = bp.song.rating == rating;
    //auto-love if called by click event, no reset and not loved yet
    if (bp.settings.linkRatings && rating == 5 && !reset && bp.song.loved !== true) bp.loveTrack();
    bp.executeInGoogleMusic("rate", {rating: rating});
  }

  function playlistStart(pllink) {
    bp.executeInGoogleMusic("startPlaylist", {pllink: pllink});
  }

  function setSongPosition(event) {
    bp.executeInGoogleMusic("setPosition", {percent: event.offsetX / $(this).width()});
  }

  function setVolume(event) {
    bp.executeInGoogleMusic("setVolume", {percent: event.offsetX / $(this).width()});
  }

  function selectLink(link) {
    bp.selectInGoogleMusic(link);
    bp.openGoogleMusicTab();
  }

  $(function() {
    $("html").addClass(typeClass);
    $("head > title").first().text(chrome.i18n.getMessage("extTitle"));
    
    setupGoogleRating();
    
    renderPlayControls();
    
    $("#miniplayerlink")
      .click(bp.openMiniplayer)
      .attr("title", chrome.i18n.getMessage("openMiniplayer"));
      
    $("#nosong").find("span").text(chrome.i18n.getMessage("nothingPlaying"))
      .parent().find("a")
        .click(bp.openGoogleMusicTab)
        .text(chrome.i18n.getMessage("gotoGmusic"));
        
    $("#artist").click(function() {
      selectLink(bp.song.info.artistLink);
    });
    $("#album").click(function() {
      selectLink(bp.song.info.albumLink);
    });
    
    $("#scrobblePosition").attr("title", chrome.i18n.getMessage("scrobblePosition"));
    
    $("#timeBarHolder").click(setSongPosition);
    
    bp.localSettings.watch("lastfmSessionName", lastfmUserWatcher);
    bp.settings.watch("scrobble", scrobbleWatcher);
    bp.settings.watch("color", colorWatcher);
    
    bp.player.watch("repeat", repeatWatcher);
    bp.player.watch("shuffle", shuffleWatcher);
    bp.player.watch("playlists", playlistsWatcher);
    bp.player.watch("ratingMode", ratingModeWatcher);
    bp.player.watch("playing", playingWatcher);
    bp.player.watch("volume", volumeWatcher);
    bp.player.watch("connected", connectedWatcher);
    
    bp.song.watch("info", songInfoWatcher);
    bp.song.watch("positionSec", positionSecWatcher);
    bp.song.watch("rating", ratingWatcher);
    bp.song.watch("scrobbleTime", updateScrobblePosition);
    bp.song.watch("loved", songLovedWatcher);
    
    $(window).unload(function() {
      bp.settings.removeListener("layout", layoutWatcher);
      bp.localSettings.removeListener("lastfmSessionName", lastfmUserWatcher);
      bp.settings.removeListener("scrobble", scrobbleWatcher);
      bp.settings.removeListener("color", colorWatcher);
      
      bp.player.removeListener("repeat", repeatWatcher);
      bp.player.removeListener("shuffle", shuffleWatcher);
      bp.player.removeListener("playlists", playlistsWatcher);
      bp.player.removeListener("ratingMode", ratingModeWatcher);
      bp.player.removeListener("playing", playingWatcher);
      bp.player.removeListener("volume", volumeWatcher);
      bp.player.removeListener("connected", connectedWatcher);
      bp.player.removeListener("listenNowList", renderListenNow);
      
      bp.song.removeListener("info", songInfoWatcher);
      bp.song.removeListener("positionSec", positionSecWatcher);
      bp.song.removeListener("rating", ratingWatcher);
      bp.song.removeListener("scrobbleTime", updateScrobblePosition);
      bp.song.removeListener("loved", songLovedWatcher);
    });
    
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast") setToastAutocloseTimer();
  });

});