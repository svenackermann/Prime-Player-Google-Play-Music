/**
 * The main code for the background page.
 * Manages connections, settings, the miniplayer and much more.
 * @author Sven Ackermann (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */

/** settings that must not be synced with Chrome sync */
var LOCAL_SETTINGS_DEFAULTS = {
  lastfmSessionKey: null,
  lastfmSessionName: null,
  googleAccountNo: 0,
  syncSettings: false,
  lyrics: false,
  lyricsFontSize: 11,
  lyricsWidth: 250,
  miniplayerSizing: {
    normal:   { width: 286, height: 153, left: 0, top: 0 },
    compact1: { width: 281, height: 118, left: 0, top: 0 },
    compact2: { width: 211, height: 163, left: 0, top: 0 },
    hbar:     { width: 531, height: 68,  left: 0, top: 0 }
  },
  playlistsListSizing: {width: 350, height: 320},
  playlistSizing: {width: 500, height: 295},
  quicklinksSizing: {width: 280, height: 160},
  albumContainersSizing: {width: 220, height: 320},
  searchresultSizing: {width: 350, height: 320},
  lyricsSizing: {width: 400, height: 400},
  timerMinutes: 60,
  timerAction: "pause",
  timerNotify: true,
  timerPreNotify: 0,
  notificationsEnabled: true
}
var localSettings = new Bean(LOCAL_SETTINGS_DEFAULTS, true);

/** settings that should be synced with Chrome sync if enabled */
var SETTINGS_DEFAULTS = {
  scrobble: true,
  scrobblePercent: 50,
  scrobbleTime: 240,
  scrobbleMaxDuration: 30,
  disableScrobbleOnFf: false,
  scrobbleRepeated: true,
  linkRatings: false,
  showLovedIndicator: false,
  showScrobbledIndicator: true,
  showLastfmInfo: false,
  toast: true,
  toastUseMpStyle: false,
  toastDuration: 0,
  toastProgress: false,
  toastIfMpOpen: false,
  toastClick: "",
  toastButton1: "nextSong",
  toastButton2: "playPause",
  miniplayerType: "popup",
  layout: "normal",
  color: "turq",
  mpBgColor: "#eeeeee",
  mpTextColor: "#000000",
  coverClickLink: "now",
  titleClickLink: "ap/queue",
  openLinksInMiniplayer: true,
  hideSearchfield: false,
  hideRatings: false,
  omitUnknownAlbums: false,
  mpAutoOpen: false,
  mpAutoClose: false,
  mpCloseGm: false,
  openLyricsInMiniplayer: true,
  lyricsInGpm: false,
  lyricsAutoReload: false,
  iconStyle: "default",
  showPlayingIndicator: true,
  showRatingIndicator: false,
  showProgress: false,
  showProgressColor: "#ff0000",
  saveLastPosition: false,
  skipRatedLower: 0,
  iconClickAction0: "",
  iconClickAction1: "",
  iconClickAction2: "",
  iconClickAction3: "",
  iconDoubleClickTime: 0,
  iconClickConnect: false,
  openGoogleMusicPinned: false,
  connectedIndicator: true,
  preventCommandRatingReset: true,
  updateNotifier: true,
  gaEnabled: true,
  optionsMode: "beg",
  filterTimer: true,
  filterLastfm: true,
  filterToast: true,
  filterMiniplayer: true,
  filterLyrics: true
};
var settings = new Bean(SETTINGS_DEFAULTS, true);

/** the miniplayer instance, if opened */
var miniplayer;
/** if the toast notification is opened, its options */
var toastOptions;
/** the toast window (if toastUseMpStyle) */
var toastWin;
/** the XMLHttpRequest for the toast cover */
var toastCoverXhr;
/** the currently connected port with its tab */
var googlemusicport;
var googlemusictabId;
/** ID of the options tab, if opened */
var optionsTabId;
/** ports waiting for a connection when another tab was already connected (if multiple tabs with Google Music  are opened) */
var parkedPorts = [];
/** whether to view the update notifier (set in onInstalled event listener) */
var viewUpdateNotifier = localStorage["viewUpdateNotifier"] || false;
/** the previous version, if we just updated (set in onInstalled event listener, used by options page) */
var previousVersion = localStorage["previousVersion"];
/** the volume before mute for restoring */
var volumeBeforeMute;
/** true, if the position came from update backup data, needed to not set ff by mistake */
var positionFromBackup = false;
/** the link of navigation list to load when Google Music has just connected (if any) */
var loadNavlistLink;
var loadNavlistSearch;
/** whether feelingLucky is requested */
var feelingLucky = false;
/** if resumeLastSong was called while not connected */
var lastSongToResume;
/** for correct calculation of song.ff on resume */
var lastSongPositionSec;

/** the song currently loaded */
var SONG_DEFAULTS = {
  position: "0:00",
  positionSec: 0,
  info: null,
  rating: -1,
  loved: null,
  lastfmInfo: null,
  nowPlayingSent: false,
  scrobbled: false,
  toasted: false,
  scrobbleTime: -1,
  timestamp: null,
  ff: false
};
var song = new Bean(SONG_DEFAULTS);
/** the current player state */
var PLAYER_DEFAULTS = {
  ratingMode: null,
  shuffle: "",
  repeat: "",
  playing: null,
  volume: null,
  navigationList: null,
  listrating: null,
  quicklinks: null,
  connected: false,
  favicon: "img/icon/default/notconnected.png"
};
var player = new Bean(PLAYER_DEFAULTS);

var LASTFM_APIKEY = "1ecc0b24153df7dc6ac0229d6fcb8dda";
var LASTFM_APISECRET = "fb4b74854f7a7b099c30bfe71236dfd5";
var lastfm = new LastFM({apiKey: LASTFM_APIKEY, apiSecret: LASTFM_APISECRET});
lastfm.session.key = localSettings.lastfmSessionKey;
lastfm.session.name = localSettings.lastfmSessionName;
lastfm.unavailableMessage = chrome.i18n.getMessage("lastfmUnavailable");

var currentVersion = chrome.runtime.getManifest().version;

function noop() {/* not interesting, but sometimes required */}

//wrap chrome notifications API for convenience
function Notification() {
  var that = this;
  var notifications = {};
  function globalNotificationListener(evt, id, arg2) {
    var forId = notifications[id];
    if (forId && forId[evt]) for (var i = 0; i < forId[evt].length; i++) forId[evt][i](arg2);
  }
  var globalClickListener = globalNotificationListener.bind(window, "click");
  var globalBtnClickListener = globalNotificationListener.bind(window, "btnClick");
  var globalCloseListener = globalNotificationListener.bind(window, "close");
  
  this.RELOGIN = "pp.relogin";
  this.TOAST = "pp.toast";
  this.WELCOME = "pp.welcome";
  this.TIMEREND = "pp.timerEnd";
  this.TIMERWARN = "pp.timerwarn";
  
  this.create = function(id, options, cb) {
    if (localSettings.notificationsEnabled) chrome.notifications.create(id, options, function(nid) {
      notifications[nid] = {click: [], btnClick: [], close: []};
      cb(nid);
      that.addListener("close", nid, function() { delete(notifications[nid]); });
    });
  };
  this.update = function(id, options, cb) { if (localSettings.notificationsEnabled) chrome.notifications.update(id, options, cb || noop); };
  this.clear = function(id, cb) { if (localSettings.notificationsEnabled) chrome.notifications.clear(id, cb || noop); };
  this.addListener = function(evt, id, cb) { notifications[id][evt].push(cb); };
  this.init = function() {
    if (!chrome.notifications.onClicked.hasListener(globalClickListener)) chrome.notifications.onClicked.addListener(globalClickListener);
    if (!chrome.notifications.onButtonClicked.hasListener(globalBtnClickListener)) chrome.notifications.onButtonClicked.addListener(globalBtnClickListener);
    if (!chrome.notifications.onClosed.hasListener(globalCloseListener)) chrome.notifications.onClosed.addListener(globalCloseListener);
  };
};
var notifications = new Notification();

