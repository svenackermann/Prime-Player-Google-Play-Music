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
  miniplayerSizing: {
    normal:   { width: 271, height: 116, left: 0, top: 0 },
    compact1: { width: 271, height: 84, left: 0, top: 0 },
    compact2: { width: 205, height: 133, left: 0, top: 0 },
    hbar:     { width: 502, height: 31,  left: 0, top: 0 }
  }
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
  toast: true,
  toastUseMpStyle: false,
  toastDuration: 5,
  miniplayerType: "popup",
  layout: "normal",
  color: "turq",
  iconClickMiniplayer: false,
  iconClickConnect: false,
  openGoogleMusicPinned: false,
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

/** the song currently loaded */
var SONG_DEFAULTS = {
  position: "0:00",
  positionSec: 0,
  info: null,
  rating: 0,
  nowPlayingSent: false,
  scrobbled: false,
  toasted: false,
  scrobbleTime: -1,
  timestamp: 0,
  ff: false
};
var song = new Bean(SONG_DEFAULTS);
/** the current player state */
var PLAYER_DEFAULTS = {
  ratingMode: null,
  shuffle: "",
  repeat: "",
  playlists: [],
  playing: false,
  volume: null,
  listenNowList: [],
  connected: false
};
var player = new Bean(PLAYER_DEFAULTS);

var LASTFM_APIKEY = "1ecc0b24153df7dc6ac0229d6fcb8dda";
var LASTFM_APISECRET = "fb4b74854f7a7b099c30bfe71236dfd5";
var lastfm = new LastFM({apiKey: LASTFM_APIKEY, apiSecret: LASTFM_APISECRET});
lastfm.session.key = localSettings.lastfmSessionKey;
lastfm.session.name = localSettings.lastfmSessionName;

var currentVersion = chrome.runtime.getManifest().version;

function equalsCurrentSong(info, old) {
  if (old == info) return true;//both null
  if (old != null && info != null
      && old.duration == info.duration
      && old.title == info.title
      && old.artist == info.artist
      && old.album == info.album) {
    return true;
  }
  return false;
}
song.setEqualsFn("info", equalsCurrentSong);

/** handler for all events that need to update the browser action icon */
function updateBrowserActionIcon() {
  var path = "img/icon-";
  if (viewUpdateNotifier) {
    path += "updated";
  } else if (googlemusicport == null) {
    path += "notconnected";
  } else if (song.info) {
    path += player.playing ? "play" : "pause";
    if (song.scrobbled) path += "-scrobbled";
  } else {
    path += "connected";
  }
  chrome.browserAction.setIcon({path: path + ".png"});
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
  port.postMessage({type: "connected"});
  googlemusicport = port;
  googlemusictabId = port.sender.tab.id;
  iconClickSettingsChanged();
  port.onMessage.addListener(onMessageListener);
  port.onDisconnect.addListener(onDisconnectListener);
  updateBrowserActionIcon();
  player.connected = true;
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
  
  resetToDefaults(player, PLAYER_DEFAULTS);
  resetToDefaults(song, SONG_DEFAULTS);
  
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
  
  if (googlemusicport == null) updateBrowserActionIcon();//disconnected
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
  }
}

function loadListenNow() {
  if (googlemusicport) {
    googlemusicport.postMessage({type: "getListenNow"});
  }
}

function isScrobblingEnabled() {
  return settings.scrobble && localSettings.lastfmSessionName != null;
}

/** @return song position in seconds when the song will be scrobbled or -1 if disabled */
function calcScrobbleTime() {
  if (song.info
  && song.info.durationSec > 0
  && isScrobblingEnabled()
  && !(song.ff && settings.disableScrobbleOnFf)
  && !(settings.scrobbleMaxDuration > 0 && song.info.durationSec > (settings.scrobbleMaxDuration * 60))) {
    var scrobbleTime = song.info.durationSec * (settings.scrobblePercent / 100);
    if (settings.scrobbleTime > 0 && scrobbleTime > settings.scrobbleTime) {
      scrobbleTime = settings.scrobbleTime;
    }
    song.scrobbleTime = scrobbleTime;
  } else {
    song.scrobbleTime = -1;
  }
}

