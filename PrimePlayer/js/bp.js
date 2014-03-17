/**
 * The main code for the background page.
 * Manages connections, settings, the miniplayer and much more.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */

/** settings that must not be synced with Chrome sync */
var LOCAL_SETTINGS_DEFAULTS = {
  lastfmSessionKey: null,
  lastfmSessionName: null,
  syncSettings: false,
  lyrics: false,
  lyricsFontSize: 11,
  lyricsWidth: 250,
  miniplayerSizing: {
    normal:   { width: 270, height: 115, left: 0, top: 0 },
    compact1: { width: 265, height: 80, left: 0, top: 0 },
    compact2: { width: 195, height: 125, left: 0, top: 0 },
    hbar:     { width: 515, height: 30,  left: 0, top: 0 }
  },
  playlistsListSizing: {width: 350, height: 320},
  playlistSizing: {width: 500, height: 295},
  quicklinksSizing: {width: 280, height: 160},
  albumContainersSizing: {width: 220, height: 320},
  searchresultSizing: {width: 350, height: 320},
  lyricsSizing: {width: 400, height: 400}
}
var localSettings = new Bean(LOCAL_SETTINGS_DEFAULTS, true);

/** settings that should be synced with Chrome sync if enabled */
var SETTINGS_DEFAULTS = {
  scrobble: true,
  scrobblePercent: 50,
  scrobbleTime: 240,
  scrobbleMaxDuration: 30,
  disableScrobbleOnFf: false,
  linkRatings: false,
  showLovedIndicator: false,
  showScrobbledIndicator: true,
  toast: true,
  toastUseMpStyle: false,
  toastDuration: 5,
  toastIfMpOpen: false,
  toastClick: "",
  toastButton1: "nextSong",
  toastButton2: "playPause",
  miniplayerType: "popup",
  layout: "normal",
  color: "turq",
  coverClickLink: "now",
  titleClickLink: "ap/queue",
  openLinksInMiniplayer: true,
  hideSearchfield: false,
  hideRatings: false,
  omitUnknownAlbums: false,
  mpAutoOpen: false,
  mpAutoClose: false,
  openLyricsInMiniplayer: true,
  lyricsInGpm: false,
  lyricsAutoReload: false,
  iconStyle: "default",
  showPlayingIndicator: true,
  showRatingIndicator: false,
  iconClickMiniplayer: false,
  iconClickConnect: false,
  iconClickPlayPause: false,
  openGoogleMusicPinned: false,
  connectedIndicator: true,
  preventCommandRatingReset: true,
  updateNotifier: true,
  gaEnabled: true
};
var settings = new Bean(SETTINGS_DEFAULTS, true);

/** the miniplayer instance, if opened */
var miniplayer;
/** the toast notification id or window, if opened */
var toastId;
var toast;
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