function songsEqual(song1, song2) {
  if (song1 == song2) return true;//both null
  if (song1 != null && song2 != null
      && (song1.duration == null || song2.duration == null || song1.duration == song2.duration)
      && song1.title == song2.title
      && song1.artist == song2.artist
      && song1.album == song2.album) {
    return true;
  }
  return false;
}
song.setEqualsFn("info", songsEqual);

var browserIconCtx;
var lastProgressPosition = 0;
function drawProgress() {
  if (settings.showProgress && browserIconCtx && song.positionSec > 0) {
    lastProgressPosition = song.positionSec;
    browserIconCtx.strokeStyle = settings.showProgressColor;
    browserIconCtx.lineWidth = 3;
    browserIconCtx.beginPath();
    browserIconCtx.arc(9, 10, 8, 1.5 * Math.PI, (2 * lastProgressPosition / song.info.durationSec - 0.5) * Math.PI);
    browserIconCtx.stroke();
    return true;
  }
  return false;
}

function draw(backgroundSrc, imagePaths, callback) {
  var iconCtx = $("<canvas width='19' height='19'/>").get(0).getContext("2d");
  var image = new Image();
  function loadNext() {
    var path = imagePaths.shift();
    if (path) image.src = chrome.extension.getURL(path + ".png")
    else callback(iconCtx);
  }
  image.onload = function() {
    iconCtx.drawImage(image, 0, 0);
    loadNext();
  };
  image.src = chrome.extension.getURL(backgroundSrc);
}

function updateBrowserIcon() {
  chrome.browserAction.setIcon({imageData: browserIconCtx.getImageData(0, 0, 19, 19)});
}

/** handler for all events that need to update the browser action icon/title */
function updateBrowserActionInfo() {
  var iconPath = "img/icon/";
  var path = iconPath + settings.iconStyle + "/";
  var title = chrome.i18n.getMessage("extTitle");
  var iconPaths = [];
  var faviconPaths = [];
  chrome.browserAction.setBadgeText({text: ""});
  if (viewUpdateNotifier) {
    path = iconPath + "updated";
    title += " - " + chrome.i18n.getMessage("browserActionTitle_updated");
  } else if (player.connected) {
    path += "connected";
    if (song.info) {
      title = song.info.artist + " - " + song.info.title;
      if (song.scrobbled && settings.showScrobbledIndicator) {
        iconPaths.push(iconPath + "scrobbled");
        faviconPaths.push(iconPath + "scrobbled");
        title += " (" + chrome.i18n.getMessage("browserActionTitle_scrobbled") + ")";
      }
      if (song.loved === true && settings.showLovedIndicator) {
        iconPaths.push(iconPath + "loved");
        faviconPaths.push(iconPath + "loved");
      }
      if (song.rating && settings.showRatingIndicator) {
        if (player.ratingMode == "star") {
          chrome.browserAction.setBadgeText({text: "" + song.rating});
        } else if (player.ratingMode == "thumbs") {
          if (song.rating >= 4) {
            iconPaths.push(iconPath + "thumbsUp");
            faviconPaths.push(iconPath + "thumbsUp");
          } else if (song.rating == 1 || song.rating == 2) {
            iconPaths.push(iconPath + "thumbsDown");
            faviconPaths.push(iconPath + "thumbsDown");
          }
        }
      }
      if (settings.showPlayingIndicator) {
        if (player.playing) {
          iconPaths.push(iconPath + (settings.iconClickAction0 == "playPause" ? "pause" : "playing"));
          faviconPaths.push(iconPath + "playing");
          title = chrome.i18n.getMessage("browserActionTitle_playing") + ": " + title;
        } else {
          iconPaths.push(iconPath + (settings.iconClickAction0 == "playPause" ? "play" : "paused"));
          faviconPaths.push(iconPath + "paused");
          title = chrome.i18n.getMessage("browserActionTitle_paused") + ": " + title;
        }
      }
    } else {
      title += " - " + chrome.i18n.getMessage("browserActionTitle_connected");
    }
  } else {
    path += "notconnected";
  }
  path += ".png";
  
  draw(path, iconPaths, function(iconCtx) {
    browserIconCtx = iconCtx;
    drawProgress();
    updateBrowserIcon();
  });
  if (faviconPaths.length) draw(path, faviconPaths, function(iconCtx) {
    player.favicon = iconCtx.canvas.toDataURL();
  }); else player.favicon = path;
  chrome.browserAction.setTitle({title: title});
}

function removeParkedPort(port) {
  for (var i = 0; i < parkedPorts.length; i++) {
    if (port == parkedPorts[i]) {
      parkedPorts.splice(i, 1);
      return;
    }
  }
}

/** use the given port for the connection to Google Music */
function connectPort(port) {
  googlemusicport = port;
  googlemusictabId = port.sender.tab.id;
  port.onMessage.addListener(onMessageListener);
  port.onDisconnect.addListener(onDisconnectListener);
  port.postMessage({type: "connected"});
  iconClickSettingsChanged();
}

/** Check if the given port's tab is already connected */
function isConnectedTab(port) {
  if (googlemusicport && port.sender.tab.id == googlemusicport.sender.tab.id) return true;
  for (var i = 0; i < parkedPorts.length; i++) {
    if (port.sender.tab.id == parkedPorts[i].sender.tab.id) return true;
  }
  return false;
}

/** handler for onConnect event
 * - check origin
 * - check if tab already connected
 * - check if another tab is already connected
 * - otherwise connect the port
 */
function onConnectListener(port) {
  console.assert(port.name == "googlemusic");
  if (isConnectedTab(port)) {
    port.postMessage({type: "alreadyConnected"});
  } else {
    if (googlemusicport) {
      parkedPorts.push(port);
      port.onDisconnect.addListener(removeParkedPort);
    } else {
      connectPort(port);
    }
  }
}

/** handler for onDisconnect event - reset player/song to defaults, try to connect a parked port */
function onDisconnectListener() {
  googlemusicport = null;
  googlemusictabId = null;
  iconClickSettingsChanged();
  
  song.resetToDefaults();
  player.resetToDefaults();
  
  //try to connect another tab
  while (parkedPorts.length > 0) {
    var parkedPort = parkedPorts.shift();
    try {
      parkedPort.onDisconnect.removeListener(removeParkedPort);
      connectPort(parkedPort);
      break;
    } catch (e) {
      //seems to be disconnected, try next
    }
  }
}

/** handler for messages from connected port - set song or player state */
function onMessageListener(message) {
  var val = message.value;
  var type = message.type;
  if (type.indexOf("song-") == 0) {
    if (type == "song-position" && val == "") val = SONG_DEFAULTS.position;
    song[type.substring(5)] = val;
  } else if (type.indexOf("player-") == 0) {
    player[type.substring(7)] = val;
  } else if (type == "loadLyrics") {
    if (song.info) fetchLyrics(song.info, function(result) {
      //we cannot send jQuery objects with a post, so send plain html
      if (result.lyrics) result.lyrics = result.lyrics.html();
      if (result.credits) result.credits = result.credits.html();
      if (result.title) result.title = result.title.text().trim();
      postToGooglemusic({type: "lyrics", result: result});
    });
  }
}

