/**
 * This script does all the magic for the miniplayer, popup and toasts.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
var bp = chrome.extension.getBackgroundPage();
var typeClass = bp.justOpenedClass || "popup";
bp.justOpenedClass = null;

function layoutWatcher(val, old) {
  $('html').removeClass("layout-" + old).addClass("layout-" + val);
}
if (typeClass == "miniplayer") {
  bp.settings.watch("layout", layoutWatcher);
} else {
  $('html').addClass("layout-normal");
}

$(function() {
  $('html').addClass(typeClass);
  $('head > title').first().text(chrome.i18n.getMessage('extTitle'));
  
  setupGoogleRating();
  
  renderPlayControls();
  
  $("#miniplayerlink")
    .click(bp.openMiniplayer)
    .attr('title', chrome.i18n.getMessage('openMiniplayer'));
    
  $('#nosong').find('span').text(chrome.i18n.getMessage('nothingPlaying'))
    .parent().find('div')
      .click(bp.openGoogleMusicTab)
      .text(chrome.i18n.getMessage('gotoGmusic'));
  
  $("#scrobblePosition").attr('title', chrome.i18n.getMessage('scrobblePosition'));
  
  bp.settings.watch("lastfmSessionName", lastfmUserWatcher);
  bp.settings.watch("scrobble", scrobbleWatcher);
  bp.settings.watch("color", colorWatcher);
  
  bp.player.watch("repeat", repeatWatcher);
  bp.player.watch("shuffle", shuffleWatcher);
  bp.player.watch("playlists", playlistsWatcher);
  bp.player.watch("ratingMode", ratingModeWatcher);
  bp.player.watch("playing", playingWatcher);
  
  bp.song.watch("info", songInfoWatcher);
  bp.song.watch("positionSec", positionWatcher);
  bp.song.watch("rating", ratingWatcher);
  bp.song.watch("scrobbleTime", updateScrobblePosition);
  
  $(window).unload(function() {
    bp.settings.removeListener("layout", layoutWatcher);
    bp.settings.removeListener("lastfmSessionName", lastfmUserWatcher);
    bp.settings.removeListener("scrobble", scrobbleWatcher);
    bp.settings.removeListener("color", colorWatcher);
    
    bp.player.removeListener("repeat", repeatWatcher);
    bp.player.removeListener("shuffle", shuffleWatcher);
    bp.player.removeListener("playlists", playlistsWatcher);
    bp.player.removeListener("ratingMode", ratingModeWatcher);
    bp.player.removeListener("playing", playingWatcher);
    
    bp.song.removeListener("info", songInfoWatcher);
    bp.song.removeListener("positionSec", positionWatcher);
    bp.song.removeListener("rating", ratingWatcher);
    bp.song.removeListener("scrobbleTime", updateScrobblePosition);
  });
  
  if (typeClass == "toast") {
    setToastAutocloseTimer();
  }
  
  if (typeClass == "miniplayer" && bp.settings.miniplayerType != "notification") {
    setupResizeMoveListeners();
  }
});

function repeatWatcher(val) {
  $('#repeat').attr('class', val);
}

function shuffleWatcher(val) {
  $('#shuffle').attr('class', val);
}

function playlistsWatcher(val) {
  if (val.length > 0) {
    $('#playlistButton').show();
  } else {
    $('#playlistButton').hide();
    hidePlaylists();
  }
  if ($("#playlists").is(":visible")) {
    showPlaylists();//re-render
  }
}

function playingWatcher(val) {
  if (val) {
    $('body').addClass('playing');
  } else {
    $('body').removeClass('playing');
  }
}

function songInfoWatcher(val) {
  if (val) {
    $("#songTime").text(val.duration);
    $("#artist").text(val.artist);
    $("#track").text(val.title);
    $("#album").text(val.album);
    $("#cover").attr('src', val.cover || "img/cover.png");
    getLovedInfo();
    //although the value of scrobbleTime might have not changed, the relative position might have
    updateScrobblePosition(bp.song.scrobbleTime);
    $("body").addClass('hasSong');
  } else {
    $("#cover").attr('src', "img/cover.png");
    $("body").removeClass('hasSong');
  }
}

function positionWatcher(val) {
  var width = 0;
  if (bp.song.info && bp.song.info.durationSec > 0) {
    width = (val / bp.song.info.durationSec * 100) + "%";
  }
  $("#currentTime").text(bp.song.position);
  $("#timeBar").css({width: width});
}

function ratingModeWatcher(val) {
  var buttons = $('#googleRating');
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
  if (val) {
    $('body').addClass('scrobbleEnabled');
  } else $('body').removeClass('scrobbleEnabled');
}

function colorWatcher(val, old) {
  $('html').removeClass("color-" + old).addClass("color-" + val);
}

function setupResizeMoveListeners() {
  var timerId;
  function doneResizing() {
    var sizing = bp.settings.miniplayerSizing;
    sizing[bp.settings.layout].width = window.innerWidth;
    sizing[bp.settings.layout].height = window.innerHeight;
    bp.settings.miniplayerSizing = sizing;
  }
  $(window).resize(function() {
      clearTimeout(timerId);
      timerId = setTimeout(doneResizing, 1000);
  });
  
  var oldX = window.screenX;
  var oldY = window.screenY;
  var interval = setInterval(function() {
    if (oldX != window.screenX || oldY != window.screenY) {
      oldX = window.screenX;
      oldY = window.screenY;
      var sizing = bp.settings.miniplayerSizing;
      sizing[bp.settings.layout].left = oldX;
      sizing[bp.settings.layout].top = oldY;
      bp.settings.miniplayerSizing = sizing;
    }
  }, 1000);
}

function setToastAutocloseTimer() {
  var windowTimer = setTimeout(window.close, bp.settings.toastDuration * 1000);
  window.onmouseout = function(e){
    windowTimer = setTimeout(window.close, 2000);
  }
  window.onmouseover = function(e){
    clearTimeout(windowTimer);
  }
}

function lastfmUserWatcher(user) {
  if (user) {
    $("#lastfmUser")
      .attr('title', chrome.i18n.getMessage('lastfmUser') + user)
      .attr('href', "http://last.fm/user/" + user);
    $('body').addClass('lastfm');
  } else {
    $('body').removeClass('lastfm');
  }
  getLovedInfo();
}

function showPlaylists() {
  var playlistSectionTitle = chrome.i18n.getMessage('playlists');
  var playlists = bp.player.playlists;
  var playlistLinks = "";
  for (var i in playlists) {
    playlistLinks += "<div><a href='#' data-plid='" + playlists[i][0] + "' title='" + playlists[i][1] + "'>" + playlists[i][1] + "</a></div>";
  }
  $('#playlistContainer').html('<h2>' + playlistSectionTitle + '</h2>' + playlistLinks);
  $('#playlistContainer a').click(function(){playlistStart($(this).data('plid'))});
  $('#player').hide();
  $('#playlists').unbind().click(hidePlaylists).show();
}

function hidePlaylists() {
  $("#playlists").hide();
  $('#player').show();
}

function renderPlayControls(){
  $('.playPause').click(playPause).each(function() {
    $(this).attr('title', chrome.i18n.getMessage($(this).id + 'Song'));
  });
  $('#prev').click(prevSong).attr('title', chrome.i18n.getMessage('prevSong'));
  $('#next').click(nextSong).attr('title', chrome.i18n.getMessage('nextSong'));
  $('#repeat').click(toggleRepeat).attr('title', chrome.i18n.getMessage('repeat'));
  $('#shuffle').click(toggleShuffle).attr('title', chrome.i18n.getMessage('shuffle'));
  $('#playlistButton').click(showPlaylists).attr('title', chrome.i18n.getMessage('showPlaylists'));
}

function setupGoogleRating() {
  $('#googleRating').find('div.rating-container').find('div').click(function() {
    var cl = $(this).attr('class');
    var rating = cl.substr(cl.indexOf("rating-") + 7, 1);
    rate(rating);
  });
}

function setLoveButtonStatus(loved) {
  if (loved) {
    $("#lastfmRating").addClass("loved")
      .find("div").attr('title', chrome.i18n.getMessage('lastfmUnlove'))
      .unbind().click(unloveTrack);
  } else {
    $("#lastfmRating").addClass("notloved")
      .find("div").attr('title', chrome.i18n.getMessage('lastfmLove'))
      .unbind().click(loveTrack);
  }
}

function getLovedInfo() {
  $("#lastfmRating").removeClass('loved notloved');
  if (bp.settings.lastfmSessionName && bp.song.info) {
    bp.lastfm.track.getInfo({
        track: bp.song.info.title,
        artist: bp.song.info.artist,
        username: bp.settings.lastfmSessionName
      },
      {
        success: function(response) { setLoveButtonStatus(response.track && response.track.userloved == 1); },
        error: function(code) { /*TODO consider showing errors*/setLoveButtonStatus(false); }
      }
    );
  }
}

