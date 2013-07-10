/**
 * This script does all the magic for the miniplayer and popup.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var typeClass = bp.justOpenedClass || "popup";
  bp.justOpenedClass = null;

  function layoutWatcher(val, old) {
    $("html").removeClass("layout-" + old).addClass("layout-" + val);
  }
  if (typeClass == "miniplayer") {
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
      getLovedInfo();
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

  function lastfmUserWatcher(user, old) {
    $("body").toggleClass("lastfm", user != null);
    if (user) {
      $("#lastfmUser")
        .attr("title", chrome.i18n.getMessage("lastfmUser") + user)
        .attr("href", "http://last.fm/user/" + user);
      if (user != old) getLovedInfo();//not on initialize to prevent requesting it twice (songInfoWatcher does it)
    }
  }

  function showPlaylists() {
    var playlistSectionTitle = chrome.i18n.getMessage("playlists");
    var playlists = bp.player.playlists;
    var playlistLinks = "";
    for (var i in playlists) {
      playlistLinks += "<div><a href='#' data-plid='" + playlists[i][0] + "' title='" + playlists[i][1] + "'>" + playlists[i][1] + "</a></div>";
    }
    $("#playlistContainer").html("<h2>" + playlistSectionTitle + "</h2>" + playlistLinks);
    $("#playlistContainer a").click(function() { playlistStart($(this).data("plid")); });
    $("#player").hide();
    $("#playlists").unbind().click(hidePlaylists).show();
  }

  function hidePlaylists() {
    $("#playlists").hide();
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
  }

  function setupGoogleRating() {
    $("#googleRating").find("div.rating-container").find("a").click(function() {
      var cl = $(this).attr("class");
      var rating = cl.substr(cl.indexOf("rating-") + 7, 1);
      rate(rating);
    });
  }

  function setLoveButtonStatus(loved, error) {
    if (error) {
      $("#lastfmRating").addClass("error")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmError") + error)
        .unbind().click(getLovedInfo);
    } else if (loved) {
      $("#lastfmRating").addClass("loved")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmUnlove"))
        .unbind().click(unloveTrack);
    } else {
      $("#lastfmRating").addClass("notloved")
        .find("a").attr("title", chrome.i18n.getMessage("lastfmLove"))
        .unbind().click(loveTrack);
    }
  }

  function getLovedInfo() {
    $("#lastfmRating").removeClass("loved notloved error");
    if (bp.localSettings.lastfmSessionName && bp.song.info) {
      bp.lastfm.track.getInfo({
          track: bp.song.info.title,
          artist: bp.song.info.artist,
          username: bp.localSettings.lastfmSessionName
        },
        {
          success: function(response) { setLoveButtonStatus(response.track && response.track.userloved == 1); },
          error: function(code, msg) {
            setLoveButtonStatus(false, msg);
            if (code != 9) bp.gaEvent("LastFM", "getInfoError-" + code);
          }
        }
      );
    }
  }

  function loveTrack(event) {
    $("#lastfmRating").removeClass("loved notloved error");
    bp.lastfm.track.love({
        track: bp.song.info.title,
        artist: bp.song.info.artist
      },
      {
        success: function(response) { setLoveButtonStatus(true); },
        error: function(code, msg) {
          setLoveButtonStatus(false, msg);
          if (code != 9) bp.gaEvent("LastFM", "loveError-" + code);
        }
      }
    );
    //auto-rate if this is a click event and not rated yet
    if (event != null && bp.settings.linkRatings && bp.song.rating == 0) rate(5, true);
  }

  function unloveTrack() {
    $("#lastfmRating").removeClass("loved notloved error");
    bp.lastfm.track.unlove({
        track: bp.song.info.title,
        artist: bp.song.info.artist
      },
      {
        success: function(response) { setLoveButtonStatus(false); },
        error: function(code, msg) {
          setLoveButtonStatus(false, msg);
          if (code != 9) bp.gaEvent("LastFM", "unloveError-" + code);
        }
      }
    );
  }

  function googleMusicExecutor(command) {
    return function() { bp.executeInGoogleMusic(command); };
  }

  function rate(rating, noLink) {
    var reset = bp.song.rating == rating;
    //auto-love if called by click event, no reset and not loved yet
    if (!noLink && bp.settings.linkRatings && rating == 5 && !reset && !$("#lastfmRating").hasClass("loved")) loveTrack();
    bp.executeInGoogleMusic("rate", {rating: rating});
  }

  function playlistStart(plsId) {
    bp.executeInGoogleMusic("startPlaylist", {plsId: plsId});
  }

  function selectArtist(artistId) {
    bp.executeInGoogleMusic("selectArtist", {artistId: artistId});
    bp.openGoogleMusicTab();
  }

  function selectAlbum(albumId) {
    bp.executeInGoogleMusic("selectAlbum", {albumId: albumId});
    bp.openGoogleMusicTab();
  }

  function setSongPosition(event) {
    bp.executeInGoogleMusic("setPosition", {percent: event.offsetX / $(this).width()});
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
      selectArtist(bp.song.info.artistId);
    });
    $("#album").click(function() {
      selectAlbum(bp.song.info.albumId);
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
    
    bp.song.watch("info", songInfoWatcher);
    bp.song.watch("positionSec", positionSecWatcher);
    bp.song.watch("rating", ratingWatcher);
    bp.song.watch("scrobbleTime", updateScrobblePosition);
    
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
      
      bp.song.removeListener("info", songInfoWatcher);
      bp.song.removeListener("positionSec", positionSecWatcher);
      bp.song.removeListener("rating", ratingWatcher);
      bp.song.removeListener("scrobbleTime", updateScrobblePosition);
    });
    
    if (typeClass == "miniplayer") {
      setupResizeMoveListeners();
    }
  });

});