function postToGooglemusic(msg) {
  if (googlemusicport) {
    googlemusicport.postMessage(msg);
  }
}

function postLyricsState() {
  postToGooglemusic({type: "lyricsState",
    enabled: localSettings.lyrics && settings.lyricsInGpm,
    fontSize: localSettings.lyricsFontSize,
    width: localSettings.lyricsWidth,
    autoReload: settings.lyricsAutoReload
  });
}

/** Load the navigation list identified by 'loadNavlistLink'. If not connected, open a Google Music tab and try again. */
function loadNavlistIfConnected() {
  if (!loadNavlistLink) return;
  if (player.connected) {
    postToGooglemusic({type: "getNavigationList", link: loadNavlistLink, search: loadNavlistSearch, omitUnknownAlbums: loadNavlistLink == "albums" && settings.omitUnknownAlbums});
    loadNavlistLink = null;
    loadNavlistSearch = null;
  } else openGoogleMusicTab(loadNavlistLink);//when connected, we get triggered again
}

function loadNavigationList(link, search) {
  loadNavlistLink = link;
  loadNavlistSearch = search;
  loadNavlistIfConnected();
}

function selectLink(link) {
  postToGooglemusic({type: "selectLink", link: link});
  openGoogleMusicTab(link);
}

function startPlaylist(link) {
  postToGooglemusic({type: "startPlaylist", link: link});
}

function executeFeelingLuckyIfConnected() {
  if (!feelingLucky) return;
  if (player.connected) {
    executeInGoogleMusic("feelingLucky");
    feelingLucky = false;
  } else openGoogleMusicTab();//when connected, we get triggered again
}

function executeFeelingLucky() {
  feelingLucky = true;
  executeFeelingLuckyIfConnected();
}

function resumeLastSongIfConnected() {
  if (!lastSongToResume) return;
  if (player.connected) {
    postToGooglemusic({type: "resumeLastSong",
      albumLink: lastSongToResume.info.albumLink,
      artist: lastSongToResume.info.artist,
      title: lastSongToResume.info.title,
      duration: lastSongToResume.info.duration,
      position: lastSongToResume.positionSec / lastSongToResume.info.durationSec
    });
  } else openGoogleMusicTab();//when connected, we get triggered again
}

function resumeLastSong(lastSong) {
  lastSongToResume = lastSong;
  resumeLastSongIfConnected();
}

/** send a command to the connected Google Music port */
function executeInGoogleMusic(command, options) {
  postToGooglemusic({type: "execute", command: command, options: options || {}});
}

function executePlayPause() {
  executeInGoogleMusic("playPause");
}

function isScrobblingEnabled() {
  return settings.scrobble && localSettings.lastfmSessionKey != null;
}

/** @return song position in seconds when the song will be scrobbled or -1 if disabled */
function calcScrobbleTime() {
  if (song.scrobbled) return;
  if (song.info
  && song.info.durationSec > 0
  && isScrobblingEnabled()
  && !(song.ff && settings.disableScrobbleOnFf)
  && !(settings.scrobbleMaxDuration > 0 && song.info.durationSec > (settings.scrobbleMaxDuration * 60))) {
    var scrobbleTime = song.info.durationSec * (settings.scrobblePercent / 100);
    if (settings.scrobbleTime > 0 && scrobbleTime > settings.scrobbleTime) {
      scrobbleTime = settings.scrobbleTime;
    }
    //leave 3s at the beginning and end to be sure the correct song will be scrobbled
    scrobbleTime = Math.min(song.info.durationSec - 3, Math.max(3, scrobbleTime));
    song.scrobbleTime = scrobbleTime;
  } else {
    song.scrobbleTime = -1;
  }
}

/** @return time in seconds that a time string represents (e.g. 4:23 - 263) */
function parseSeconds(time) {
  if (typeof(time) != "string") return 0;
  time = time.split(':');
  var sec = 0;
  var factor = 1;
  for (var i = time.length - 1; i >= 0; i--) {
    sec += parseInt(time[i], 10) * factor;
    factor *= 60;
  }
  return sec || 0;
}

function toTimeString(sec) {
  if (sec > 60*60*24) return chrome.i18n.getMessage("moreThanOneDay");
  if (sec < 10) return "0:0" + sec;
  if (sec < 60) return "0:" + sec;
  var time = "";
  while (true) {
    var cur = sec % 60;
    time = cur + time;
    if (sec == cur) return time;
    time = (cur < 10 ? ":0" : ":") + time;
    sec = (sec - cur) / 60;
  }
}