function loveTrack() {
  $("#lastfmRating").removeClass('loved notloved');
  bp.lastfm.track.love({
      track: bp.song.info.title,
      artist: bp.song.info.artist
    },
    {
      success: function(response) { setLoveButtonStatus(true); },
      error: function(code) { /*TODO consider showing errors*/setLoveButtonStatus(false); }
    }
  );
}

function unloveTrack() {
  $("#lastfmRating").removeClass('loved notloved');
  bp.lastfm.track.unlove({
      track: bp.song.info.title,
      artist: bp.song.info.artist
    },
    {
      success: function(response) { setLoveButtonStatus(false); },
      error: function(code) { /*TODO consider showing errors*/setLoveButtonStatus(false); }
    }
  );
}

function playPause(){
  bp.executeInGoogleMusic("playPause");
}

function prevSong(){
  bp.executeInGoogleMusic("prevSong");
}

function nextSong(){
  bp.executeInGoogleMusic("nextSong");
}

function toggleRepeat() {
  bp.executeInGoogleMusic("toggleRepeat");
}

function toggleShuffle() {
  bp.executeInGoogleMusic("toggleShuffle");
}

function rate(rating) {
  bp.executeInGoogleMusic("rate", {rating: rating});
}

function playlistStart(plsId) {
  bp.executeInGoogleMusic("startPlaylist", {plsId: plsId});
}
