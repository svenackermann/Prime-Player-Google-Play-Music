/**
 * The main code for the background page.
 * Manages connections, settings, the miniplayer and much more.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
var SETTINGS_DEFAULTS = {
  lastfmSessionKey: null,
  lastfmSessionName: null,
  scrobble: true,
  scrobblePercent: 50,
  scrobbleTime: 240,
  scrobbleMaxDuration: 30,
  toast: true,
  toastDuration: 5,
  hideToastPlaycontrols: true,
  miniplayerType: "popup",
  layout: "normal",
  color: "turq",
  iconClickMiniplayer: false,
  iconClickConnect: false,
  openGoogleMusicPinned: false,
  updateNotifier: true,
  gaEnabled: true,
  miniplayerSizing: {
    normal:   { width: 271, height: 116, left: 0, top: 0 },
    compact1: { width: 271, height: 84, left: 0, top: 0 },
    compact2: { width: 180, height: 133, left: 0, top: 0 },
    hbar:     { width: 476, height: 31,  left: 0, top: 0 }
  }
};
var settings = new Bean(SETTINGS_DEFAULTS, true);

var miniplayer;
var toast;
var googlemusicport;
var googlemusictabId;
var optionsTabId;
var justOpenedClass;
var parkedPorts = [];
var viewUpdateNotifier = false;
var previousVersion;

var SONG_DEFAULTS = {
  position: "0:00",
  positionSec: 0,
  info: null,
  rating: 0,
  nowPlayingSent: false,
  scrobbled: false,
  toasted: false,
  scrobbleTime: -1,
  timestamp: 0
};
var PLAYER_DEFAULTS = {
  ratingMode: null,
  shuffle: "",
  repeat: "",
  playlists: [],
  playing: false
};
var player = new Bean(PLAYER_DEFAULTS);
var song = new Bean(SONG_DEFAULTS);

var LASTFM_APIKEY = "1ecc0b24153df7dc6ac0229d6fcb8dda";
var LASTFM_APISECRET = "fb4b74854f7a7b099c30bfe71236dfd5";
var lastfm = new LastFM({apiKey: LASTFM_APIKEY, apiSecret: LASTFM_APISECRET});
lastfm.session.key = settings.lastfmSessionKey;
lastfm.session.name = settings.lastfmSessionName;

var currentVersion = chrome.runtime.getManifest().version;

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
  for (var i in parkedPorts) {
    if (port == parkedPorts[i]) {
      parkedPorts.splice(i, 1);
      return;
    }
  }
}

function connectPort(port) {
  port.postMessage({type: "connected"});
  googlemusicport = port;
  googlemusictabId = port.sender.tab.id;
  iconClickSettingsChanged();
  port.onMessage.addListener(onMessageListener);
  port.onDisconnect.addListener(onDisconnectListener);
  updateBrowserActionIcon();
}

function onConnectListener(port) {
  console.assert(port.name == "googlemusic");
  if (googlemusicport) {
    parkedPorts.push(port);
    port.onDisconnect.addListener(removeParkedPort);
  } else {
    connectPort(port);
  }
}

function onDisconnectListener() {
  googlemusicport = null;
  googlemusictabId = null;
  iconClickSettingsChanged();
  
  resetToDefaults(player, PLAYER_DEFAULTS);
  resetToDefaults(song, SONG_DEFAULTS);
  
  updateBrowserActionIcon();
  
  //try to connect another tab
  while (parkedPorts.length > 0) {
    var parkedPort = parkedPorts.shift();
    try {
      parkedPort.onDisconnect.removeListener(removeParkedPort);
      connectPort(parkedPort);
    } catch (e) {
      //seems to be disconnected, try next
    }
  }
}

function isScrobblingEnabled() {
  return settings.scrobble && settings.lastfmSessionName != null;
}

function calcScrobbleTime() {
  if (song.info
  && song.info.durationSec > 0
  && isScrobblingEnabled()
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

function onMessageListener(message) {
  var val = message.value;
  var type = message.type;
  
  if (type.indexOf("player-") == 0) {
    player[type.substring(7)] = val;
  } else if (type.indexOf("song-") == 0) {
    if (type == "song-position" && val == "") val = SONG_DEFAULTS.position;
    song[type.substring(5)] = val;
  }
}

function scrobble() {
  lastfm.track.scrobble({
      track: song.info.title,
      timestamp: song.timestamp,
      artist: song.info.artist,
      album: song.info.album,
      duration: song.info.durationSec
    },
    {
      success: function(response) { gaEvent('LastFM', 'ScrobbleOK'); },
      error: function(code) { gaEvent('LastFM', 'ScrobbleError-' + code); }
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
      error: function(code) { gaEvent('LastFM', 'NowPlayingError-' + code); }
    }
  );
}

function resetToDefaults(bean, defaults) {
  for (var prop in defaults) {
    bean[prop] = defaults[prop];
  }
}

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

function lastfmLogout() {
  lastfm.session = {};
  settings.lastfmSessionKey = null;
  settings.lastfmSessionName = null;
}

function relogin() {
  lastfmLogout();
  var notification = webkitNotifications.createNotification(
    "img/icon-48x48.png",
    chrome.i18n.getMessage("lastfmSessionTimeout"),
    chrome.i18n.getMessage("lastfmRelogin")
  );
  notification.onclick = function() {
    lastfmLogin();
    notification.cancel();
  };
  notification.show();
}
lastfm.sessionTimeoutCallback = relogin;

function toastPopup() {
  if (!song.toasted && settings.toast && !miniplayer) {
    song.toasted = true;
    justOpenedClass = "toast";
    if (toast) toast.cancel();
    toast = webkitNotifications.createHTMLNotification('player.html');
    toast.show();
    toast.onclose = function() {
      toast = null;
    };
  }
}

var miniplayerReopen = false;
function miniplayerClosed(winId) {
  if (miniplayer) {
    if (miniplayer.id && miniplayer.id != winId) {
      return;//some other window closed
    }
    miniplayer = null;
    if (miniplayerReopen) openMiniplayer();
    miniplayerReopen = false;
  }
}
chrome.windows.onRemoved.addListener(miniplayerClosed);

function getMiniplayerSizing() {
  var addToHeight = {normal: 113, popup: 38, panel: 37, detached_panel: 37};
  var addToWidth = {normal: 16, popup: 16, panel: -1, detached_panel: -1};
  var sizing = settings.miniplayerSizing[settings.layout];
  var result = {
    height: sizing.height + addToHeight[settings.miniplayerType],
    width: sizing.width + addToWidth[settings.miniplayerType],
    top: sizing.top,
    left: sizing.left
  };
  return result;
}

function openMiniplayer() {
  if (miniplayer) {//close first
    miniplayerReopen = true;
    if (miniplayer instanceof Notification) {
      miniplayer.cancel();
    } else {
      chrome.windows.remove(miniplayer.id);
    }
    //miniplayerClosed callback will open it again
    return;
  }
  
  justOpenedClass = "miniplayer";
  if (settings.miniplayerType == "notification") {
    miniplayer = webkitNotifications.createHTMLNotification('player.html');
    miniplayer.show();
    miniplayer.onclose = miniplayerClosed;
  } else {
    var sizing = getMiniplayerSizing();
    chrome.windows.create({
        url: chrome.extension.getURL("player.html"),
        height: sizing.height,
        width: sizing.width,
        top: sizing.top,
        left: sizing.left,
        type: settings.miniplayerType
      }, function(win) {
        miniplayer = win;
      }
    );
  }
  gaEvent('Internal', miniplayerReopen ? 'MiniplayerReopened' : 'MiniplayerOpened');
}

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

function updatedListener(details) {
  if (details.reason == "update" && settings.updateNotifier) {
    viewUpdateNotifier = true;
    iconClickSettingsChanged();
    updateBrowserActionIcon();
    previousVersion = details.previousVersion;
  }
}

function updateNotifierDone() {
  viewUpdateNotifier = false;
  iconClickSettingsChanged();
  updateBrowserActionIcon();
}

function executeInGoogleMusic(command, options) {
  if (googlemusicport) {
    if (options == null) options = {};
    googlemusicport.postMessage({type: "execute", command: command, options: options});
  }
}

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
      "toast",
      "toastDuration",
      "hideToastPlaycontrols",
      "miniplayerType",
      "layout",
      "color",
      "iconClickMiniplayer",
      "iconClickConnect",
      "openGoogleMusicPinned",
      "updateNotifier"
    ];
    for (var i in settingsToRecord) {
      recordSetting(settingsToRecord[i]);
    }
  }
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
    for (var i in tabs) {
      var tabId = tabs[i].id;
      chrome.tabs.executeScript(tabId, {file: "js/jquery-2.0.2.min.js"});
      chrome.tabs.executeScript(tabId, {file: "js/cs.js"});
    }
  });
}

settings.watch("gaEnabled", gaEnabledChanged);
settings.watch("iconClickMiniplayer", iconClickSettingsChanged);
settings.addListener("iconClickConnect", iconClickSettingsChanged);
settings.addListener("miniplayerType", function() {
  if (miniplayer) openMiniplayer();//reopen
});
settings.addListener("layout", function(val) {
  if (miniplayer && !(miniplayer instanceof Notification)) {
    var sizing = getMiniplayerSizing();
    chrome.windows.update(miniplayer.id, {
        height: sizing.height,
        width: sizing.width
      }
    );
  }
});
settings.addListener("lastfmSessionName", calcScrobbleTime);
settings.addListener("scrobble", calcScrobbleTime);
settings.addListener("scrobbleMaxDuration", calcScrobbleTime);
settings.addListener("scrobblePercent", calcScrobbleTime);
settings.addListener("scrobbleTime", calcScrobbleTime);
player.addListener("playing", function(val) {
  updateBrowserActionIcon();
});
song.addListener("scrobbled", updateBrowserActionIcon);
song.addListener("position", function(val) {
  song.positionSec = parseSeconds(val);
  if (player.playing && song.info && isScrobblingEnabled()) {
    if (!song.nowPlayingSent && song.positionSec >= 3) {
      song.nowPlayingSent = true;
      sendNowPlaying();
    } else if (!song.scrobbled && song.scrobbleTime >= 0 && val >= song.scrobbleTime) {
      song.scrobbled = true;
      scrobble();
    }
  }
});
song.addListener("info", function(val) {
  updateBrowserActionIcon();
  song.toasted = false;
  song.nowPlayingSent = false;
  song.scrobbled = false;
  if (val) {
    song.info.durationSec = parseSeconds(val.duration);
    song.timestamp = Math.round(new Date().getTime() / 1000);
    if (player.playing) toastPopup();
  } else {
    song.timestamp = 0;
  }
  calcScrobbleTime();
});

chrome.extension.onConnect.addListener(onConnectListener);
connectGoogleMusicTabs();
chrome.runtime.onUpdateAvailable.addListener(function(){chrome.runtime.reload();});
chrome.runtime.onInstalled.addListener(updatedListener);