function getTextForQuicklink(link) {
  if (link == "myPlaylists") return chrome.i18n.getMessage("myPlaylists");
  var text;
  if (link && player.quicklinks) {//try to get text from Google site
    text = player.quicklinks[link];
  }
  //use default
  return text || chrome.i18n.getMessage("quicklink_" + link.replace(/-/g, "_").replace(/\//g, "_"));
}

function getTextForToastBtn(cmd) {
  var key;
  switch (cmd) {
    case "playPause":
    case "prevSong":
    case "nextSong":
    case "openMiniplayer":
    case "feelingLucky":
      key = cmd;
      break;
    case "rate-1":
      if (player.ratingMode == "star") key = "command_star1"
      else if (player.ratingMode == "thumbs") key = "command_thumbsDown"
      else key = "command_rate1";
      break;
    case "rate-5":
      if (player.ratingMode == "star") key = "command_star5"
      else if (player.ratingMode == "thumbs") key = "command_thumbsUp"
      else key = "command_rate5";
      break;
    default:
      key = "command_" + cmd.replace(/-/g, "");
  }
  return chrome.i18n.getMessage(key);
}

function cacheForLaterScrobbling(songInfo) {
  var scrobbleCache = localStorage["scrobbleCache"];
  scrobbleCache = scrobbleCache ? JSON.parse(scrobbleCache) : {};
  if (scrobbleCache.user != localSettings.lastfmSessionName) {
    scrobbleCache.songs = [];
    scrobbleCache.user = localSettings.lastfmSessionName;
  }
  
  while (scrobbleCache.songs.length >= 50) {
    scrobbleCache.songs.shift();
  }
  scrobbleCache.songs.push(songInfo);
  localStorage["scrobbleCache"] = JSON.stringify(scrobbleCache);
}

function isScrobbleRetriable(code) {
  return code == 16 || code == 11 || code == 9 || code == -1;
}

function scrobbleCachedSongs() {
  var scrobbleCache = localStorage["scrobbleCache"];
  if (scrobbleCache) {
    scrobbleCache = JSON.parse(scrobbleCache);
    if (scrobbleCache.user != localSettings.lastfmSessionName) {
      localStorage.removeItem("scrobbleCache");
      return;
    }
    var params = {};
    for (var i = 0; i < scrobbleCache.songs.length; i++) {
      var curSong = scrobbleCache.songs[i];
      for (var prop in curSong) {
        params[prop + "[" + i + "]"] = curSong[prop];
      }
    }
    lastfm.track.scrobble(params,
      {
        success: function() {
          localStorage.removeItem("scrobbleCache");
          gaEvent("LastFM", "ScrobbleCachedOK");
        },
        error: function(code) {
          console.debug("Error on cached scrobbling: " + code);
          if (!isScrobbleRetriable(code)) localStorage.removeItem("scrobbleCache");
          gaEvent("LastFM", "ScrobbleCachedError-" + code);
        }
      }
    );
  }
}

function scrobble() {
  var params = {
    track: song.info.title,
    timestamp: song.timestamp,
    artist: song.info.artist,
    album: song.info.album,
    duration: song.info.durationSec
  };
  var cloned = $.extend({}, params);//clone now, lastfm API will enrich params with additional values we don't need
  lastfm.track.scrobble(params,
    {
      success: function() {
        gaEvent("LastFM", "ScrobbleOK");
        scrobbleCachedSongs();//try cached songs again now that the service seems to work again
      },
      error: function(code) {
        console.debug("Error on scrobbling '" + params.track + "': " + code);
        if (isScrobbleRetriable(code)) cacheForLaterScrobbling(cloned);
        gaEvent("LastFM", "ScrobbleError-" + code);
      }
    }
  );
}

function sendNowPlaying() {
  lastfm.track.updateNowPlaying({
      track: song.info.title,
      artist: song.info.artist,
      album: song.info.album,
      duration: song.info.durationSec
    },
    {
      success: function() { gaEvent("LastFM", "NowPlayingOK"); },
      error: function(code) {
        console.debug("Error on now playing '" + song.info.title + "': " + code);
        gaEvent("LastFM", "NowPlayingError-" + code);
      }
    }
  );
}

function getLastfmInfo(songInfo, callback) {
  if (songInfo) {
    var params = { track: songInfo.title, artist: songInfo.artist };
    if (localSettings.lastfmSessionName) params.username = localSettings.lastfmSessionName;
    lastfm.track.getInfo(params, {
        success: function(response) {
          var loved = null;
          var lastfmInfo = null;
          if (response.track) {
            lastfmInfo = {
              listeners: response.track.listeners || 0,
              playcount: response.track.playcount || 0,
              userplaycount: response.track.userplaycount || 0,
              url: response.track.url,
              artistUrl: response.track.artist && response.track.artist.url,
              albumUrl: response.track.album && response.track.album.url
            };
            if (params.username) loved = response.track.userloved == 1;
          }
          callback(loved, lastfmInfo);
        },
        error: function(code, msg) {
          callback(msg, null);
          gaEvent("LastFM", "getInfoError-" + code);
        }
      }
    );
  } else callback(null, null);
}

function getCurrentLastfmInfo() {
  song.loved = null;
  song.lastfmInfo = null;
  getLastfmInfo(song.info, function(loved, lastfmInfo) {
    song.loved = loved;
    song.lastfmInfo = lastfmInfo;
  });
}

function love(songInfo, callback) {
  if (localSettings.lastfmSessionKey && songInfo) {
    lastfm.track.love({
        track: songInfo.title,
        artist: songInfo.artist
      },
      {
        success: function() { callback(true); },
        error: function(code, msg) {
          callback(msg);
          gaEvent("LastFM", "loveError-" + code);
        }
      }
    );
  }
}

function loveTrack(event, aSong) {
  if (aSong == undefined) aSong = song;
  aSong.loved = null;
  love(aSong.info, function(loved) { aSong.loved = loved; });
  //auto-rate if called by click event and not rated yet
  if (event != null && settings.linkRatings && aSong.rating == 0) executeInGoogleMusic("rate", {rating: 5});
}

function unlove(songInfo, callback) {
  if (localSettings.lastfmSessionKey && songInfo) {
    lastfm.track.unlove({
        track: songInfo.title,
        artist: songInfo.artist
      },
      {
        success: function() { callback(false); },
        error: function(code, msg) {
          callback(msg);
          gaEvent("LastFM", "unloveError-" + code);
        }
      }
    );
  }
}

function unloveTrack() {
  song.loved = null;
  unlove(song.info, function(loved) { song.loved = loved; });
}

/** open the last.fm authentication page */
function lastfmLogin() {
  var callbackUrl = chrome.extension.getURL("options.html");
  var url = "http://www.last.fm/api/auth?api_key=" + LASTFM_APIKEY + "&cb=" + callbackUrl;
  if (optionsTabId) {
    chrome.tabs.update(optionsTabId, { url: url, active: true });
  } else {
    chrome.tabs.create({ url: url });
  }
  gaEvent("LastFM", "AuthorizeStarted");
}

/** reset last.fm session */
function lastfmLogout() {
  lastfm.session = {};
  localSettings.lastfmSessionKey = null;
  localSettings.lastfmSessionName = null;
  song.loved = null;
}

/** logout from last.fm and show a notification to login again */
function relogin() {
  lastfmLogout();
  notifications.create(notifications.RELOGIN, {
    type: "basic",
    title: chrome.i18n.getMessage("lastfmSessionTimeout"),
    message: chrome.i18n.getMessage("lastfmRelogin"),
    iconUrl: chrome.extension.getURL("img/icon-48x48.png"),
    isClickable: true
  }, function(nid) {
    notifications.addListener("click", nid, function() {
      notifications.clear(nid);
      lastfmLogin();
    });
  });
}
lastfm.sessionTimeoutCallback = relogin;

function toastClosed() {
  toastOptions = null;
  song.removeListener("rating", drawToastImage);
  song.removeListener("loved", drawToastImage);
  if (toastCoverXhr) {
    toastCoverXhr.abort();
    toastCoverXhr = null;
  }
}
  
function toastMpClosed(winId) {
  if (toastWin && winId == toastWin.id) {
    toastWin = null;
    chrome.windows.onRemoved.removeListener(toastMpClosed);
  }
}

function toastButtonClicked(buttonIndex) {
  //check which button was clicked and that the button is valid (otherwise it is not displayed and we would execute the wrong command)
  var cmd = settings.toastButton1;
  var btn = getToastBtn(cmd);
  if (!btn || buttonIndex == 1) {
    cmd = settings.toastButton2;
    btn = getToastBtn(cmd);
  }
  if (btn) executeCommand(cmd);
}

function getToastBtn(cmd) {
  if (!cmd) return null;
  var icon = cmd;
  switch (cmd) {
    case "loveUnloveSong":
      if (!localSettings.lastfmSessionKey) return null;
      break;
    case "toggleRepeat":
      if (!player.repeat) return null;
      break;
    case "toggleShuffle":
      if (!player.shuffle) return null;
      break;
    case "rate-1":
      if (player.ratingMode == "thumbs") icon = "thumbsDown"
      break;
    case "rate-5":
      if (player.ratingMode == "thumbs") icon = "thumbsUp"
      break;
    case "rate-2":
    case "rate-3":
    case "rate-4":
      if (player.ratingMode == "thumbs") return null;
      break;
  }
  return {title: getTextForToastBtn(cmd), iconUrl: chrome.extension.getURL("img/toast/" + icon + ".png")};
}

function drawToastImage() {
  if (!song.info || !toastOptions) return;
  var cover = new Image();
  var rating = new Image();
  var coverReady = false;
  var ratingReady = false;
  function draw() {
    if (!toastOptions) return;//might be closed already
    var ctx = $("<canvas width='100' height='100'/>").get(0).getContext("2d");
    ctx.drawImage(cover, 0, 0, 100, 100);
    if (cover.src.indexOf("blob") == 0) URL.revokeObjectURL(cover.src);
    if (player.ratingMode == "thumbs") {
      if (song.rating == 1 || song.rating == 2) ctx.drawImage(rating, 16, 0, 16, 16, 0, 84, 16, 16)
      else if (song.rating >= 4) ctx.drawImage(rating, 0, 0, 16, 16, 0, 84, 16, 16);
    } else if (player.ratingMode == "star") {
      for (i = 0; i < song.rating; i++) {
        ctx.drawImage(rating, 32, 0, 16, 16, i * 16, 84, 16, 16);
      }
    }
    if (song.loved === true) {
      ctx.drawImage(rating, 48, 0, 16, 16, 84, 84, 16, 16);
    }
    toastOptions.iconUrl = ctx.canvas.toDataURL();
    notifications.update(notifications.TOAST, toastOptions);
  };
  
  if (song.rating > 0 || song.loved === true) {
    rating.onload = function() { ratingReady = true;  if (coverReady) draw(); };
    rating.src = chrome.extension.getURL("img/rating.png");
  } else ratingReady = true;
  
  cover.onload = function() { coverReady = true; if (ratingReady) draw(); };
  if (song.info.cover) {
    //we need a Cross-origin XMLHttpRequest
    toastCoverXhr = new XMLHttpRequest();
    toastCoverXhr.open("GET", song.info.cover, true);
    toastCoverXhr.responseType = "blob";
    toastCoverXhr.onload = function() {
      toastCoverXhr = null;
      cover.src = URL.createObjectURL(this.response);
    };
    toastCoverXhr.onerror = function() {
      toastCoverXhr = null;
      cover.src = chrome.extension.getURL("img/cover.png");
    };
    toastCoverXhr.send();
  } else {
    cover.src = chrome.extension.getURL("img/cover.png");
  }
}

var closeToastTimer;
function openToast() {
  clearTimeout(closeToastTimer);
  if (settings.toastUseMpStyle) {
    createPlayer("toast", function(win) {
      toastWin = win;
      chrome.windows.onRemoved.addListener(toastMpClosed);
    }, false);
  } else {
    var btns = [];
    var btn = getToastBtn(settings.toastButton1);
    if (btn) btns.push(btn);
    btn = getToastBtn(settings.toastButton2);
    if (btn) btns.push(btn);
    
    var options = {
      type: settings.toastProgress ? "progress" : "basic",
      title: song.info.title,
      message: song.info.artist,
      contextMessage: song.info.album,
      iconUrl: chrome.extension.getURL("img/cover.png"),
      buttons: btns,
      isClickable: settings.toastClick != ""
    };
    if (settings.toastProgress) options.progress = Math.floor(song.positionSec * 100 / song.info.durationSec);
    notifications.create(notifications.TOAST, options, function(nid) {
      toastOptions = options;
      notifications.addListener("close", nid, toastClosed);
      notifications.addListener("click", nid, function() { if (settings.toastClick) executeCommand(settings.toastClick); });
      notifications.addListener("btnClick", nid, toastButtonClicked);
      song.watch("rating", drawToastImage);
      song.addListener("loved", drawToastImage);
    });
    if (settings.toastDuration > 0) {
      closeToastTimer = setTimeout(closeToast, settings.toastDuration * 1000);
    }
  }
}

function closeToast(callback) {
  clearTimeout(closeToastTimer);
  if (typeof(callback) != "function") callback = noop;
  if (toastOptions) notifications.clear(notifications.TOAST, callback)
  else if (toastWin) chrome.windows.remove(toastWin.id, callback)
  else callback();
}

/** open toast notification */
function toastPopup() {
  if (!song.toasted && settings.toast && (settings.toastIfMpOpen || !miniplayer)) {
    song.toasted = true;
    closeToast(openToast);
  }
}

function closeGm() {
  if (googlemusictabId) chrome.tabs.remove(googlemusictabId);
}

var miniplayerReopen = false;
/** reset state when miniplayer is closed, reopen if neccessary */
function miniplayerClosed(winId) {
  if (miniplayer) {
    if (winId != miniplayer.id) return;//some other window closed
    chrome.windows.onRemoved.removeListener(miniplayerClosed);
    miniplayer = null;
    if (miniplayerReopen) openMiniplayer();
    else if (settings.mpCloseGm) closeGm();
    miniplayerReopen = false;
  }
}

function createPlayer(type, callback, focused) {
  var sizing = localSettings.miniplayerSizing[settings.layout];
  chrome.windows.create({
      url: chrome.extension.getURL("player.html") + "?type=" + type,
      height: sizing.height,
      width: sizing.width,
      top: sizing.top,
      left: sizing.left,
      type: settings.miniplayerType,
      focused: focused
    }, callback
  );
}

function openMiniplayer() {
  closeToast();
  if (miniplayer) {//close first
    miniplayerReopen = true;
    chrome.windows.remove(miniplayer.id);
    //miniplayerClosed callback will open it again
    return;
  }
  
  createPlayer("miniplayer", function(win) {
    miniplayer = win;
    chrome.windows.onRemoved.addListener(miniplayerClosed);
  }, true);
}

var iconClickCount = 0;
var iconClickActionTimer;
function iconClickActionDelayed() {
  clearTimeout(iconClickActionTimer);
  var action = settings["iconClickAction" + iconClickCount];
  if (settings.iconDoubleClickTime) {
    iconClickCount++;
    var nextAction = settings["iconClickAction" + iconClickCount];
    if (!nextAction) chrome.browserAction.setPopup({popup: "player.html"});
    iconClickActionTimer = setTimeout(function() {
      chrome.browserAction.setPopup({popup: ""});
      iconClickCount = 0;
      executeCommand(action);
    }, settings.iconDoubleClickTime);
  } else executeCommand(action);
}

function popupOpened() {
  clearTimeout(iconClickActionTimer);
  iconClickCount = 0;
  iconClickSettingsChanged();
}

/** handler for all settings changes that need to update the browser action */
function iconClickSettingsChanged() {
  chrome.browserAction.onClicked.removeListener(openGoogleMusicTab);
  chrome.browserAction.onClicked.removeListener(iconClickActionDelayed);
  chrome.browserAction.setPopup({popup: ""});
  if (viewUpdateNotifier) {
    chrome.browserAction.setPopup({popup: "updateNotifier.html"});
  } else if (settings.iconClickConnect && !googlemusictabId) {
    chrome.browserAction.onClicked.addListener(openGoogleMusicTab);
  } else if (settings.iconClickAction0) {
    chrome.browserAction.onClicked.addListener(iconClickActionDelayed);
  } else {
    chrome.browserAction.setPopup({popup: "player.html"});
  }
}

/** @return true, if the given version is newer than the saved previous version (used by options page and update listener) */
function isNewerVersion(version) {
  if (previousVersion == null) return false;
  var prev = previousVersion.split(".");
  version = version.split(".");
  for (var i = 0; i < prev.length; i++) {
    if (version.length <= i) return false;//version is shorter (e.g. 1.0 < 1.0.1)
    var p = parseInt(prev[i]);
    var v = parseInt(version[i]);
    if (p != v) return v > p;
  }
  return version.length > prev.length;//version is longer (e.g. 1.0.1 > 1.0), else same version
}

function migrateSettings(previousVersion) {
  if (localStorage["iconClickMiniplayer"] !== undefined) {
    if (localStorage["iconClickMiniplayer"] == "btrue") settings.iconClickAction0 = "openMiniplayer";
    else if (localStorage["iconClickPlayPause"] == "btrue") settings.iconClickAction0 = "playPause";
    localStorage.removeItem("iconClickMiniplayer");
    localStorage.removeItem("iconClickPlayPause");
  }
  if (previousVersion < 2.18 && !settings.toastUseMpStyle) {
    settings.toastDuration = 0;
  }
  if (localStorage["skipDislikedSongs"] !== undefined) {
    settings.skipRatedLower = localStorage["skipDislikedSongs"] == "btrue" ? 1 : 0;
    localStorage.removeItem("skipDislikedSongs");
  }
  if (previousVersion < 2.23) {
    //use expert mode for existing users
    settings.optionsMode = "exp";
  }
}

/** handler for onInstalled event (show the orange icon on update / notification on install) */
function updatedListener(details) {
  if (details.reason == "update") {
    if (settings.updateNotifier) {
      previousVersion = details.previousVersion;
      if (isNewerVersion(currentVersion)) {
        localStorage["previousVersion"] = previousVersion;
        viewUpdateNotifier = true;
        localStorage["viewUpdateNotifier"] = viewUpdateNotifier;
        iconClickSettingsChanged();
        updateBrowserActionInfo();
      } else {
        previousVersion = null;
      }
    }
    migrateSettings(parseFloat(details.previousVersion));
  } else if (details.reason == "install") {
    notifications.create(notifications.WELCOME, {
      type: "basic",
      title: chrome.i18n.getMessage("welcomeTitle"),
      message: chrome.i18n.getMessage("welcomeMessage"),
      buttons: [{title: chrome.i18n.getMessage("toOptions")}, {title: chrome.i18n.getMessage("toWiki")}],
      iconUrl: chrome.extension.getURL("img/icon-48x48.png"),
      priority: 2
    }, function(nid) {
      function notifOrBtnClicked(buttonIndex) {
        notifications.clear(nid);
        if (buttonIndex == 1) {
          gaEvent("Options", "welcome-toWiki");
          chrome.tabs.create({url: "https://github.com/svenackermann/Prime-Player-Google-Play-Music/wiki"});
        } else {//button 0 or notification clicked
          gaEvent("Options", "welcome-toOptions");
          openOptions();
        }
      }
      notifications.addListener("click", nid, notifOrBtnClicked);
      notifications.addListener("btnClick", nid, notifOrBtnClicked);
      notifications.addListener("close", nid, function(byUser) { if (byUser) gaEvent("Options", "welcome-close"); });
    });
  }
}

/** called by options page when it is first opened after an update */
function updateInfosViewed() {
  previousVersion = null;
  localStorage.removeItem("previousVersion");
  updateNotifierDone();
}

/** called by update notifier page when it is first opened after an update */
function updateNotifierDone() {
  viewUpdateNotifier = false;
  localStorage.removeItem("viewUpdateNotifier");
  iconClickSettingsChanged();
  updateBrowserActionInfo();
}

/** Google Analytics stuff */
function gaEvent(category, eventName) {
  if (settings.gaEnabled) ga('send', 'event', category, eventName, currentVersion);
}
function gaSocial(network, action) {
  if (settings.gaEnabled) ga('send', 'social', network, action);
}
function gaEnabledChanged(val) {
  if (val) {
    settings.removeListener("gaEnabled", gaEnabledChanged);//init only once
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
    ga('create', 'UA-41499181-1', 'auto');
    ga('set', 'checkProtocolTask', function(){});
    ga('set', 'dimension1', currentVersion);
    ga('set', 'dimension2', localSettings.lyrics.toString());
    ga('set', 'dimension3', isScrobblingEnabled().toString());
    ga('set', 'dimension4', settings.toast.toString());
    ga('set', 'dimension5', settings.layout);
    ga('send', 'pageview', {
      'metric1': settings.scrobblePercent,
      'metric2': settings.toastDuration
    });
  }
}

var timerEnd = 0;
var sleepTimer;
var preNotifyTimer;
function startSleepTimer(backupTimerEnd) {
  clearTimeout(sleepTimer);
  var nowSec = new Date().getTime() / 1000;
  timerEnd = backupTimerEnd || nowSec + (localSettings.timerMinutes * 60);
  var countdownSec = Math.max(0, timerEnd - nowSec);
  sleepTimer = setTimeout(function() {
    notifications.clear(notifications.TIMERWARN);
    sleepTimer = null;
    timerEnd = 0;
    var msg, btnTitle, undoAction;
    switch (localSettings.timerAction) {
      case "pause":
        if (player.playing) {
          msg = chrome.i18n.getMessage("timerNotificationMsgPause");
          btnTitle = chrome.i18n.getMessage("timerNotificationBtnPause");
          undoAction = executePlayPause;
          executePlayPause();
        }
        break;
      case "closeGm":
        if (googlemusictabId) {
          msg = chrome.i18n.getMessage("timerNotificationMsgCloseGm");
          btnTitle = chrome.i18n.getMessage("timerNotificationBtnCloseGm");
          undoAction = openGoogleMusicTab;
        }
        closeGm();
        break;
    }
    if (localSettings.timerNotify && msg) {
      notifications.create(notifications.TIMEREND, {
        type: "basic",
        title: chrome.i18n.getMessage("timerNotificationTitle"),
        message: msg,
        buttons: [{title: btnTitle}],
        iconUrl: chrome.extension.getURL("img/icon-48x48.png"),
        priority: 2,
        isClickable: false
      }, function(nid) {
        function clearNotification() { notifications.clear(nid); }
        function btnClicked() {
          clearNotification();
          undoAction();
        }
        notifications.addListener("btnClick", nid, btnClicked);
        setTimeout(clearNotification, 10000);
      });
    }
  }, countdownSec * 1000);
  if (localSettings.timerPreNotify > 0 && countdownSec > 0) {
    preNotifyTimer = setTimeout(function() {
      preNotifyTimer = null;
      function getWarningMessage() {
        return chrome.i18n.getMessage(localSettings.timerAction == "pause" ? "timerWarningMsgPause" : "timerWarningMsgCloseGm", "" + Math.max(0, Math.floor(timerEnd - new Date().getTime() / 1000)));
      }
      var preNotifyOptions = {
        type: "basic",
        title: chrome.i18n.getMessage("timerWarningTitle"),
        message: getWarningMessage(),
        buttons: [{title: chrome.i18n.getMessage("cancelTimer")}],
        iconUrl: chrome.extension.getURL("img/icon-48x48.png"),
        priority: 1,
        isClickable: false
      };
      notifications.create(notifications.TIMERWARN, preNotifyOptions, function(nid) {
        var preNotifyInterval;
        function btnClicked() {
          clearSleepTimer();
          notifications.clear(nid);
        }
        function preNotifyClosed() {
          clearInterval(preNotifyInterval);
        }
        notifications.addListener("btnClick", nid, btnClicked);
        notifications.addListener("close", nid, preNotifyClosed);
        preNotifyInterval = setInterval(function() {
          preNotifyOptions.message = getWarningMessage();
          notifications.update(nid, preNotifyOptions);
        }, 1000);
      });
    }, Math.max(0, (countdownSec - localSettings.timerPreNotify) * 1000));
  }
}
function clearSleepTimer() {
  clearTimeout(sleepTimer);
  sleepTimer = null;
  clearTimeout(preNotifyTimer);
  preNotifyTimer = null;
  notifications.clear(notifications.TIMERWARN);
  timerEnd = 0;
}

function extractUrlParam(name, queryString) {
  var matched = RegExp(name + "=(.+?)(&|$)").exec(queryString);
  if (matched == null || matched.length < 2) return null;
  return matched[1];
}

function openOptions() {
  if (optionsTabId) {
    chrome.tabs.update(optionsTabId, {active: true});
  } else {
    chrome.tabs.create({url: chrome.extension.getURL("options.html")});
  }
}

function openGoogleMusicTab(link) {
  if (googlemusictabId) {
    chrome.tabs.update(googlemusictabId, {active: true});
  } else {
    var url = "http://play.google.com/music/listen";
    if (localSettings.googleAccountNo) url += "?u=" + localSettings.googleAccountNo;
    if (typeof(link) == "string") url += "#/" + link;
    chrome.tabs.create({url: url, pinned: settings.openGoogleMusicPinned});
  }
}

function connectGoogleMusicTabs() {
  chrome.tabs.query({url:"*://play.google.com/music/listen*"}, function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var tabId = tabs[i].id;
      chrome.tabs.insertCSS(tabId, {file: "css/gpm.css"});
      chrome.tabs.executeScript(tabId, {file: "js/jquery-2.0.2.min.js"});
      chrome.tabs.executeScript(tabId, {file: "js/cs.js"});
    }
  });
}