/** @return time in seconds that a time string represents (e.g. 4:23 - 263) */
function parseSeconds(time) {
  time = time.split(':');
  var sec = 0;
  var factor = 1;
  for (var i = time.length - 1; i >= 0; i--) {
    sec += parseInt(time[i], 10) * factor;
    factor *= 60;
  }
  return sec || 0;
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

function scrobbleCachedSongs() {
  var scrobbleCache = localStorage["scrobbleCache"];
  if (scrobbleCache) {
    scrobbleCache = JSON.parse(scrobbleCache);
    if (scrobbleCache.user != localSettings.lastfmSessionName) {
      localStorage.removeItem("scrobbleCache");
      return;
    }
    params = {};
    for (var i = 0; i < scrobbleCache.songs.length; i++) {
      var curSong = scrobbleCache.songs[i];
      for (var prop in curSong) {
        params[prop + "[" + i + "]"] = curSong[prop];
      }
    }
    lastfm.track.scrobble(params,
      {
        success: function(response) {
          localStorage.removeItem("scrobbleCache");
          gaEvent('LastFM', 'ScrobbleCachedOK');
        },
        error: function(code) {
          console.debug("Error on cached scrobbling: " + code);
          gaEvent('LastFM', 'ScrobbleCachedError-' + code);
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
      success: function(response) {
        gaEvent('LastFM', 'ScrobbleOK');
        scrobbleCachedSongs();//try cached songs again now that the service seems to work again
      },
      error: function(code) {
        console.debug("Error on scrobbling '" + params.track + "': " + code);
        if (code == 16 || code == 9 || code == -1) cacheForLaterScrobbling(cloned);
        gaEvent('LastFM', 'ScrobbleError-' + code);
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
      success: function(response) { gaEvent('LastFM', 'NowPlayingOK'); },
      error: function(code) {
        console.debug("Error on now playing '" + song.info.title + "': " + code);
        gaEvent('LastFM', 'NowPlayingError-' + code);
      }
    }
  );
}

/** resets all values of a bean to the given defaults */
function resetToDefaults(bean, defaults) {
  for (var prop in defaults) {
    bean[prop] = defaults[prop];
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
  gaEvent('LastFM', 'AuthorizeStarted');
}

/** reset last.fm session */
function lastfmLogout(relogin) {
  lastfm.session = {};
  localSettings.lastfmSessionKey = null;
  localSettings.lastfmSessionName = null;
  if (!(relogin === true)) localStorage.removeItem("scrobbleCache");//clear data on explicit logout
}

var lastfmReloginNotificationId;
function lastfmReloginClicked(notificationId) {
  if (notificationId == lastfmReloginNotificationId) {
    chrome.notifications.onClicked.removeListener(lastfmReloginClicked);
    lastfmReloginNotificationId = null;
    lastfmLogin();
    chrome.notifications.clear(notificationId, function(wasCleared) {/* not interesting, but required */});
  }
}

/** logout from last.fm and show a notification to login again */
function relogin() {
  lastfmLogout(true);
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
    chrome.notifications.onButtonClicked.removeListener(toastButtonClicked);
  }
  if (toast && notificationOrWinId == toast.id) {
    toast = null;
    chrome.windows.onRemoved.removeListener(toastClosed);
  }
}

function toastButtonClicked(notificationId, buttonIndex) {
  if (notificationId == toastId) {
    switch (buttonIndex) {
      case 0:
        executeInGoogleMusic("nextSong");
        break;
      case 1:
        executeInGoogleMusic("playPause");
        break;
    }
  }
}

function openToast() {
  if (settings.toastUseMpStyle) {
    createPlayer("toast", function(win) {
      toast = win;
      chrome.windows.onRemoved.addListener(toastClosed);
    });
  } else {
    var options = {
      type: "basic",
      title: song.info.title,
      message: song.info.artist + "\n" + song.info.album,
      iconUrl: chrome.extension.getURL("img/cover.png"),
      buttons: [{title: chrome.i18n.getMessage("nextSong"), iconUrl: chrome.extension.getURL("img/toast-nextSong.png") },
                {title: chrome.i18n.getMessage("playPause"), iconUrl: chrome.extension.getURL("img/toast-playPause.png") }]
    };
    chrome.notifications.create("", options, function(notificationId) {
      toastId = notificationId;
      chrome.notifications.onClosed.addListener(toastClosed);
      chrome.notifications.onButtonClicked.addListener(toastButtonClicked);
      if (song.info.cover) {
        //we need a Cross-origin XMLHttpRequest
        toastCoverXhr = new XMLHttpRequest();
        toastCoverXhr.open("GET", song.info.cover, true);
        toastCoverXhr.responseType = "blob";
        toastCoverXhr.onload = function() {
          toastCoverXhr = null;
          options.iconUrl = webkitURL.createObjectURL(this.response);
          chrome.notifications.update(notificationId, options, function(wasUpdated) {
            webkitURL.revokeObjectURL(options.iconUrl);
            if (wasUpdated) {
              //update calls onClosed listeners, so restore
              toastId = notificationId;
              chrome.notifications.onClosed.addListener(toastClosed);
              chrome.notifications.onButtonClicked.addListener(toastButtonClicked);
            }
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
  if (!song.toasted && settings.toast && !miniplayer) {
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
  var addToHeight = {normal: 113, popup: 38, panel: 37, detached_panel: 37};
  var addToWidth = {normal: 16, popup: 16, panel: -1, detached_panel: -1};
  var sizing = localSettings.miniplayerSizing[settings.layout];
  return {
    height: sizing.height + addToHeight[settings.miniplayerType],
    width: sizing.width + addToWidth[settings.miniplayerType],
    top: sizing.top,
    left: sizing.left
  };
}

function createPlayer(type, callback) {
  var sizing = getMiniplayerSizing();
  chrome.windows.create({
      url: chrome.extension.getURL("player.html") + "?type=" + type,
      height: sizing.height,
      width: sizing.width,
      top: sizing.top,
      left: sizing.left,
      type: settings.miniplayerType
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
  });
  gaEvent('Internal', miniplayerReopen ? 'MiniplayerReopened' : 'MiniplayerOpened');
}

/** handler for all settings changes that need to update the browser action */
function iconClickSettingsChanged() {
  chrome.browserAction.onClicked.removeListener(openGoogleMusicTab);
  chrome.browserAction.onClicked.removeListener(openMiniplayer);
  chrome.browserAction.setPopup({popup: ""});
  if (viewUpdateNotifier) {
    chrome.browserAction.setPopup({popup: "updateNotifier.html"});
  } else if (settings.iconClickConnect && !googlemusicport) {
    chrome.browserAction.onClicked.addListener(openGoogleMusicTab);
  } else if (settings.iconClickMiniplayer) {
    chrome.browserAction.onClicked.addListener(openMiniplayer);
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
      updateBrowserActionIcon();
    } else {
      previousVersion = null;
    }
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
  updateBrowserActionIcon();
}

/** send a command to the connected Google Music port */
function executeInGoogleMusic(command, options) {
  if (googlemusicport) {
    if (options == null) options = {};
    googlemusicport.postMessage({type: "execute", command: command, options: options});
  }
}

/** send a command to the connected Google Music port */
function selectInGoogleMusic(link) {
  if (googlemusicport) {
    googlemusicport.postMessage({type: "selectLink", link: link});
  }
}

/** Google Analytics stuff */
function gaEvent(category, eventName, value) {
  if (settings.gaEnabled) {
    if (value == undefined) {
      _gaq.push(['_trackEvent', category, eventName, currentVersion]);
    } else {
      _gaq.push(['_trackEvent', category, eventName, currentVersion, value]);
    }
  }
}
function recordSetting(prop) {
  var value = settings[prop];
  switch (typeof(value)) {
    case "boolean":
      gaEvent("Settings", prop + (value ? "-On" : "-Off"));
      break;
    case "number":
      gaEvent("Settings", prop, value);
      break;
    default:
      gaEvent("Settings", prop + "-" + value);
  }
}
function gaEnabledChanged(val) {
  if (val) {
    settings.removeListener("gaEnabled", gaEnabledChanged);//init/record only once
    initGA(currentVersion);
    var settingsToRecord = [
      "scrobble",
      "scrobblePercent",
      "scrobbleTime",
      "scrobbleMaxDuration",
      "disableScrobbleOnFf",
      "linkRatings",
      "toast",
      "toastUseMpStyle",
      "toastDuration",
      "miniplayerType",
      "layout",
      "color",
      "iconClickMiniplayer",
      "iconClickConnect",
      "openGoogleMusicPinned",
      "updateNotifier"
    ];
    for (var i = 0; i < settingsToRecord.length; i++) {
      recordSetting(settingsToRecord[i]);
    }
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

function openGoogleMusicTab() {
  if (googlemusictabId) {
    chrome.tabs.update(googlemusictabId, {active: true});
  } else {
    chrome.tabs.create({url: 'http://play.google.com/music/listen', pinned: settings.openGoogleMusicPinned});
  }
}

function connectGoogleMusicTabs() {
  chrome.tabs.query({url:"*://play.google.com/music/listen*"}, function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var tabId = tabs[i].id;
      chrome.tabs.executeScript(tabId, {file: "js/jquery-2.0.2.min.js"});
      chrome.tabs.executeScript(tabId, {file: "js/cs.js"});
    }
  });
}

settings.watch("updateNotifier", function(val) {
  if (val) chrome.runtime.onInstalled.addListener(updatedListener)
  else chrome.runtime.onInstalled.removeListener(updatedListener);
});
settings.watch("gaEnabled", gaEnabledChanged);
settings.watch("iconClickMiniplayer", iconClickSettingsChanged);
settings.addListener("iconClickConnect", iconClickSettingsChanged);
settings.watch("miniplayerType", function(val) {
  if (val == "notification") {//migrate (notification type is no longer supported)
    settings.miniplayerType = "popup";
  } else if (miniplayer) openMiniplayer();//reopen
});
settings.addListener("layout", function(val) {
  if (miniplayer) {
    var sizing = getMiniplayerSizing();
    chrome.windows.update(miniplayer.id, {
        height: sizing.height,
        width: sizing.width
      }
    );
  }
});
settings.addListener("toastUseMpStyle", closeToast);
settings.addListener("scrobble", calcScrobbleTime);
settings.addListener("scrobbleMaxDuration", calcScrobbleTime);
settings.addListener("scrobblePercent", calcScrobbleTime);
settings.addListener("scrobbleTime", calcScrobbleTime);
settings.addListener("disableScrobbleOnFf", calcScrobbleTime);

localSettings.watch("syncSettings", function(val) {
  settings.setSyncStorage(val, function() {
    if (optionsTabId) chrome.tabs.reload(optionsTabId);
  });
});
localSettings.addListener("lastfmSessionName", calcScrobbleTime);

player.addListener("playing", updateBrowserActionIcon);
song.addListener("scrobbled", updateBrowserActionIcon);
song.addListener("position", function(val) {
  var oldPos = song.positionSec;
  song.positionSec = parseSeconds(val);
  if (!song.ff && song.positionSec > oldPos + 5) {
    song.ff = true;
    song.scrobbleTime = -1;
  } else if (song.ff && song.positionSec <= 5) {//prev pressed or gone back
    song.ff = false;
    calcScrobbleTime();
  }
  if (player.playing && song.info && isScrobblingEnabled()) {
    if (!song.nowPlayingSent && song.positionSec >= 3) {
      song.nowPlayingSent = true;
      sendNowPlaying();
    } else if (!song.scrobbled && song.scrobbleTime >= 0 && song.positionSec >= song.scrobbleTime) {
      song.scrobbled = true;
      scrobble();
    }
  }
});
song.addListener("info", function(val) {
  song.nowPlayingSent = false;
  song.scrobbled = false;
  song.toasted = false;
  song.ff = false;
  if (val) {
    song.info.durationSec = parseSeconds(val.duration);
    song.timestamp = Math.round(new Date().getTime() / 1000);
    if (player.playing) toastPopup();
  } else {
    song.timestamp = 0;
    closeToast();
  }
  calcScrobbleTime();
  updateBrowserActionIcon();
});

function reloadForUpdate() {
  var backup = {};
  backup.miniplayerOpen = miniplayer != null;
  backup.nowPlayingSent = song.nowPlayingSent;
  backup.scrobbled = song.scrobbled;
  backup.toasted = song.toasted;
  backup.songTimestamp = song.timestamp;
  backup.songFf = song.ff;
  backup.songPosition = song.position;
  backup.songInfo = song.info;
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
  song.position = updateBackup.songPosition;
  song.ff = updateBackup.songFf;
  song.info = updateBackup.songInfo;
  song.nowPlayingSent = updateBackup.nowPlayingSent;
  song.scrobbled = updateBackup.scrobbled;
  song.toasted = updateBackup.toasted;
  song.timestamp = updateBackup.songTimestamp;
  if (updateBackup.miniplayerOpen) openMiniplayer();
  updateBackup = null;
}

chrome.commands.onCommand.addListener(function(command) {
  switch (command) {
    case "playPause":
    case "prevSong":
    case "nextSong":
      executeInGoogleMusic(command);
      break;
    case "openMiniplayer":
      openMiniplayer();
      break;
  }
});

chrome.runtime.onConnect.addListener(onConnectListener);
chrome.runtime.onUpdateAvailable.addListener(reloadForUpdate);
chrome.runtime.onSuspend.addListener(function() {
  chrome.runtime.onUpdateAvailable.removeListener(reloadForUpdate);
});

connectGoogleMusicTabs();
if (isScrobblingEnabled()) scrobbleCachedSongs();