/** the song currently loaded */
var SONG_DEFAULTS = {
  position: "0:00",
  positionSec: 0,
  info: null,
  rating: -1,
  loved: null,
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

function draw(backgroundSrc, imagePaths, callback) {
  var ctx = $("<canvas width='19' height='19'/>").get(0).getContext("2d");
  ctx.clearRect(0, 0, 19, 19);
  var image = new Image();
  function loadNext() {
    var path = imagePaths.shift();
    if (path) image.src = chrome.extension.getURL(path + ".png")
    else callback(ctx);
  }
  image.onload = function() {
    ctx.drawImage(image, 0, 0);
    loadNext();
  };
  image.src = chrome.extension.getURL(backgroundSrc);
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
      if (song.loved && settings.showLovedIndicator) {
        iconPaths.push(iconPath + "loved");
        faviconPaths.push(iconPath + "loved");
      }
      if (song.rating && settings.showRatingIndicator) {
        if (player.ratingMode == "star") {
          chrome.browserAction.setBadgeText({text: "" + song.rating});
        } else if (player.ratingMode == "thumbs") {
          if (song.rating == 5) {
            iconPaths.push(iconPath + "thumbsUp");
            faviconPaths.push(iconPath + "thumbsUp");
          } else if (song.rating == 1) {
            iconPaths.push(iconPath + "thumbsDown");
            faviconPaths.push(iconPath + "thumbsDown");
          }
        }
      }
      if (settings.showPlayingIndicator) {
        if (player.playing) {
          iconPaths.push(iconPath + (settings.iconClickPlayPause ? "pause" : "playing"));
          faviconPaths.push(iconPath + "playing");
          title = chrome.i18n.getMessage("browserActionTitle_playing") + ": " + title;
        } else {
          iconPaths.push(iconPath + (settings.iconClickPlayPause ? "play" : "paused"));
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
  
  if (iconPaths.length) draw(path, iconPaths, function(icon) {
    chrome.browserAction.setIcon({imageData: icon.getImageData(0, 0, 19, 19)});
  }); else chrome.browserAction.setIcon({path: path});
  if (faviconPaths.length) draw(path, faviconPaths, function(favicon) {
    player.favicon = favicon.canvas.toDataURL();
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
  
  player.resetToDefaults();
  song.resetToDefaults();
  
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

/** send a command to the connected Google Music port */
function executeInGoogleMusic(command, options) {
  postToGooglemusic({type: "execute", command: command, options: options || {}});
}

function executePlayPause() {
  executeInGoogleMusic("playPause");
}

function isScrobblingEnabled() {
  return settings.scrobble && localSettings.lastfmSessionName != null;
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

function getLovedInfo() {
  if (localSettings.lastfmSessionName && song.info) {
    song.loved = null;
    lastfm.track.getInfo({
        track: song.info.title,
        artist: song.info.artist,
        username: localSettings.lastfmSessionName
      },
      {
        success: function(response) {
          song.loved = response.track != null && response.track.userloved == 1;
        },
        error: function(code, msg) {
          song.loved = msg;
          gaEvent("LastFM", "getInfoError-" + code);
        }
      }
    );
  }
}

function loveTrack(event, aSong) {
  if (aSong == undefined) aSong = song;
  if (localSettings.lastfmSessionKey && aSong.info) {
    aSong.loved = null;
    lastfm.track.love({
        track: aSong.info.title,
        artist: aSong.info.artist
      },
      {
        success: function() { aSong.loved = true; },
        error: function(code, msg) {
          aSong.loved = msg;
          gaEvent("LastFM", "loveError-" + code);
        }
      }
    );
    //auto-rate if called by click event and not rated yet
    if (event != null && settings.linkRatings && aSong.rating == 0) executeInGoogleMusic("rate", {rating: 5});
  }
}

function unloveTrack() {
  if (localSettings.lastfmSessionKey && song.info) {
    song.loved = null;
    lastfm.track.unlove({
        track: song.info.title,
        artist: song.info.artist
      },
      {
        success: function() { song.loved = false; },
        error: function(code, msg) {
          song.loved = msg;
          gaEvent("LastFM", "unloveError-" + code);
        }
      }
    );
  }
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

var lastfmReloginNotificationId;
function lastfmReloginClicked(notificationId) {
  if (notificationId == lastfmReloginNotificationId) {
    chrome.notifications.onClicked.removeListener(lastfmReloginClicked);
    lastfmReloginNotificationId = null;
    lastfmLogin();
    chrome.notifications.clear(notificationId, function() {/* not interesting, but required */});
  }
}

/** logout from last.fm and show a notification to login again */
function relogin() {
  lastfmLogout();
  chrome.notifications.create("", {
    type: "basic",
    title: chrome.i18n.getMessage("lastfmSessionTimeout"),
    message: chrome.i18n.getMessage("lastfmRelogin"),
    iconUrl: chrome.extension.getURL("img/icon-48x48.png")
  }, function(notificationId) {
    lastfmReloginNotificationId = notificationId;
    chrome.notifications.onClicked.addListener(lastfmReloginClicked);
  });
}
lastfm.sessionTimeoutCallback = relogin;

function toastClosed(notificationOrWinId) {
  if (notificationOrWinId == toastId) {
    toastId = null;
    if (toastCoverXhr) {
      toastCoverXhr.abort();
      toastCoverXhr = null;
    }
    chrome.notifications.onClosed.removeListener(toastClosed);
    chrome.notifications.onClicked.removeListener(toastClicked);
    chrome.notifications.onButtonClicked.removeListener(toastButtonClicked);
  }
  if (toast && notificationOrWinId == toast.id) {
    toast = null;
    chrome.windows.onRemoved.removeListener(toastClosed);
  }
}

function toastClicked(notificationId) {
  if (notificationId == toastId && settings.toastClick) executeCommand(settings.toastClick);
}

function toastButtonClicked(notificationId, buttonIndex) {
  if (notificationId == toastId) {
    //check which button was clicked that the button is valid (otherwise it is not displayed and we would execute the wrong command)
    var cmd = settings.toastButton1;
    var btn = getToastBtn(cmd);
    if (!btn || buttonIndex == 1) {
      cmd = settings.toastButton2;
      btn = getToastBtn(cmd);
    }
    if (btn) executeCommand(cmd);
  }
}

function getToastBtn(cmd) {
  if (!cmd) return null;
  var icon = cmd;
  switch (cmd) {
    case "loveUnloveSong":
      if (!localSettings.lastfmSessionName) return null;
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

function openToast() {
  if (settings.toastUseMpStyle) {
    createPlayer("toast", function(win) {
      toast = win;
      chrome.windows.onRemoved.addListener(toastClosed);
    }, false);
  } else {
    var btns = [];
    var btn = getToastBtn(settings.toastButton1);
    if (btn) btns.push(btn);
    btn = getToastBtn(settings.toastButton2);
    if (btn) btns.push(btn);
    var options = {
      type: "basic",
      title: song.info.title,
      message: song.info.artist + "\n" + song.info.album,
      iconUrl: chrome.extension.getURL("img/cover.png"),
      buttons: btns
    };
    chrome.notifications.create("", options, function(notificationId) {
      toastId = notificationId;
      chrome.notifications.onClosed.addListener(toastClosed);
      chrome.notifications.onClicked.addListener(toastClicked);
      chrome.notifications.onButtonClicked.addListener(toastButtonClicked);
      if (song.info.cover) {
        //we need a Cross-origin XMLHttpRequest
        toastCoverXhr = new XMLHttpRequest();
        toastCoverXhr.open("GET", song.info.cover, true);
        toastCoverXhr.responseType = "blob";
        toastCoverXhr.onload = function() {
          toastCoverXhr = null;
          options.iconUrl = window.URL.createObjectURL(this.response);
          chrome.notifications.update(notificationId, options, function() {
            webkitURL.revokeObjectURL(options.iconUrl);
          });
        };
        toastCoverXhr.send();
      }
    });
  }
}

function closeToast(callback) {
  if (typeof(callback) != "function") callback = function() {};
  if (toastId) chrome.notifications.clear(toastId, callback)
  else if (toast) chrome.windows.remove(toast.id, callback)
  else callback();
}

/** open toast notification */
function toastPopup() {
  if (!song.toasted && settings.toast && (settings.toastIfMpOpen || !miniplayer)) {
    song.toasted = true;
    closeToast(openToast);
  }
}

var miniplayerReopen = false;
/** reset state when miniplayer is closed, reopen if neccessary */
function miniplayerClosed(winId) {
  if (miniplayer) {
    if (winId != miniplayer.id) return;//some other window closed
    chrome.windows.onRemoved.removeListener(miniplayerClosed);
    miniplayer = null;
    if (miniplayerReopen) openMiniplayer();
    miniplayerReopen = false;
  }
}

/** @return the saved size and position settings for the miniplayer of current type and layout */
function getMiniplayerSizing() {
  var addToHeight = {normal: 113, popup: 38, panel: 36, detached_panel: 36};
  var addToWidth = {normal: 16, popup: 16, panel: 0, detached_panel: 0};
  var sizing = localSettings.miniplayerSizing[settings.layout];
  return {
    height: sizing.height + addToHeight[settings.miniplayerType],
    width: sizing.width + addToWidth[settings.miniplayerType],
    top: sizing.top,
    left: sizing.left
  };
}

function createPlayer(type, callback, focused) {
  var sizing = getMiniplayerSizing();
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

/** handler for all settings changes that need to update the browser action */
function iconClickSettingsChanged() {
  chrome.browserAction.onClicked.removeListener(openGoogleMusicTab);
  chrome.browserAction.onClicked.removeListener(openMiniplayer);
  chrome.browserAction.onClicked.removeListener(executePlayPause);
  chrome.browserAction.setPopup({popup: ""});
  if (viewUpdateNotifier) {
    chrome.browserAction.setPopup({popup: "updateNotifier.html"});
  } else if (settings.iconClickConnect && !googlemusictabId) {
    chrome.browserAction.onClicked.addListener(openGoogleMusicTab);
  } else if (settings.iconClickMiniplayer) {
    chrome.browserAction.onClicked.addListener(openMiniplayer);
  } else if (settings.iconClickPlayPause && player.playing != null) {
    chrome.browserAction.onClicked.addListener(executePlayPause);
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

/** handler for onInstalled event (show the orange icon on update) */
function updatedListener(details) {
  if (details.reason == "update") {
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
  } else if (details.reason == "install") {
    chrome.tabs.create({url: chrome.extension.getURL("options.html#welcome")});
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

settings.watch("updateNotifier", function(val) {
  if (val) chrome.runtime.onInstalled.addListener(updatedListener)
  else chrome.runtime.onInstalled.removeListener(updatedListener);
});
settings.watch("gaEnabled", gaEnabledChanged);
settings.watch("iconClickMiniplayer", iconClickSettingsChanged);
settings.addListener("iconClickPlayPause", iconClickSettingsChanged);
settings.addListener("iconClickConnect", iconClickSettingsChanged);
settings.watch("miniplayerType", function(val) {
  if (val == "notification") {//migrate (notification type is no longer supported)
    settings.miniplayerType = "popup";
  } else if (miniplayer) openMiniplayer();//reopen
});
settings.addListener("layout", function() {
  if (miniplayer) {
    var sizing = getMiniplayerSizing();
    chrome.windows.update(miniplayer.id, {
        height: sizing.height,
        width: sizing.width
      }
    );
  }
});
settings.addListener("hideRatings", function(val) {
  if (!val && song.info) getLovedInfo();
});
settings.addListener("toastUseMpStyle", closeToast);
settings.addListener("toastButton1", closeToast);
settings.addListener("toastButton2", closeToast);
settings.addListener("scrobble", calcScrobbleTime);
settings.addListener("scrobbleMaxDuration", calcScrobbleTime);
settings.addListener("scrobblePercent", calcScrobbleTime);
settings.addListener("scrobbleTime", calcScrobbleTime);
settings.addListener("disableScrobbleOnFf", calcScrobbleTime);
settings.watch("iconStyle", updateBrowserActionInfo);
settings.addListener("iconClickPlayPause", updateBrowserActionInfo);
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

localSettings.watch("syncSettings", function(val) {
  settings.setSyncStorage(val, function() {
    if (optionsTabId) chrome.tabs.reload(optionsTabId);
  });
});
localSettings.addListener("lastfmSessionName", calcScrobbleTime);
localSettings.addListener("lyrics", postLyricsState);
localSettings.addListener("lyricsFontSize", postLyricsState);
localSettings.addListener("lyricsWidth", postLyricsState);

player.addListener("playing", iconClickSettingsChanged);
player.addListener("connected", function(val) {
  updateBrowserActionInfo();
  if (val) {
    loadNavlistIfConnected();
    executeFeelingLuckyIfConnected();
    if (settings.connectedIndicator) postToGooglemusic({type: "connectedIndicator", show: true});
    if (localSettings.lyrics && settings.lyricsInGpm) postLyricsState();
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
  localStorage["updateBackup"] = JSON.stringify(backup);
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

if (localStorage["updateBackup"] != null) {
  var updateBackup = JSON.parse(localStorage["updateBackup"]);
  localStorage.removeItem("updateBackup");
  song.timestamp = updateBackup.songTimestamp;
  song.toasted = updateBackup.toasted;
  song.info = updateBackup.songInfo;
  song.positionSec = parseSeconds(updateBackup.songPosition);
  song.position = updateBackup.songPosition;
  song.nowPlayingSent = updateBackup.nowPlayingSent;
  song.ff = updateBackup.songFf;
  calcScrobbleTime();
  song.scrobbled = updateBackup.scrobbled;
  song.loved = updateBackup.loved;
  positionFromBackup = true;
  volumeBeforeMute = updateBackup.volumeBeforeMute;
  if (updateBackup.miniplayerOpen) openMiniplayer();
}

song.addListener("position", function(val) {
  var oldPos = song.positionSec;
  song.positionSec = parseSeconds(val);
  if (!positionFromBackup && !song.ff && song.positionSec > oldPos + 5) {
    song.ff = true;
    if (settings.disableScrobbleOnFf && !song.scrobbled) song.scrobbleTime = -1;
  } else if (song.ff && song.positionSec <= 5) {//prev pressed or gone back
    song.ff = false;
    if (settings.disableScrobbleOnFf) calcScrobbleTime();
  }
  positionFromBackup = false;
  if (song.info) {
    if (song.positionSec == 2) {//new song, repeat single or rewinded
      song.nowPlayingSent = false;
      song.scrobbled = false;
      calcScrobbleTime();
      song.timestamp = Math.round(new Date().getTime() / 1000) - 2;
    }
    if (song.positionSec >= 3 && isScrobblingEnabled()) {
      if (!song.nowPlayingSent) {
        song.nowPlayingSent = true;
        sendNowPlaying();
      }
      if (!song.scrobbled && song.scrobbleTime >= 0 && song.positionSec >= song.scrobbleTime) {
        song.scrobbled = true;
        scrobble();
      }
    }
  }
});
song.addListener("info", function(val) {
  song.toasted = false;
  song.nowPlayingSent = false;
  song.scrobbled = false;
  positionFromBackup = false;
  if (val) {
    song.info.durationSec = parseSeconds(val.duration);
    if (player.playing) toastPopup();
    if (!settings.hideRatings) getLovedInfo();
  } else {
    song.timestamp = null;
    closeToast();
    song.loved = null;
  }
  updateBrowserActionInfo();
  calcScrobbleTime();
});

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

chrome.commands.onCommand.addListener(executeCommand);

chrome.runtime.onConnect.addListener(onConnectListener);
chrome.runtime.onUpdateAvailable.addListener(reloadForUpdate);
chrome.runtime.onSuspend.addListener(function() {
  chrome.runtime.onUpdateAvailable.removeListener(reloadForUpdate);
});

connectGoogleMusicTabs();
if (isScrobblingEnabled()) scrobbleCachedSongs();