function openMpOnPlaying(playing) {
  if (playing && miniplayer == null) openMiniplayer();
}

function closeMpOnDisconnect(connected) {
  if (!connected && miniplayer) chrome.windows.remove(miniplayer.id);
}

function openLyrics(aSong) {
  if (!aSong) {
    if (!song.info) return;
    aSong = {artist: song.info.artist, title: song.info.title};
  }
  var url = buildLyricsSearchUrl(aSong);
  if (url) {
    chrome.tabs.create({url: url}, function(tab) {
      chrome.tabs.executeScript(tab.id, {file: "js/cs-songlyrics.js", runAt: "document_end"});
    });
    gaEvent("Lyrics", "Open");
  } else {
    gaEvent("Lyrics", "Error-noURL");
  }
}

settings.watch("gaEnabled", gaEnabledChanged);
settings.watch("iconClickAction0", iconClickSettingsChanged);
settings.addListener("iconClickConnect", iconClickSettingsChanged);
settings.watch("miniplayerType", function(val) {
  if (val == "notification") {//migrate (notification type is no longer supported)
    settings.miniplayerType = "popup";
  } else if (miniplayer) openMiniplayer();//reopen
});
settings.addListener("layout", function() {
  if (miniplayer) {
    var sizing = localSettings.miniplayerSizing[settings.layout];
    chrome.windows.update(miniplayer.id, {
        height: sizing.height,
        width: sizing.width
      }
    );
  }
});
settings.addListener("hideRatings", function(val) {
  if (!val && song.loved == null) getCurrentLastfmInfo();
});
settings.addListener("showLastfmInfo", function(val) {
  if (val && song.lastfmInfo == null) getCurrentLastfmInfo();
});
settings.addListener("toastUseMpStyle", closeToast);
settings.addListener("toastButton1", closeToast);
settings.addListener("toastButton2", closeToast);
settings.addListener("toastProgress", closeToast);
settings.addListener("scrobble", calcScrobbleTime);
settings.addListener("scrobbleMaxDuration", calcScrobbleTime);
settings.addListener("scrobblePercent", calcScrobbleTime);
settings.addListener("scrobbleTime", calcScrobbleTime);
settings.addListener("disableScrobbleOnFf", calcScrobbleTime);
settings.watch("iconStyle", updateBrowserActionInfo);
settings.addListener("iconClickAction0", updateBrowserActionInfo);
settings.addListener("connectedIndicator", function(val) {
  postToGooglemusic({type: "connectedIndicator", show: val});
});
settings.watch("mpAutoOpen", function(val) {
  if (val) player.watch("playing", openMpOnPlaying)
  else player.removeListener("playing", openMpOnPlaying);
});
settings.watch("mpAutoClose", function(val) {
  if (val) player.addListener("connected", closeMpOnDisconnect)
  else player.removeListener("connected", closeMpOnDisconnect);
});
settings.addListener("lyricsInGpm", postLyricsState);
settings.addListener("lyricsAutoReload", postLyricsState);
settings.watch("showPlayingIndicator", function(val) {
  if (val) player.addListener("playing", updateBrowserActionInfo)
  else player.removeListener("playing", updateBrowserActionInfo);
  updateBrowserActionInfo();
});
settings.watch("showScrobbledIndicator", function(val) {
  if (val) song.addListener("scrobbled", updateBrowserActionInfo)
  else song.removeListener("scrobbled", updateBrowserActionInfo);
  updateBrowserActionInfo();
});
settings.watch("showLovedIndicator", function(val) {
  if (val) song.addListener("loved", updateBrowserActionInfo)
  else song.removeListener("loved", updateBrowserActionInfo);
  updateBrowserActionInfo();
});
settings.watch("showRatingIndicator", function(val) {
  if (val) song.addListener("rating", updateBrowserActionInfo)
  else song.removeListener("rating", updateBrowserActionInfo);
  updateBrowserActionInfo();
});
settings.addListener("showProgress", updateBrowserActionInfo);
settings.addListener("showProgressColor", updateBrowserActionInfo);
function saveRatingMode(ratingMode) {
  if (ratingMode) chrome.storage.local.set({"ratingMode": ratingMode});
}
function saveRating(rating) {
  if (googlemusicport && song.info) chrome.storage.local.set({"rating": rating});
}
function saveScrobbled(scrobbled) {
  if (googlemusicport) chrome.storage.local.set({"scrobbled": scrobbled, "scrobbleTime": song.scrobbleTime});
}
function saveFf(ff) {
  if (googlemusicport) chrome.storage.local.set({"ff": ff});
}
settings.watch("saveLastPosition", function(val) {
  if (val) {
    song.addListener("rating", saveRating);
    song.addListener("scrobbled", saveScrobbled);
    song.addListener("ff", saveFf);
    player.addListener("ratingMode", saveRatingMode);
  } else {
    song.removeListener("rating", saveRating);
    song.removeListener("scrobbled", saveScrobbled);
    song.removeListener("ff", saveFf);
    player.removeListener("ratingMode", saveRatingMode);
  }
});

localSettings.watch("syncSettings", function(val) {
  settings.setSyncStorage(val, function() {
    if (optionsTabId) chrome.tabs.reload(optionsTabId);
  });
});
localSettings.addListener("lastfmSessionName", calcScrobbleTime);
localSettings.addListener("lyrics", postLyricsState);
localSettings.addListener("lyricsFontSize", postLyricsState);
localSettings.addListener("lyricsWidth", postLyricsState);
localSettings.watch("notificationsEnabled", function(val) {
  if (val) notifications.init()
  else gaEvent("Options", "notifications-disabled");
});

player.addListener("connected", function(val) {
  updateBrowserActionInfo();
  if (val) {
    loadNavlistIfConnected();
    executeFeelingLuckyIfConnected();
    resumeLastSongIfConnected();
    if (settings.connectedIndicator) postToGooglemusic({type: "connectedIndicator", show: true});
    if (localSettings.lyrics && settings.lyricsInGpm) postLyricsState();
  } else {
    clearSleepTimer();
  }
});

function reloadForUpdate() {
  var backup = {};
  backup.miniplayerOpen = miniplayer != null;
  backup.nowPlayingSent = song.nowPlayingSent;
  backup.scrobbled = song.scrobbled;
  backup.toasted = song.toasted;
  backup.songFf = song.ff;
  backup.songPosition = song.position;
  backup.songInfo = song.info;
  backup.songTimestamp = song.timestamp;
  backup.loved = song.loved;
  backup.volumeBeforeMute = volumeBeforeMute;
  backup.timerEnd = timerEnd;
  localStorage.updateBackup = JSON.stringify(backup);
  //sometimes the onDisconnect listener in the content script is not triggered on reload(), so explicitely disconnect here
  if (googlemusicport) {
    googlemusicport.onDisconnect.removeListener(onDisconnectListener);
    googlemusicport.disconnect();
  }
  for (var i = 0; i < parkedPorts.length; i++) {
    parkedPorts[i].onDisconnect.removeListener(removeParkedPort);
    parkedPorts[i].disconnect();
  }
  setTimeout(function() { chrome.runtime.reload(); }, 1000);//wait a second til port cleanup is finished
}

if (localStorage.updateBackup != null) {
  var backup = JSON.parse(localStorage.updateBackup);
  localStorage.removeItem("updateBackup");
  song.timestamp = backup.songTimestamp;
  song.toasted = backup.toasted;
  song.info = backup.songInfo;
  song.positionSec = parseSeconds(backup.songPosition);
  song.position = backup.songPosition;
  song.nowPlayingSent = backup.nowPlayingSent;
  song.ff = backup.songFf;
  calcScrobbleTime();
  song.scrobbled = backup.scrobbled;
  song.loved = backup.loved;
  positionFromBackup = true;
  volumeBeforeMute = backup.volumeBeforeMute;
  timerEnd = backup.timerEnd;
  if (timerEnd) {
    startSleepTimer(timerEnd);
  }
  if (backup.miniplayerOpen) openMiniplayer();
}

song.addListener("position", function(val) {
  var oldPos = lastSongPositionSec || song.positionSec;
  song.positionSec = parseSeconds(val);
  if (song.info) {
    if (lastSongPositionSec && (song.positionSec >= lastSongPositionSec || song.positionSec > 5)) lastSongPositionSec = null;
    if (!positionFromBackup && !song.ff && song.positionSec > oldPos + 5) {
      song.ff = true;
      if (settings.disableScrobbleOnFf && !song.scrobbled) song.scrobbleTime = -1;
    } else if (song.ff && song.positionSec <= 5) {//prev pressed or gone back
      song.ff = false;
      if (settings.disableScrobbleOnFf) calcScrobbleTime();
    }
    positionFromBackup = false;
    if (song.positionSec == 2) {//new song, repeat single or rewinded
      if (settings.skipRatedLower > 0 && song.rating > 0 && (song.rating <= settings.skipRatedLower || (song.rating == 2 && player.ratingMode == "thumbs"))) {
        executeInGoogleMusic("nextSong");
        return;
      }
      song.nowPlayingSent = false;
      song.timestamp = Math.round(new Date().getTime() / 1000) - 2;
      if (settings.scrobbleRepeated) {
        song.scrobbled = false;
        calcScrobbleTime();
      }
    } else if (song.positionSec >= 3) {
      if (isScrobblingEnabled()) {
        if (!song.nowPlayingSent) {
          song.nowPlayingSent = true;
          sendNowPlaying();
        }
        if (!song.scrobbled && song.scrobbleTime >= 0 && song.positionSec >= song.scrobbleTime) {
          song.scrobbled = true;
          scrobble();
        }
      }
      if (settings.toastProgress && toastOptions) {
        var progress = Math.floor(song.positionSec * 100 / song.info.durationSec);
        if (progress > toastOptions.progress) {//avoid update on noop
          toastOptions.progress = progress;
          notifications.update(notifications.TOAST, toastOptions);
        }
      }
    }
    if (settings.saveLastPosition && googlemusicport) {
      chrome.storage.local.set({"lastPosition": val});
    }
    if (Math.abs(song.positionSec - lastProgressPosition) > 3 && drawProgress()) updateBrowserIcon();
  }
});
song.addListener("info", function(val) {
  if (lastSongToResume && songsEqual(lastSongToResume.info, val)) {
    song.scrobbled = lastSongToResume.scrobbled;
    song.ff = lastSongToResume.ff;
    lastSongPositionSec = lastSongToResume.positionSec;
    if (song.scrobbled) song.scrobbleTime = lastSongToResume.scrobbleTime;
  } else {
    song.scrobbled = false;
  }
  lastSongToResume = null;
  song.toasted = false;
  song.nowPlayingSent = false;
  positionFromBackup = false;
  song.loved = null;
  song.lastfmInfo = null;
  if (val) {
    song.info.durationSec = parseSeconds(val.duration);
    toastPopup();
    if (!settings.hideRatings || settings.showLastfmInfo) getCurrentLastfmInfo();
  } else {
    song.timestamp = null;
    closeToast();
  }
  if (settings.saveLastPosition && googlemusicport) {
    chrome.storage.local.set({"lastSong": val, "rating": song.rating});
  }
  updateBrowserActionInfo();
  calcScrobbleTime();
});

function getLastSong(callback) {
  chrome.storage.local.get(null, function(items) {
    if (items.lastSong) {
      var lastSong = {
        info: items.lastSong,
        position: items.lastPosition,
        positionSec: parseSeconds(items.lastPosition),
        rating: items.rating,
        ratingMode: items.ratingMode,
        scrobbled: items.scrobbled,
        scrobbleTime: items.scrobbleTime,
        ff: items.ff
      };
      callback(lastSong);
    }
  });
}

function setVolume(percent) {
  executeInGoogleMusic("setVolume", {percent: percent});
}

function setSongPosition(percent) {
  executeInGoogleMusic("setPosition", {percent: percent});
}

function isRatingReset(oldRating, newRating) {
  return oldRating == newRating
    || (player.ratingMode == "thumbs" && ((oldRating == 2 && newRating == 1) || (oldRating == 4 && newRating == 5)));
}

function rate(rating) {
  if (song.rating < 0) return;//negative ratings cannot be changed
  //auto-love if called by click event, no reset and not loved yet
  var reset = isRatingReset(song.rating, rating);
  if (settings.linkRatings && rating == 5 && !reset && song.loved !== true) loveTrack();
  executeInGoogleMusic("rate", {rating: rating});
}

function executeCommand(command) {
  switch (command) {
    case "playPause":
    case "nextSong":
    case "prevSong":
    case "toggleRepeat":
    case "toggleShuffle":
      executeInGoogleMusic(command);
      break;
    case "openMiniplayer":
      openMiniplayer();
      break;
    case "feelingLucky":
      executeFeelingLucky();
      break;
    case "showToast":
      if (song.info) closeToast(openToast);
      break;
    case "loveUnloveSong":
      if (song.loved === true) unloveTrack()
      else loveTrack(true);
      break;
    case "volumeUp":
      if (player.volume != null && player.volume != "100") setVolume(Math.min(100, parseInt(player.volume) + 10) / 100);
      break;
    case "volumeDown":
      if (player.volume != null && player.volume != "0") setVolume(Math.max(0, parseInt(player.volume) - 10) / 100);
      break;
    case "volumeMute":
      if (player.volume != null) {
        if (volumeBeforeMute != null && player.volume == "0") {
          setVolume(parseInt(volumeBeforeMute) / 100);
          volumeBeforeMute = null;
        } else if (player.volume != "0") {
          volumeBeforeMute = player.volume;
          setVolume(0);
        }
      }
      break;
    case "ff":
      if (song.info && song.info.durationSec > 0) setSongPosition(Math.min(1, (song.positionSec + 15) / song.info.durationSec));
      break;
    case "openLyrics":
      if (localSettings.lyrics) openLyrics();
      break;
    default:
      if (command.indexOf("rate-") == 0 && song.info) {
        var rating = parseInt(command.substr(5, 1));
        if (!settings.preventCommandRatingReset || !isRatingReset(song.rating, rating)) rate(rating);
      }
  }
}

function updateNotificationsEnabled(level) {
  localSettings.notificationsEnabled = level == "granted";
}

chrome.commands.onCommand.addListener(executeCommand);

chrome.runtime.onInstalled.addListener(updatedListener);
chrome.runtime.onConnect.addListener(onConnectListener);
chrome.runtime.onUpdateAvailable.addListener(reloadForUpdate);
chrome.runtime.onSuspend.addListener(function() {
  chrome.runtime.onUpdateAvailable.removeListener(reloadForUpdate);
});
chrome.notifications.onShowSettings.addListener(openOptions);
chrome.notifications.getPermissionLevel(updateNotificationsEnabled);
chrome.notifications.onPermissionLevelChanged.addListener(updateNotificationsEnabled);

connectGoogleMusicTabs();
if (isScrobblingEnabled()) scrobbleCachedSongs();
