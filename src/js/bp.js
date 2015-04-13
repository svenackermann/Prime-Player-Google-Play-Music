/**
 * The main code for the background page.
 * Manages connections, settings, the miniplayer and much more.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome, Bean, LastFM, initLyricsProviders, initGA */
/* exported fixForUri */

//{ global public declarations
 /** ID of the options tab, if opened */
var optionsTabId = null;

/** the previous version, if we just updated (set in onInstalled event listener, used by options page) */
var previousVersion = localStorage.previousVersion;

function fixForUri(string) {
  return encodeURIComponent($.trim(string)).replace(/(%20)+/g, "+");
}
//} global public declarations

// private part
(function(exports) {
  //{ private variables
  //save chrome APIs to allow for minimisation
  var chromeRuntime = chrome.runtime;
  var chromeTabs = chrome.tabs;
  var chromeWindows = chrome.windows;
  var chromeBrowserAction = chrome.browserAction;
  var chromeLocalStorage = chrome.storage.local;
  var i18n = chrome.i18n.getMessage;
  var getExtensionUrl = chrome.extension.getURL;
  var chromeNotifications = chrome.notifications;
  var chromeContextMenus = chrome.contextMenus;
  var chromeIdle = chrome.idle;
  var chromeOmnibox = chrome.omnibox;

  var GA_CAT_LASTFM = "LastFM";
  var GA_CAT_OPTIONS = "Options";

  /** the miniplayer instance, if opened */
  var miniplayer = null;
  /** if the toast notification is opened, its options */
  var toastOptions = null;
  /** the toast window (if toastUseMpStyle) */
  var toastWin;
  /** the XMLHttpRequest for the toast cover */
  var toastCoverXhr;
  /** the currently connected port with its tab */
  var googlemusicport;
  var googlemusictabId;
  /** ports waiting for a connection when another tab was already connected (if multiple tabs with Google Music are opened) */
  var parkedPorts = [];
  /** whether to view the update notifier (set in onInstalled event listener) */
  var viewUpdateNotifier = localStorage.viewUpdateNotifier || null;
  /** the volume before mute for restoring */
  var volumeBeforeMute;
  /** if resumeLastSong was called while not connected */
  var lastSongToResume;
  /** cache if we have a last song saved */
  var lastSongInfo;
  /** while we are connecting to Google Music, the browser icon should not allow for any action */
  var connecting = false;
  var connectingTabId;
  //} private variables

  //{ beans
  /** settings that must not be synced with Chrome sync */
  var localSettings = new Bean({
    lastfmSessionKey: null,
    lastfmSessionName: null,
    googleAccountNo: 0,
    syncSettings: false,
    lyrics: false,
    lyricsProviders: [],
    lyricsFontSize: 11,
    lyricsWidth: 250,
    miniplayerSizing: {
      normal:   { width: 310, height: 153, left: 0, top: 0 },
      compact1: { width: 306, height: 118, left: 0, top: 0 },
      compact2: { width: 211, height: 163, left: 0, top: 0 },
      hbar:     { width: 555, height: 68,  left: 0, top: 0 }
    },
    playlistsListSizing: { width: 350, height: 320 },
    playlistSizing: { width: 500, height: 295 },
    albumContainersSizing: { width: 220, height: 320 },
    mixedSizing: { width: 350, height: 320 },
    quicklinksSizing: { width: 280, height: 160 },
    favoritesSizing: { width: 280, height: 200 },
    lyricsSizing: { width: 400, height: 400 },
    timerMinutes: 60,
    timerAction: "pause",
    timerNotify: true,
    timerPreNotify: 0,
    timerEnd: null,
    skipSongSeconds: 0,
    notificationsEnabled: true,
    ratingMode: null,
    quicklinks: {},
    favorites: []
  }, true);
  //do not notify listeners, if not a real change (quicklinks are sent on each connect)
  localSettings.setEqualsFn("quicklinks", Bean.objectEquals);

  /** settings that should be synced with Chrome sync if enabled */
  var settings = new Bean({
    //{ lastfm
    scrobble: true,
    scrobblePercent: 50,
    scrobbleTime: 240,
    scrobbleMaxDuration: 30,
    disableScrobbleOnFf: false,
    scrobbleRepeated: true,
    linkRatings: false,
    linkRatingsGpm: false,
    linkRatingsAuto: false,
    linkRatingsMin: 5,
    showLastfmInfo: false,
    //}
    //{ toast
    toast: true,
    toastDuration: 0,
    toastIfMpOpen: false,
    toastIfMpMinimized: false,
    toastNotIfGmActive: false,
    toastUseMpStyle: false,
    toastPriority: 3,
    toastProgress: false,
    toastRating: true,
    toastClick: "",
    toastButton1: "nextSong",
    toastButton2: "playPause",
    //}
    //{ miniplayer
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
    //}
    //{ lyrics
    lyricsAutoNext: false,
    openLyricsInMiniplayer: true,
    lyricsAutoReload: false,
    lyricsInGpm: false,
    //}
    //{ look & feel
    iconStyle: "default",
    showPlayingIndicator: true,
    showRatingIndicator: false,
    showLovedIndicator: false,
    showScrobbledIndicator: true,
    showProgress: false,
    showProgressColor: "#ff0000",
    showProgressColorPaused: "#800000",
    iconClickConnectAction: "",
    iconClickAction0: "",
    iconClickAction1: "",
    iconClickAction2: "",
    iconClickAction3: "",
    iconDoubleClickTime: 0,
    iconShowAction: true,
    saveLastPosition: false,
    hideFavorites: false,
    skipRatedLower: 0,
    openGoogleMusicPinned: false,
    openGmBackground: false,
    startupAction: "",
    pauseOnLock: false,
    pauseOnIdleSec: -60,//negative value means disabled
    connectedIndicator: true,
    preventCommandRatingReset: true,
    updateNotifier: true,
    gaEnabled: true,
    //}
    //{ filter
    optionsMode: "beg",
    filterTimer: true,
    filterLastfm: true,
    filterToast: true,
    filterMiniplayer: true,
    filterLyrics: true,
    filterLookfeel: true
    //}
  }, true);

  /** the song currently loaded */
  var song = new Bean({
    position: "0:00",
    positionSec: 0,
    info: null,
    rating: -1,
    loved: null,
    lastfmInfo: null,
    nowPlayingSent: false,
    scrobbled: false,
    scrobbleTime: -1,
    timestamp: null,
    ff: false
  });

  /** the current player state */
  var player = new Bean({
    shuffle: "",
    repeat: "",
    playing: null,
    volume: null,
    navigationList: null,
    listrating: null,
    connected: false,
    favicon: "img/icon/default/notconnected.png"
  });
  //} beans

  //{ lastfm connection
  var lastfm = new LastFM("1ecc0b24153df7dc6ac0229d6fcb8dda", "fb4b74854f7a7b099c30bfe71236dfd5");
  lastfm.session.key = localSettings.lastfmSessionKey;
  lastfm.session.name = localSettings.lastfmSessionName;
  lastfm.unavailableMessage = i18n("lastfmUnavailable");
  //}

  //{ utility functions
  /** check chrome.runtime.lastError to avoid error message in the console */
  function ignoreLastError() {
    if (chrome.runtime.lastError) $.noop();
  }

  /** @return time in seconds that a time string represents (e.g. 4:23 -> 263) */
  function parseSeconds(time) {
    if (typeof time != "string") return 0;
    return time.split(":").reverse().reduceRight(function(prev, cur, i) {
      return parseInt(cur) * Math.pow(60, i) + prev;
    }, 0) || 0;//empty string or invalid characters would lead to NaN, return 0 in this case
  }

  /** @return true, if the 2 song info objects match in duration (if both have one), title, artist and album or if both null */
  function songsEqual(song1, song2) {
    if (song1 == song2) return true;//both null
    if (song1 && song2 &&
        (song1.duration === null || song2.duration === null || song1.duration == song2.duration) &&
        (!song1.playlist || !song2.playlist || song1.playlist != song2.playlist || song1.cluster == song2.cluster && song1.index == song2.index) &&
        song1.title == song2.title &&
        song1.artist == song2.artist &&
        song1.album == song2.album) {
      return true;
    }
    return false;
  }
  //do not notify listeners, if not a real change (the content script might send the same song info multiple times)
  song.setEqualsFn("info", songsEqual);

  /** @return true, if the given version is newer than the saved previous version (used by options page and update listener) */
  function isNewerVersion(version) {
    if (previousVersion == null) return false;//jshint ignore:line
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

  function getQuicklinks() {
    var quicklinks = [
      "now",
      "artists",
      "albums",
      "genres",
      "rd",
      "myPlaylists",
      "ap/queue",
      "ap/auto-playlist-thumbs-up",
      "ap/auto-playlist-recent",
      "ap/auto-playlist-promo",
      "ap/shared-with-me"
    ];
    if (localSettings.quicklinks && localSettings.quicklinks.exptop) quicklinks.push("exptop", "expnew", "exprec");
    else quicklinks.push("ap/google-play-recommends");
    return quicklinks;
  }

  /** @return true, if a change from old to new rating would result in a rating reset in Google Music */
  function isRatingReset(oldRating, newRating) {
    return oldRating == newRating || isThumbsRatingMode() && (oldRating == 2 && newRating == 1 || oldRating == 4 && newRating == 5);
  }

  /** Get the last saved song from local storage. The callback will only be called if one exists. */
  function getLastSong(cb) {
    if (!settings.saveLastPosition) return false;
    chromeLocalStorage.get(null, function(items) {
      if (items.lastSong) {
        var lastSong = {
          info: items.lastSong,
          position: items.lastPosition,
          positionSec: parseSeconds(items.lastPosition),
          rating: items.rating,
          scrobbled: items.scrobbled || false,
          scrobbleTime: items.scrobbleTime || -1,
          ff: items.ff || false,
          timestamp: items.timestamp || null
        };
        cb(lastSong);
      }
    });
  }

  /** @return the label for a quick link, if connected to Google Music, the labels from the site are used. */
  function getTextForQuicklink(link) {
    if (link == "myPlaylists") return i18n("myPlaylists");
    var text;
    if (link) text = localSettings.quicklinks[link];//try to get text from Google site
    //use default
    return text || i18n("quicklink_" + link.replace(/-/g, "_").replace(/\//g, "_"));
  }

  /** Open the options tab or focus it, if already opened. */
  function openOptions() {
    if (optionsTabId) {
      chromeTabs.update(optionsTabId, { active: true });
    } else {
      chromeTabs.create({ url: getExtensionUrl("options.html") });
    }
  }
  chromeNotifications.onShowSettings.addListener(openOptions);

  function getSearchLink(search) {
    return "sr/" + fixForUri(search);
  }

  function isStarRatingMode() {
    return localSettings.ratingMode == "star";
  }

  function isThumbsRatingMode() {
    return localSettings.ratingMode == "thumbs";
  }
  //} utility functions

  //{ Google Analytics
  function getGADimensions() {
    return [localSettings.lyrics.toString(), isScrobblingEnabled().toString(), settings.toast.toString(), settings.layout];
  }

  function getGAMetrics() {
    return [settings.scrobblePercent.toString(), settings.toastDuration.toString()];
  }

  var GA = initGA(settings, "bp", getGADimensions(), getGAMetrics());

  function updateGADimensions() {
    GA.setDimensions(getGADimensions());
  }
  localSettings.al("lyrics lastfmSessionKey", updateGADimensions);
  settings.al("scrobble toast layout", updateGADimensions);
  settings.al("scrobblePercent toastDuration", function() { GA.setMetrics(getGAMetrics()); });
  //} Google Analytics

  var lyricsProviders = initLyricsProviders(GA);

  //{ lastfm functions
  /** @return true, if scrobbling is available, i.e. user is logged in and enabled scrobbling */
  function isScrobblingEnabled() {
    return settings.scrobble && !!localSettings.lastfmSessionKey;
  }

  /** open the last.fm authentication page */
  function lastfmLogin() {
    var url = lastfm.getLoginUrl(getExtensionUrl("options.html"));
    if (optionsTabId) {
      chromeTabs.update(optionsTabId, { url: url, active: true });
    } else {
      chromeTabs.create({ url: url });
    }
    GA.event(GA_CAT_LASTFM, "AuthorizeStarted");
  }

  /** reset last.fm session */
  function lastfmLogout() {
    GA.event(GA_CAT_LASTFM, "Logout");
    lastfm.session = {};
    localSettings.lastfmSessionKey = null;
    localSettings.lastfmSessionName = null;
    song.loved = null;
  }

  /**
   * Load song info from last.fm and provide it to given callback.
   * The callback takes parameters loved and info, which both might be null.
   * On errors, loved is set to a string providing the error message.
   */
  function getLastfmInfo(songInfo, cb) {
    if (songInfo) {
      var params = { artist: songInfo.artist, track: songInfo.title };
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
          cb(loved, lastfmInfo);
        },
        error: function(code, msg) {
          cb(msg, null);
          GA.event(GA_CAT_LASTFM, "getInfoError-" + code);
        }
      });
    } else cb(null, null);
  }

  function updateLovedState(doLove, songInfo, cb) {
    if (localSettings.lastfmSessionKey && songInfo) {
      var fnName = doLove ? "love" : "unlove";
      lastfm.track[fnName]({
        artist: songInfo.artist,
        track: songInfo.title
      }, {
        success: function() { cb(doLove); },
        error: function(code, msg) {
          cb(msg);
          GA.event(GA_CAT_LASTFM, fnName + "Error-" + code);
        }
      });
    }
  }

  /** Love a song in last.fm. The callback either gets true or an error message. */
  var love = updateLovedState.bind(window, true);

  /** Unlove a song in last.fm. The callback either gets false or an error message. */
  var unlove = updateLovedState.bind(window, false);

  function updateTrackLoved(fn) {
    song.loved = null;
    var songInfo = song.info;
    fn(songInfo, function(loved) { if (songInfo == song.info) song.loved = loved; /* check if song meanwhile changed */ });
  }

  /** Love the current song (if it isn't already). If a non-false/0/null/undefined parameter is given, the link ratings logic will be executed. */
  function loveTrack(event) {
    if (song.loved !== true) {
      updateTrackLoved(love);
      //auto-rate if called by click event and not rated yet
      if (event && settings.linkRatings && song.rating === 0) executeInGoogleMusic("rate", { rating: 5 });
    }
  }

  /** Unlove the current song. */
  var unloveTrack = updateTrackLoved.bind(window, unlove);

  /** Load info/loved status for current song from last.fm. */
  function loadCurrentLastfmInfo() {
    song.lastfmInfo = null;
    song.loved = null;
    var songInfo = song.info;
    getLastfmInfo(songInfo, function(loved, lastfmInfo) {
      if (songInfo != song.info) return;//song meanwhile changed
      song.lastfmInfo = lastfmInfo;
      song.loved = loved;
      if (settings.linkRatings && settings.linkRatingsAuto) {
        if (loved === true && song.rating === 0) executeInGoogleMusic("rate", { rating: 5 });
        else if (loved === false && (song.rating >= settings.linkRatingsMin || isThumbsRatingMode() && song.rating >= 4)) loveTrack();
      }
    });
  }

  /** Calculate and set the song position in seconds (song.scrobbleTime) when the song will be scrobbled or -1 if disabled */
  function calcScrobbleTime() {
    if (song.scrobbled) return;
    if (song.info &&
      song.info.durationSec > 0 &&
      isScrobblingEnabled() &&
      !(song.ff && settings.disableScrobbleOnFf) &&
      !(settings.scrobbleMaxDuration > 0 && song.info.durationSec > settings.scrobbleMaxDuration * 60)) {
      var scrobbleTime = song.info.durationSec * settings.scrobblePercent / 100;
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

  /** Write a song to local storage for a later try to scrobble it. */
  function cacheForLaterScrobbling(songInfo) {
    var scrobbleCache = localStorage.scrobbleCache;
    scrobbleCache = scrobbleCache ? JSON.parse(scrobbleCache) : {};
    if (scrobbleCache.user != localSettings.lastfmSessionName) {
      scrobbleCache.songs = [];
      scrobbleCache.user = localSettings.lastfmSessionName;
    }

    while (scrobbleCache.songs.length >= 50) {
      scrobbleCache.songs.shift();
    }
    scrobbleCache.songs.push(songInfo);
    localStorage.scrobbleCache = JSON.stringify(scrobbleCache);
  }

  /** @return true, if the last.fm error code allows for a new try to scrobble. */
  function isScrobbleRetriable(code) {
    return code == 16 || code == 11 || code == 9 || code == -1;
  }

  /** Scrobble all songs that have been cached fro scrobble retry. */
  function scrobbleCachedSongs() {
    var scrobbleCache = localStorage.scrobbleCache;
    if (scrobbleCache) {
      scrobbleCache = JSON.parse(scrobbleCache);
      if (scrobbleCache.user != localSettings.lastfmSessionName) {
        localStorage.removeItem("scrobbleCache");
        return;
      }
      var params = {};
      scrobbleCache.songs.forEach(function(curSong, i) {
        for (var prop in curSong) params[prop + "[" + i + "]"] = curSong[prop];
      });
      lastfm.track.scrobble(params, {
        success: function() {
          localStorage.removeItem("scrobbleCache");
          GA.event(GA_CAT_LASTFM, "ScrobbleCachedOK");
        },
        error: function(code) {
          console.warn("Error on cached scrobbling: " + code);
          if (!isScrobbleRetriable(code)) localStorage.removeItem("scrobbleCache");
          GA.event(GA_CAT_LASTFM, "ScrobbleCachedError-" + code);
        }
      });
    }
  }

  function getSongLastFmParams() {
    var params = {
      artist: song.info.artist,
      duration: song.info.durationSec,
      track: song.info.title
    };
    var album = song.info.album;
    if (album) params.album = album;
    var albumArtist = song.info.albumArtist;
    if (albumArtist && albumArtist != params.artist) params.albumArtist = albumArtist;
    return params;
  }

  /** Scrobble the current song. */
  function scrobble() {
    var params = getSongLastFmParams();
    params.timestamp = song.timestamp;
    if (song.info.albumArtist) params.albumArtist = song.info.albumArtist;
    var cloned = $.extend({}, params);//clone now, lastfm API will enrich params with additional values we don't need
    lastfm.track.scrobble(params, {
      success: function() {
        GA.event(GA_CAT_LASTFM, "ScrobbleOK");
        scrobbleCachedSongs();//try cached songs again now that the service seems to work again
      },
      error: function(code) {
        console.warn("Error on scrobbling '" + params.track + "': " + code);
        if (isScrobbleRetriable(code)) cacheForLaterScrobbling(cloned);
        GA.event(GA_CAT_LASTFM, "ScrobbleError-" + code);
      }
    });
  }

  /** Send updateNowPlaying for the current song. */
  function sendNowPlaying() {
    lastfm.track.updateNowPlaying(getSongLastFmParams(), {
      success: function() { GA.event(GA_CAT_LASTFM, "NowPlayingOK"); },
      error: function(code) {
        console.warn("Error on now playing '" + song.info.title + "': " + code);
        GA.event(GA_CAT_LASTFM, "NowPlayingError-" + code);
      }
    });
  }

  /** Logout from last.fm and show a notification to login again. */
  lastfm.sessionTimeoutCallback = function() {
    lastfmLogout();
    createNotification(RELOGIN, {
      type: "basic",
      title: i18n("lastfmSessionTimeout"),
      message: i18n("lastfmRelogin"),
      iconUrl: getExtensionUrl("img/icon-48x48.png"),
      priority: 1,
      isClickable: true
    }, function(nid) {
      addNotificationListener("click", nid, function() {
        clearNotification(nid);
        lastfmLogin();
      });
    });
  };
  //} lastfm functions

  //{ content script post functions
  /** Send a message to the Google Music port, if connected. */
  function postToGooglemusic(msg) {
    if (googlemusicport) googlemusicport.postMessage(msg);
  }

  /** Execute a command with options with the Google Music content script. */
  function executeInGoogleMusic(command, options) {
    postToGooglemusic({ type: "execute", command: command, options: options || {} });
  }

  /** Change the volume in Google Music. */
  function setVolume(percent) {
    executeInGoogleMusic("setVolume", { percent: percent });
  }

  /** Change the song position in Google Music. */
  function setSongPosition(percent) {
    executeInGoogleMusic("setPosition", { percent: percent });
  }

  /** Rate the current song in Google Music, if possible. For arg 5, this triggers the link-ratings logic, if not a rating reset. */
  function rate(rating) {
    if (song.rating < 0) return;//negative ratings cannot be changed
    //auto-love if no reset and not loved yet
    if (settings.linkRatings && rating >= settings.linkRatingsMin && !isRatingReset(song.rating, rating)) loveTrack();
    executeInGoogleMusic("rate", { rating: rating });
  }

  /** Tell the connected Google Music port about changes in the lyrics settings. */
  function postLyricsState() {
    postToGooglemusic({
      type: "lyricsState",
      enabled: localSettings.lyrics && settings.lyricsInGpm,
      fontSize: localSettings.lyricsFontSize,
      width: localSettings.lyricsWidth,
      autoReload: settings.lyricsAutoReload
    });
  }

  var loadNavlistLink;
  function loadNavlistIfConnected() {
    if (!loadNavlistLink) return;
    if (player.connected) {
      postToGooglemusic({ type: "getNavigationList", link: loadNavlistLink, omitUnknownAlbums: loadNavlistLink == "albums" && settings.omitUnknownAlbums });
      loadNavlistLink = null;
    } else openGoogleMusicTab(loadNavlistLink, false, true);//when connected, we get triggered again
  }
  /** Load a navigation list in Google Music and wait for message from there (player.navigationList will be updated). If not connected, open a Google Music tab and try again. */
  function loadNavigationList(link) {
    loadNavlistLink = link;
    loadNavlistIfConnected();
  }

  /** Select a link in the Google Music tab or open it when not connected. */
  function selectLink(link, openGmInCurrentTab) {
    postToGooglemusic({ type: "selectLink", link: link });
    openGoogleMusicTab(link, true, false, openGmInCurrentTab);//if already opened focus the tab, else open & focus a new one
  }

  var startPlaylistLink;
  function startPlaylistIfConnected(openGmInCurrentTab) {
    if (!startPlaylistLink) return;
    if (player.connected) {
      postToGooglemusic({ type: "startPlaylist", link: startPlaylistLink });
      startPlaylistLink = null;
    } else openGoogleMusicTab(startPlaylistLink, false, true, openGmInCurrentTab);//when connected, we get triggered again
  }
  /** Start a playlist in Google Music. */
  function startPlaylist(link, openGmInCurrentTab) {
    startPlaylistLink = link;
    startPlaylistIfConnected(openGmInCurrentTab);
  }

  var feelingLucky = false;
  function executeFeelingLuckyIfConnected() {
    if (!feelingLucky) return;
    if (player.connected) {
      executeInGoogleMusic("feelingLucky");
      feelingLucky = false;
    } else openGoogleMusicTab(null, false, true);//when connected, we get triggered again
  }
  /** Execute "feeling lucky" in Google Music. If not connected, open a Google Music tab and try again. */
  function executeFeelingLucky() {
    feelingLucky = true;
    executeFeelingLuckyIfConnected();
  }

  function resumeLastSongIfConnected() {
    if (!lastSongToResume) return;
    if (player.connected) {
      postToGooglemusic({
        type: "resumeLastSong",
        albumLink: lastSongToResume.info.albumLink,
        artist: lastSongToResume.info.artist,
        title: lastSongToResume.info.title,
        duration: lastSongToResume.info.duration,
        position: lastSongToResume.positionSec / lastSongToResume.info.durationSec
      });
    } else openGoogleMusicTab(null, false, true);//when connected, we get triggered again
  }
  /** Resume the saved last song in Google Music. If not connected, open a Google Music tab and try again. */
  function resumeLastSong(lastSong) {
    lastSongToResume = lastSong;
    resumeLastSongIfConnected();
  }

  /** Shortcut to call the play/pause command in Google Music. */
  function executePlayPause(resume) {
    executeInGoogleMusic("playPause", { resume: resume });
  }

  function skipSong() {
    executeInGoogleMusic("nextSong");
  }
  //} content script post functions

  //{ lyrics functions
  /** Open a songlyrics.com tab for the given (or current) song, if possible. */
  function openLyrics(aSong) {
    if (!aSong) {
      if (!song.info) return;
      aSong = { artist: song.info.artist, title: song.info.title };
    }
    var index = 0;
    function tryNext(tabId) {
      var providers = localSettings.lyricsProviders;
      lyricsProviders[providers[index]].openLyrics(aSong, chromeTabs, function(result, newTabId) {
        if (!result && settings.lyricsAutoNext && providers[++index]) tryNext(newTabId);
      }, tabId);
    }
    tryNext();
  }

  /** Fetch lyrics from a specific provider. */
  function fetchLyricsFrom(song, provider, cb) {
    lyricsProviders[provider].fetchLyrics(song, function(result) {
      cb(provider, result);
    });
  }

  /**
   * Fetch lyrics for a song.
   * If lyricsAutoNext is enabled, all enabled providers will be searched until one returns a result.
   * The callback receives a list of other providers to try and the search result.
   */
  function fetchLyrics(aSong, cb) {
    var index = 0;
    function tryNext() {
      var providers = localSettings.lyricsProviders;
      fetchLyricsFrom(aSong, providers[index], function(provider, result) {
        if ((result.error || result.noresults) && settings.lyricsAutoNext && providers[++index]) tryNext();
        else cb(providers.slice(index + 1), provider, result);
      });
    }
    tryNext();
  }
  //} lyrics functions

  //{ notifications handling
  /** Wrap chrome notifications API for convenience. */
  var notifications = {};
  var RELOGIN = "pp.relogin";
  var TOAST = "pp.toast";
  var TIMEREND = "pp.timerEnd";
  var TIMERWARN = "pp.timerwarn";

  function updateNotification(id, options, cb) {
    if (localSettings.notificationsEnabled) chromeNotifications.update(id, options, cb || $.noop);
  }

  function clearNotification(id, cb) {
    if (localSettings.notificationsEnabled) chromeNotifications.clear(id, cb || $.noop);
  }

  function addNotificationListener(evt, id, cb) {
    notifications[id][evt].push(cb);
  }

  function createNotification(id, options, cb) {
    if (localSettings.notificationsEnabled) chromeNotifications.create(id, options, function(nid) {
      notifications[nid] = { click: [], btnClick: [], close: [] };
      cb(nid);
      addNotificationListener("close", nid, function() { delete notifications[nid]; });
    });
  }

  function globalNotificationListener(evt, id, arg2) {
    var forId = notifications[id];
    if (forId && forId[evt]) forId[evt].forEach(function(listener) { listener(arg2); });
  }
  var globalClickListener = globalNotificationListener.bind(window, "click");
  var globalBtnClickListener = globalNotificationListener.bind(window, "btnClick");
  var globalCloseListener = globalNotificationListener.bind(window, "close");

  function initNotifications() {
    if (!chromeNotifications.onClicked.hasListener(globalClickListener)) chromeNotifications.onClicked.addListener(globalClickListener);
    if (!chromeNotifications.onButtonClicked.hasListener(globalBtnClickListener)) chromeNotifications.onButtonClicked.addListener(globalBtnClickListener);
    if (!chromeNotifications.onClosed.hasListener(globalCloseListener)) chromeNotifications.onClosed.addListener(globalCloseListener);
  }

  function updateNotificationsEnabled(level) {
    localSettings.notificationsEnabled = level == "granted";
  }
  chromeNotifications.getPermissionLevel(updateNotificationsEnabled);
  chromeNotifications.onPermissionLevelChanged.addListener(updateNotificationsEnabled);
  //} notifications handling

  //{ browser icon handling
  var browserIconCtx;
  var browserIconWithoutProgressImageData;
  var lastProgressPosition = 0;
  /**
   * Draw the progress onto the current browserIconCtx, if enabled.
   * @return true, if sth. was painted, else false (not enabled, no current song or no relevant change)
   */
  function drawProgress(init) {
    if (settings.showProgress && browserIconCtx && song.info && (init || Math.abs(song.positionSec - lastProgressPosition) > 2)) {
      lastProgressPosition = song.positionSec;

      if (init) browserIconWithoutProgressImageData = browserIconCtx.getImageData(0, 0, 38, 38);
      else browserIconCtx.putImageData(browserIconWithoutProgressImageData, 0, 0);

      if (lastProgressPosition) {
        browserIconCtx.strokeStyle = player.playing ? settings.showProgressColor : settings.showProgressColorPaused;
        browserIconCtx.globalAlpha = 0.5;
        browserIconCtx.lineWidth = 6;
        browserIconCtx.beginPath();
        browserIconCtx.arc(18, 19, 14, 1.5 * Math.PI, (2 * lastProgressPosition / song.info.durationSec - 0.5) * Math.PI);
        browserIconCtx.stroke();
        browserIconCtx.globalAlpha = 1.0;
      }
      return true;
    }
    return false;
  }

  /** Draw the given images onto the backgroundSrc, call cb with canvas context when ready. */
  function drawIcon(backgroundSrc, imagePaths, cb, clickAction) {
    var iconCtx = $("<canvas width='38' height='38'/>")[0].getContext("2d");
    var image = new Image();
    var backgroundDrawn = false;
    var clickActionAvailable = isCommandAvailable(clickAction);
    function loadNext() {
      var path = clickAction ? getCommandIconUrl(clickAction) : imagePaths.shift();
      if (path) image.src = getExtensionUrl(path + ".png");
      else cb(iconCtx);
    }
    image.onload = function() {
      if (backgroundDrawn) {
        if (clickAction) {
          clickAction = null;
          iconCtx.globalAlpha = clickActionAvailable ? 1.0 : 0.5;
          iconCtx.drawImage(image, 0, 0, 38, 38);
          iconCtx.globalAlpha = 1.0;
        } else iconCtx.drawImage(image, 0, 0);
      } else {
        iconCtx.globalAlpha = clickActionAvailable || settings.showProgress && song.info ? 0.5 : 1.0;
        iconCtx.drawImage(image, 0, 0);
        iconCtx.globalAlpha = 1.0;
        backgroundDrawn = true;
      }
      loadNext();
    };
    image.src = getExtensionUrl(backgroundSrc);
  }

  /** Set the browser icon to the current painted image in browserIconCtx. */
  function updateBrowserIcon() {
    if (browserIconCtx) chromeBrowserAction.setIcon({ imageData: { "38": browserIconCtx.getImageData(0, 0, 38, 38) } });
  }

  function doUpdateBrowserActionInfo() {
    var iconPath = "img/icon/";
    var path = iconPath + settings.iconStyle + "/";
    var title = i18n("extTitle");
    var iconPaths = [];
    var clickAction;
    chromeBrowserAction.setBadgeText({ text: "" });
    if (viewUpdateNotifier) {
      path = iconPath + "updated";
      title += " - " + i18n("browserActionTitle_" + viewUpdateNotifier);
    } else if (player.connected) {
      path += "connected";
      if (song.info) {
        title = song.info.artist + " - " + song.info.title;
        if (song.scrobbled && settings.showScrobbledIndicator) {
          iconPaths.push(iconPath + "scrobbled");
          title += " (" + i18n("browserActionTitle_scrobbled") + ")";
        }
        if (song.loved === true && settings.showLovedIndicator) {
          iconPaths.push(iconPath + "loved");
        }
        if (song.rating && settings.showRatingIndicator) {
          if (isStarRatingMode()) {
            chromeBrowserAction.setBadgeText({ text: "" + song.rating });
          } else if (isThumbsRatingMode()) {
            if (song.rating >= 4) {
              iconPaths.push(iconPath + "thumbsUp");
            } else if (song.rating == 1 || song.rating == 2) {
              iconPaths.push(iconPath + "thumbsDown");
            }
          }
        }
        if (settings.showPlayingIndicator) {
          if (player.playing) {
            iconPaths.push(iconPath + "playing");
            title = i18n("browserActionTitle_playing") + ": " + title;
          } else {
            iconPaths.push(iconPath + "paused");
            title = i18n("browserActionTitle_paused") + ": " + title;
          }
        }
      } else {
        title += " - " + i18n("browserActionTitle_connected");
      }
      clickAction = settings.iconClickAction0;
    } else {
      path += "notconnected";
      if (connecting) {
        //we are currently connecting, (content script is about to initialise or Google Music has been opened but content script did not connect yet)
        chromeBrowserAction.setBadgeText({ text: "..." });
        title += " - " + i18n("browserActionTitle_connecting");
      } else clickAction = getAvailableIconClickConnectAction();
    }
    path += ".png";

    if (isCommandAvailable(clickAction)) title += " - " + getCommandText(clickAction);

    drawIcon(path, iconPaths, function(iconCtx) {
      browserIconCtx = iconCtx;
      drawProgress(true);
      updateBrowserIcon();
    }, settings.iconShowAction ? clickAction : null);
    if (iconPaths.length) drawIcon(path, iconPaths.concat(), function(iconCtx) {
      player.favicon = iconCtx.canvas.toDataURL();
    }); else player.favicon = path;
    chromeBrowserAction.setTitle({ title: title });
  }

  /** handler for all events that need to update the browser action icon/title */
  var updateBrowserActionInfoTimer;
  function updateBrowserActionInfo() {
    clearTimeout(updateBrowserActionInfoTimer);
    updateBrowserActionInfoTimer = setTimeout(doUpdateBrowserActionInfo, 100);
  }
  //} browser icon handling

  //{ Google Music connection handling
  /** Remove the given one from parked ports. */
  function removeParkedPort(port) {
    parkedPorts.some(function(parkedPort, i) {
      if (port == parkedPort) {
        parkedPorts.splice(i, 1);
        return true;
      }
    });
  }

  /** Use the given port for the connection to Google Music. */
  function connectPort(port) {
    googlemusicport = port;
    googlemusictabId = port.sender.tab.id;
    port.onMessage.addListener(onMessageListener);
    port.onDisconnect.addListener(onDisconnectListener);
    if (!connecting) {
      connecting = true;
      refreshContextMenu();
      updateBrowserActionInfo();
      iconClickSettingsChanged();
    }
    connectingTabId = null;//from now on, connection cancelling is handled by onDisconnectListener
    port.postMessage({ type: "connected" });
  }

  /** Check if the given port's tab is already connected. */
  function isConnectedTab(port) {
    var portTabId = port.sender.tab.id;
    if (googlemusicport && portTabId == googlemusicport.sender.tab.id) return true;
    return parkedPorts.some(function(parkedPort) { return portTabId == parkedPort.sender.tab.id; });
  }

  /**
   * Handler for onConnect event:
   * - check origin
   * - check if tab already connected
   * - check if another tab is already connected
   * - otherwise connect the port
   */
  function onConnectListener(port) {
    if (port.name != "googlemusic") throw "invalid port: " + port.name;

    console.debug("cs connects");
    if (isConnectedTab(port)) {
      port.postMessage({ type: "alreadyConnected" });
    } else {
      if (googlemusicport) {
        parkedPorts.push(port);
        port.onDisconnect.addListener(removeParkedPort);
      } else {
        connectPort(port);
      }
    }
  }
  chromeRuntime.onConnect.addListener(onConnectListener);

  /** handler for onDisconnect event - reset player/song to defaults, try to connect a parked port */
  function onDisconnectListener() {
    console.debug("cs disconnected");
    googlemusicport = null;
    googlemusictabId = null;
    connecting = false;
    refreshContextMenu();

    song.reset();
    player.reset();
    updateBrowserActionInfo();
    iconClickSettingsChanged();

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
    console.debug("cs->bp", type, val);

    function postLyrics(src, result, providers) {
      //we cannot send jQuery objects with a post, so send plain html
      if (result.lyrics) result.lyrics = result.lyrics.html();
      if (result.credits) result.credits = result.credits.html();
      if (result.title) result.title = result.title.text().trim();
      postToGooglemusic({ type: "lyrics", result: result, providers: providers, srcUrl: lyricsProviders[src].getUrl() });
    }

    if (type.indexOf("song-") === 0) {
      if (type == "song-position" && !val) val = "0:00";
      song[type.substring(5)] = val;
    } else if (type.indexOf("player-") === 0) {
      player[type.substring(7)] = val;
    } else if (type == "connected") {
      connecting = false;
      player.connected = true;
      updateBrowserActionInfo();
      iconClickSettingsChanged();
      localSettings.ratingMode = val.ratingMode;
      localSettings.quicklinks = val.quicklinks;
      refreshContextMenu();
    } else if (type == "loadLyrics") {
      if (!song.info) return;
      if (val) fetchLyricsFrom(song.info, val, postLyrics);
      else fetchLyrics(song.info, function(providers, src, result) {
        var providersWithUrl = [];
        providers.forEach(function(provider) {
          providersWithUrl.push({ provider: provider, url: lyricsProviders[provider].getUrl() });
        });
        postLyrics(src, result, providersWithUrl);
      });
    } else if (type == "rated") {
      if (settings.linkRatings && settings.linkRatingsGpm && val.rating >= settings.linkRatingsMin) {
        if (songsEqual(song.info, val.song)) loveTrack();
        else love(val.song, $.noop);
      }
    }
  }
  //} Google Music connection handling

  //{ toast handling
  /** @return button information object (title, iconUrl) for a command to be provided to 'createNotification' or null, if not available */
  function getToastBtn(cmd) {
    if (!cmd) return null;
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
    case "rate-2":
    case "rate-3":
    case "rate-4":
      if (isThumbsRatingMode()) return null;
      break;
    }
    return { title: getCommandText(cmd), iconUrl: getExtensionUrl(getCommandIconUrl(cmd) + ".png") };
  }

  /** Updates the toast's iconUrl with the album cover and rating. */
  function drawToastImage() {
    if (!song.info || !toastOptions) return;
    var cover = new Image();
    var rating = new Image();
    var coverReady = false;
    var ratingReady = false;
    function draw() {
      if (!toastOptions) return;//might be closed already
      var ctx = $("<canvas width='100' height='100'/>")[0].getContext("2d");
      ctx.drawImage(cover, 0, 0, 100, 100);
      if (cover.src.indexOf("blob") === 0) URL.revokeObjectURL(cover.src);
      if (settings.toastRating) {
        if (isThumbsRatingMode()) {
          if (song.rating == 1 || song.rating == 2) ctx.drawImage(rating, 16, 0, 16, 16, 0, 84, 16, 16);
          else if (song.rating >= 4) ctx.drawImage(rating, 0, 0, 16, 16, 0, 84, 16, 16);
        } else if (isStarRatingMode()) {
          for (var i = 0; i < song.rating; i++) {
            ctx.drawImage(rating, 32, 0, 16, 16, i * 16, 84, 16, 16);
          }
        }
        if (song.loved === true) {
          ctx.drawImage(rating, 48, 0, 16, 16, 84, 84, 16, 16);
        }
      }
      toastOptions.iconUrl = ctx.canvas.toDataURL();
      updateNotification(TOAST, toastOptions);
    }

    if (settings.toastRating && (song.rating > 0 || song.loved === true)) {
      rating.onload = function() { ratingReady = true;  if (coverReady) draw(); };
      rating.src = getExtensionUrl("img/rating.png");
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
        cover.src = getExtensionUrl("img/cover.png");
      };
      toastCoverXhr.send();
    } else {
      cover.src = getExtensionUrl("img/cover.png");
    }
  }

  /** Callbacks when toast has been closed. */
  function toastClosed() {
    toastOptions = null;
    song.rl("rating loved", drawToastImage);
    settings.rl("toastRating", drawToastImage);
    if (toastCoverXhr) {
      toastCoverXhr.abort();
      toastCoverXhr = null;
    }
  }
  function toastMpClosed(winId) {
    if (toastWin && winId == toastWin.id) {
      toastWin = null;
      chromeWindows.onRemoved.removeListener(toastMpClosed);
    }
  }

  /** Callback when toast button was clicked. */
  function toastButtonClicked(buttonIndex) {
    //check which button was clicked and that the button is valid (otherwise it is not displayed and we would execute the wrong command)
    var cmd = settings.toastButton1;
    var btn = getToastBtn(cmd);
    if (!btn || buttonIndex == 1) {
      cmd = settings.toastButton2;
      btn = getToastBtn(cmd);
    }
    if (btn) executeCommand(cmd, "toast");
  }

  function getToastOptions() {
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
      iconUrl: getExtensionUrl("img/cover.png"),
      buttons: btns,
      priority: settings.toastPriority - 2,
      isClickable: !!settings.toastClick
    };
    if (settings.toastProgress) options.progress = Math.floor(song.positionSec * 100 / song.info.durationSec);
    return options;
  }

  var closeToastTimer;
  /** Close the toast, if open and call an optional function when finished. */
  function closeToast(cb) {
    clearTimeout(closeToastTimer);
    if (!$.isFunction(cb)) cb = $.noop;
    if (toastOptions) clearNotification(TOAST, cb);
    else if (toastWin) chromeWindows.remove(toastWin.id, cb);
    else cb();
  }

  /** Open a toast, either as miniplayer or notification. */
  function openToast() {
    closeToast(function() {
      if (settings.toastUseMpStyle) {
        createPlayer("toast", function(win) {
          toastWin = win;
          chromeWindows.onRemoved.addListener(toastMpClosed);
        }, false);
      } else {
        var options = getToastOptions();
        createNotification(TOAST, options, function(nid) {
          toastOptions = options;
          addNotificationListener("close", nid, toastClosed);
          addNotificationListener("click", nid, function() { if (settings.toastClick) executeCommand(settings.toastClick, "toast"); });
          addNotificationListener("btnClick", nid, toastButtonClicked);
          song.w("rating loved", drawToastImage);
          settings.al("toastRating", drawToastImage);
        });
        if (settings.toastDuration > 0) {
          closeToastTimer = setTimeout(closeToast, settings.toastDuration * 1000);
        }
      }
    });
  }

  function updateToast() {
    if (toastOptions && song.info) {
      var iconUrl = toastOptions.iconUrl;
      toastOptions = getToastOptions();
      toastOptions.iconUrl = iconUrl;
      updateNotification(TOAST, toastOptions);
    }
  }
  //} toast handling

  //{ Google tab handling
  /** Open or activate a Google Music tab. */
  function openGoogleMusicTab(link, forceActive, forceBackground, openGmInCurrentTab) {
    var active = forceActive === true || !settings.openGmBackground && !forceBackground;
    if (googlemusictabId) {
      if (active) chromeTabs.update(googlemusictabId, { active: true });
    } else if (!connecting) {
      var url = "http://play.google.com/music/listen";
      if (localSettings.googleAccountNo) url += "?u=" + localSettings.googleAccountNo;
      if (typeof link == "string") url += "#/" + link;
      var createFn = openGmInCurrentTab ? chromeTabs.update : chromeTabs.create;
      createFn({ url: url, pinned: settings.openGoogleMusicPinned, active: active }, function(tab) {
        connectingTabId = tab.id;
        connecting = true;
        refreshContextMenu();
        updateBrowserActionInfo();
        iconClickSettingsChanged();
      });
    }
  }

  chromeTabs.onRemoved.addListener(function(tabId) {
    if (connectingTabId == tabId) {
      connecting = false;
      connectingTabId = null;
      refreshContextMenu();
      updateBrowserActionInfo();
      iconClickSettingsChanged();
    }
  });

  /** Connect existing Google Music tabs on startup. */
  function connectGoogleMusicTabs() {
    chromeTabs.query({ url:"*://play.google.com/music/listen*" }, function(tabs) {
      tabs.forEach(function(tab) {
        chromeTabs.insertCSS(tab.id, { file: "css/gpm.css" });
        chromeTabs.executeScript(tab.id, { file: "js/jquery-2.1.3.min.js" });
        chromeTabs.executeScript(tab.id, { file: "js/cs.js" });
      });
    });
  }

  /** Close the Google Music tab. */
  function closeGm() {
    if (googlemusictabId) chromeTabs.remove(googlemusictabId);
  }
  //} Google tab handling

  //{ miniplayer handling
  var miniplayerReopen = false;
  /** Reset state when miniplayer is closed, reopen if necessary. */
  function miniplayerClosed(winId) {
    if (miniplayer && winId == miniplayer.id) {
      chromeWindows.onRemoved.removeListener(miniplayerClosed);
      miniplayer = null;
      if (miniplayerReopen) {
        openMiniplayer();
        miniplayerReopen = false;
      } else if (settings.mpCloseGm) closeGm();
    }
  }

  /** Open new player window for the given type ("miniplayer", "popup" or "toast"). */
  function createPlayer(type, callback, focused) {
    var sizing = localSettings.miniplayerSizing[settings.layout];
    chromeWindows.create({
        url: getExtensionUrl("player.html") + "?type=" + type,
        height: sizing.height,
        width: sizing.width,
        top: sizing.top,
        left: sizing.left,
        type: settings.miniplayerType,
        focused: focused
      }, callback
    );
  }

  /** Open the miniplayer. */
  function openMiniplayer() {
    if (!settings.toastIfMpOpen || settings.toastIfMpMinimized) closeToast();
    if (miniplayer) {//close first
      miniplayerReopen = true;
      chromeWindows.remove(miniplayer.id);
      //miniplayerClosed callback will open it again
      return;
    }

    createPlayer("miniplayer", function(win) {
      miniplayer = win;
      chromeWindows.onRemoved.addListener(miniplayerClosed);
    }, true);
  }

  /** Open the miniplayer if not already when a song starts playing. */
  function openMpOnPlaying(playing) {
    if (playing && miniplayer === null) openMiniplayer();
  }

  /** Close the miniplayer when Google Music disconnects. */
  function closeMpOnDisconnect(connected) {
    if (!connected && miniplayer) chromeWindows.remove(miniplayer.id);
  }
  //} miniplayer handling

  //{ browser action handling
  function resetBrowserActionPopup() {
    chromeBrowserAction.setPopup({ popup: "" });
  }

  function setBrowserActionPopup() {
    chromeBrowserAction.setPopup({ popup: "player.html" });
  }

  var iconClickCount = 0;
  var iconClickActionTimer;
  /** Execute the icon click action corresponding to the number of clicks. */
  function iconClickActionDelayed() {
    clearTimeout(iconClickActionTimer);
    var action = settings["iconClickAction" + iconClickCount];
    if (settings.iconDoubleClickTime) {
      iconClickCount++;
      var nextAction = settings["iconClickAction" + iconClickCount];
      if (!nextAction) setBrowserActionPopup();
      iconClickActionTimer = setTimeout(function() {
        resetBrowserActionPopup();
        iconClickCount = 0;
        executeCommand(action, "icon");
      }, settings.iconDoubleClickTime);
    } else executeCommand(action, "icon");
  }

  /** Callback from popup to signal that it's open. */
  exports.popupOpened = function() {
    if (iconClickCount > 0) {
      clearTimeout(iconClickActionTimer);
      iconClickCount = 0;
      resetIconClickActionAndPopup();
      setIconClickActionOrPopup();
    }
  };

  function resetIconClickActionAndPopup() {
    chromeBrowserAction.onClicked.removeListener(iconClickActionDelayed);
    resetBrowserActionPopup();
  }

  function setIconClickActionOrPopup() {
    if (settings.iconClickAction0) chromeBrowserAction.onClicked.addListener(iconClickActionDelayed);
    else setBrowserActionPopup();
  }

  /** handler for all settings changes that need to update the browser action */
  function iconClickSettingsChanged() {
    resetIconClickActionAndPopup();
    chromeBrowserAction.onClicked.removeListener(executeIconClickConnectAction);

    function setIconClickConnectAction() {
      resetBrowserActionPopup();
      chromeBrowserAction.onClicked.addListener(executeIconClickConnectAction);
    }

    if (viewUpdateNotifier) {
      chromeBrowserAction.setPopup({ popup: "updateNotifier.html#" + viewUpdateNotifier });
    } else if (!player.connected) {
      //set popup if we are currently connecting
      if (!connecting && getAvailableIconClickConnectAction()) setIconClickConnectAction();
      else setBrowserActionPopup();
    } else setIconClickActionOrPopup();
  }
  //} browser action handling

  //{ update handling
  /** Do necessary migrations on update. */
  function migrateSettings(previousVersion) {
    function isTrue(setting) { return setting == "btrue"; }

    //--- 2.15 ---
    //if "open miniplayer" or "play/pause" was set as click action, keep it in click action 0
    var icmp = localStorage.iconClickMiniplayer;
    if (icmp) {
      if (isTrue(icmp)) settings.iconClickAction0 = "openMiniplayer";
      else if (isTrue(localStorage.iconClickPlayPause)) settings.iconClickAction0 = "playPause";
      localStorage.removeItem("iconClickMiniplayer");
      localStorage.removeItem("iconClickPlayPause");
    }

    //--- 2.18 ---
    //toast duration now has an effect on notifications, so reset to default
    if (previousVersion < 2.18 && !settings.toastUseMpStyle) {
      settings.toastDuration = 0;
    }

    //--- 2.19 ---
    //convert boolean value to number
    var sds = localStorage.skipDislikedSongs;
    if (sds) {
      settings.skipRatedLower = isTrue(sds) ? 1 : 0;
      localStorage.removeItem("skipDislikedSongs");
    }

    //--- 2.23 ---
    //use expert mode for existing users
    if (previousVersion < 2.23) settings.optionsMode = "exp";

    //--- 2.26 ---
    //renamed "searchresult" to "mixed" (mixed display is now supported for other views than search results)
    var srs = localStorage.searchresultSizing;
    if (srs) {
      localSettings.mixedSizing = JSON.parse(srs.substr(1));
      localStorage.removeItem("searchresultSizing");
    }
    //moved ratingMode from player to localSettings
    chromeLocalStorage.get("ratingMode", function(items) {
      if (items.ratingMode) {
        localSettings.ratingMode = items.ratingMode;
        chromeLocalStorage.remove("ratingMode");
      }
    });

    //--- 2.28 ---
    //set gotoGmusic as connect action if it was enabled by flag or copy iconClickAction0 if applicable
    var icc = localStorage.iconClickConnect;
    if (icc) {
      if (isTrue(icc)) settings.iconClickConnectAction = "gotoGmusic";
      else if (settings.iconClickAction0 == "openMiniplayer" || settings.iconClickAction0 == "feelingLucky") settings.iconClickConnectAction = settings.iconClickAction0;
      localStorage.removeItem("iconClickConnect");
    }

    //--- 3.0 ---
    if (previousVersion < 3.0) {
      //set "songlyrics" as provider if lyrics were enabled before
      if (localSettings.lyrics) lyricsProviders.songlyrics.checkPermission(function(hasPermission) {
        if (hasPermission) localSettings.lyricsProviders = ["songlyrics"];
      });
      //fix skipRatedLower property that might have become a string
      settings.skipRatedLower = parseInt(settings.skipRatedLower);
    }
  }

  /** handler for onInstalled event (show the orange icon on update / notification on install) */
  function updatedListener(details) {
    function setViewUpdateNotifier() {
      viewUpdateNotifier = details.reason;
      localStorage.viewUpdateNotifier = viewUpdateNotifier;
      iconClickSettingsChanged();
      updateBrowserActionInfo();
    }

    if (details.reason == "update") {
      if (settings.updateNotifier) {
        previousVersion = details.previousVersion;
        if (isNewerVersion(chromeRuntime.getManifest().version)) {
          localStorage.previousVersion = previousVersion;
          setViewUpdateNotifier();
        } else {
          previousVersion = null;
        }
      }
      migrateSettings(parseFloat(details.previousVersion));
    } else if (details.reason == "install") {
      setViewUpdateNotifier();
    }
  }
  chromeRuntime.onInstalled.addListener(updatedListener);

  function updateNotifierDone() {
    viewUpdateNotifier = null;
    localStorage.removeItem("viewUpdateNotifier");
    iconClickSettingsChanged();
    updateBrowserActionInfo();
  }

  /** Backup runtime data, cleanup and reload the extension when an update is available. */
  function reloadForUpdate() {
    var backup = {};
    backup.miniplayerOpen = miniplayer !== null;
    backup.nowPlayingSent = song.nowPlayingSent;
    backup.scrobbled = song.scrobbled;
    backup.songFf = song.ff;
    backup.songPosition = song.position;
    backup.songInfo = song.info;
    backup.songTimestamp = song.timestamp;
    backup.loved = song.loved;
    backup.volumeBeforeMute = volumeBeforeMute;
    localStorage.updateBackup = JSON.stringify(backup);
    //sometimes the onDisconnect listener in the content script is not triggered on reload(), so explicitely disconnect here
    if (googlemusicport) {
      googlemusicport.onDisconnect.removeListener(onDisconnectListener);
      googlemusicport.disconnect();
    }
    parkedPorts.forEach(function(port) {
      port.onDisconnect.removeListener(removeParkedPort);
      port.disconnect();
    });
    setTimeout(function() { chromeRuntime.reload(); }, 1000);//wait a second til port cleanup is finished
  }

  chromeRuntime.onUpdateAvailable.addListener(reloadForUpdate);
  chromeRuntime.onSuspend.addListener(function() {
    chromeRuntime.onUpdateAvailable.removeListener(reloadForUpdate);
  });

  /** true, if the position came from update backup data, needed to not set ff by mistake */
  var positionFromBackup = false;
  // restore backup, if available
  if (localStorage.updateBackup) {
    var backup = JSON.parse(localStorage.updateBackup);
    localStorage.removeItem("updateBackup");
    song.timestamp = backup.songTimestamp;
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
    if (localSettings.timerEnd) {
      startSleepTimer();
    }
    if (backup.miniplayerOpen) openMiniplayer();
  }
  //} update handling

  //{ timer handling
  function getTimerMinutesLabel(min) {
    if (min < 60) return i18n("timerInMin", min + "");
    if (min == 60) return i18n("timerInOneHour");
    var submin = min % 60;
    if (!submin) return i18n("timerInHours", min / 60 + "");
    return Math.floor(min / 60) + ":" + (submin < 10 ? "0" + submin : submin);
  }

  function getRemainingTimerTime(base) {
    return Math.max(0, Math.floor((localSettings.timerEnd - $.now() / 1000) / base));
  }

  function getStopTimerMenuTitle() {
    var min = getRemainingTimerTime(60);
    var remaining = min < 2 ? i18n("timerInOneMinute") : getTimerMinutesLabel(min);
    if (min < 1) remaining = "<" + remaining;
    return i18n("cancelTimer") + " (" + remaining + ")";
  }

  var sleepTimer;
  var preNotifyTimer;
  var contextMenuInterval;
  /** Start the sleep timer. */
  function startSleepTimer() {
    clearTimeout(sleepTimer);
    clearTimeout(preNotifyTimer);
    clearNotification(TIMERWARN);
    var nowSec = $.now() / 1000;
    var countdownSec = Math.max(0, localSettings.timerEnd - nowSec);
    sleepTimer = setTimeout(function() {
      clearSleepTimer();

      var msg, btnTitle, undoAction;
      switch (localSettings.timerAction) {
      case "pause":
        if (player.playing) {
          msg = i18n("timerNotificationMsgPause");
          btnTitle = i18n("timerNotificationBtnPause");
          undoAction = executePlayPause.bind(window, true);
          executePlayPause(false);
        }
        break;
      case "closeGm":
        if (googlemusictabId) {
          msg = i18n("timerNotificationMsgCloseGm");
          btnTitle = i18n("timerNotificationBtnCloseGm");
          undoAction = openGoogleMusicTab;
        }
        closeGm();
        break;
      }
      if (localSettings.timerNotify && msg) {
        createNotification(TIMEREND, {
          type: "basic",
          title: i18n("timerNotificationTitle"),
          message: msg,
          buttons: [{ title: btnTitle }],
          iconUrl: getExtensionUrl("img/icon-48x48.png"),
          isClickable: false
        }, function(nid) {
          function clearTimerNotify() { clearNotification(nid); }
          function btnClicked() {
            clearTimerNotify();
            undoAction();
          }
          addNotificationListener("btnClick", nid, btnClicked);
          setTimeout(clearTimerNotify, 10000);
        });
      }
    }, countdownSec * 1000);

    if (localSettings.timerPreNotify > 0 && countdownSec > 0) {
      preNotifyTimer = setTimeout(function() {
        preNotifyTimer = null;
        function getWarningMessage() {
          return i18n(localSettings.timerAction == "pause" ? "timerWarningMsgPause" : "timerWarningMsgCloseGm", "" + getRemainingTimerTime(1));
        }
        var preNotifyOptions = {
          type: "basic",
          title: i18n("timerWarningTitle"),
          message: getWarningMessage(),
          buttons: [{ title: i18n("cancelTimer") }],
          iconUrl: getExtensionUrl("img/icon-48x48.png"),
          priority: 1,
          isClickable: false
        };
        createNotification(TIMERWARN, preNotifyOptions, function(nid) {
          var preNotifyInterval;
          function btnClicked() {
            clearSleepTimer();
            clearNotification(nid);
          }
          function preNotifyClosed() {
            clearInterval(preNotifyInterval);
          }
          addNotificationListener("btnClick", nid, btnClicked);
          addNotificationListener("close", nid, preNotifyClosed);
          preNotifyInterval = setInterval(function() {
            preNotifyOptions.message = getWarningMessage();
            updateNotification(nid, preNotifyOptions);
          }, 1000);
        });
      }, Math.max(0, (countdownSec - localSettings.timerPreNotify) * 1000));
    }

    contextMenuInterval = setInterval(function() {
      chromeContextMenus.update("stopTimer", { title: getStopTimerMenuTitle() });
    }, 60000);
  }

  /** Stop the sleep timer. */
  function clearSleepTimer() {
    clearInterval(contextMenuInterval);
    contextMenuInterval = null;
    clearTimeout(sleepTimer);
    sleepTimer = null;
    clearTimeout(preNotifyTimer);
    preNotifyTimer = null;
    clearNotification(TIMERWARN);
    localSettings.timerEnd = player.connected ? 0 : null;
  }
  //} timer handling

  //{ context menu
  function updateContextMenuConnectedItem(cmds) {
    if (player.connected) {
      cmds.forEach(function(cmd) {
        chromeContextMenus.update(cmd, { title: getCommandText(cmd), enabled: isCommandAvailable(cmd) });
      });
    }
  }

  function refreshContextMenu() {
    chromeContextMenus.removeAll(function() {
      function createContextMenuEntry(id, title, cb, parentId, type, checked, enabled) {
        chromeContextMenus.create({ contexts: ["browser_action"], type: type || "normal", id: id, title: title, checked: checked, parentId: parentId, enabled: enabled }, cb);
      }

      if (localSettings.lastfmSessionKey) createContextMenuEntry("toggleScrobble", i18n("setting_scrobble"), null, null, "checkbox", settings.scrobble);

      if (player.connected) {
        var menuConnectedId = "menuConnected";
        createContextMenuEntry(menuConnectedId, i18n("action"), function() {
          var commands = ["playPause", "prevSong", "nextSong", "ff", "openMiniplayer", "volumeUp", "volumeDown", "volumeMute", "toggleRepeat", "toggleShuffle"];
          if (localSettings.lastfmSessionKey) commands.push("loveUnloveSong");
          commands.push("rate-1");
          if (isStarRatingMode()) commands.push("rate-2", "rate-3", "rate-4");
          commands.push("rate-5", "feelingLucky");
          if (localSettings.lyrics) commands.push("openLyrics");
          commands.forEach(function(cmd) {
            createContextMenuEntry(cmd, getCommandText(cmd), null, menuConnectedId, null, null, isCommandAvailable(cmd));
          });
        });
      } else if (!connecting) {
        var menuDisconnectedId = "menuDisconnected";
        createContextMenuEntry(menuDisconnectedId, i18n("action"), function() {
          var commands = ["feelingLucky", "gotoGmusic", "openMiniplayer"];
          if (settings.saveLastPosition) commands.unshift("resumeLastSong");
          commands.forEach(function(cmd) {
            createContextMenuEntry(cmd, getCommandText(cmd), null, menuDisconnectedId, null, null, isCommandAvailable(cmd));
          });
        });
      }

      if (!connecting) {
        if (!settings.hideFavorites && localSettings.favorites.length) {
          var menuFavoritesId = "menuFavorites";
          createContextMenuEntry(menuFavoritesId, i18n("favorites"), function() {
            localSettings.favorites.forEach(function(fav) {
              createContextMenuEntry("fav_" + fav.link, fav.title, null, menuFavoritesId);
            });
          });
        }
        var menuQuicklinksId = "menuQuicklinks";
        createContextMenuEntry(menuQuicklinksId, i18n("quicklinks"), function() {
          getQuicklinks().forEach(function(ql) {
            if (ql != "myPlaylists") createContextMenuEntry("ql_" + ql, getTextForQuicklink(ql).replace(/&/g, "&&"), null, menuQuicklinksId);
          });
        });
      }

      var timerEnd = localSettings.timerEnd;
      if (timerEnd !== null) {
        if (timerEnd) createContextMenuEntry("stopTimer", getStopTimerMenuTitle());
        else {
          var startTimer = "startTimer";
          createContextMenuEntry(startTimer, i18n("startTimerMenu"), function() {
            //we do not have to listen for changes on localSettings.timerAction, because if it is changed on options page, the timer gets started immediately and thus the menu is rebuilt anyway
            ["pause", "closeGm"].forEach(function(action) {
              createContextMenuEntry("timerAction_" + action, i18n("setting_timerAction_" + action), null, startTimer, "radio", localSettings.timerAction == action);
            });

            [5, 10, 30, 60, 120, 180, 240, 360, 600].forEach(function(min) {
              createContextMenuEntry("timerActionIn_" + min, getTimerMinutesLabel(min), null, startTimer);
            });
          });
        }
      }
    });
  }

  chromeContextMenus.onClicked.addListener(function(info) {
    var cmd = info.menuItemId;

    if (cmd.indexOf("timerAction_") === 0) {
      localSettings.timerAction = cmd.substr(12);
    } else if (cmd.indexOf("timerActionIn_") === 0) {
      var min = parseInt(cmd.substr(14));
      localSettings.timerMinutes = min;
      if (localSettings.timerPreNotify > min * 60) localSettings.timerPreNotify = min * 60;
      localSettings.timerEnd = $.now() / 1000 + min * 60;
      startSleepTimer();
    } else if (cmd.indexOf("fav_") === 0) {
      startPlaylist(cmd.substr(4));
    } else if (cmd.indexOf("ql_") === 0) {
      selectLink(cmd.substr(3));
    } else switch (cmd) {
      case "stopTimer":
        clearSleepTimer();
        break;
      case "toggleScrobble":
        settings.scrobble = info.checked;
        break;
      case "resumeLastSong":
      case "gotoGmusic":
        executeConnectAction(cmd);
        break;
      default:
        executeCommand(cmd, "icon");
    }
  });

  localSettings.w("lastfmSessionKey favorites timerEnd", refreshContextMenu);
  localSettings.al("lyrics", function() {
    if (player.connected) refreshContextMenu();
  });
  settings.al("saveLastPosition", function() {
    if (!player.connected && !connecting) refreshContextMenu();
  });
  settings.al("hideFavorites", refreshContextMenu);
  settings.al("scrobble", function(val) { chromeContextMenus.update("toggleScrobble", { checked: val }); });
  //} context menu

  //{ idle/locked handling
  function onIdleStateChangedHandler(state) {
    console.debug("onIdleStateChangedHandler", state, player.playing);
    if (player.playing && (state == "locked" && settings.pauseOnLock || state == "idle" && settings.pauseOnIdleSec > 0)) {
      executePlayPause(false);
      chromeLocalStorage.set({ resumeOnActive: true });
    } else if (state == "active") {
      chromeLocalStorage.get("resumeOnActive", function(items) {
        if (items.resumeOnActive) {
          executePlayPause(true);
          chromeLocalStorage.remove("resumeOnActive");
        }
      });
    }
  }

  function pauseOnIdleStateHandler() {
    chromeIdle.onStateChanged.removeListener(onIdleStateChangedHandler);
    var pauseOnIdle = settings.pauseOnIdleSec > 0;
    if (settings.pauseOnLock || pauseOnIdle) {
      if (pauseOnIdle) chromeIdle.setDetectionInterval(settings.pauseOnIdleSec);
      chromeIdle.onStateChanged.addListener(onIdleStateChangedHandler);
    }
  }

  settings.w("pauseOnLock pauseOnIdleSec", pauseOnIdleStateHandler);
  //} idle/locked handling

  //{ register general listeners
  settings.w("iconClickAction0 iconClickConnectAction", iconClickSettingsChanged);
  settings.w("miniplayerType", function() {
    if (miniplayer) openMiniplayer();//reopen
  });
  settings.al("layout", function() {
    if (miniplayer) {
      var sizing = localSettings.miniplayerSizing[settings.layout];
      chromeWindows.update(miniplayer.id, {
          height: sizing.height,
          width: sizing.width
        }
      );
    }
  });
  settings.al("hideRatings", function(val) {
    if (!val && song.loved === null) loadCurrentLastfmInfo();
  });
  settings.al("showLastfmInfo", function(val) {
    if (val && song.lastfmInfo === null) loadCurrentLastfmInfo();
  });
  settings.al("toastUseMpStyle", closeToast);
  settings.al("toastClick toastProgress", updateToast);
  settings.w("toastButton1", commandOptionListener.bind(window, updateToast));
  //we need a copy of the updateToast function here to avoid that changes on toastButton1 remove needed listeners for toastButton2
  settings.w("toastButton2", commandOptionListener.bind(window, function() { updateToast(); }));
  settings.al("scrobble scrobbleMaxDuration scrobblePercent scrobbleTime disableScrobbleOnFf", calcScrobbleTime);
  //we need a copy of the updateBrowserActionInfo function here to avoid conflicts with showPlayingIndicator/showProgress listener
  settings.w("iconClickAction0", commandOptionListener.bind(window, function() { updateBrowserActionInfo(); }));
  settings.al("iconStyle iconClickConnectAction showProgressColor showProgressColorPaused", updateBrowserActionInfo);
  settings.al("connectedIndicator", function(val) {
    postToGooglemusic({ type: "connectedIndicator", show: val });
  });
  settings.w("mpAutoOpen", function(val) {
    player.wrl("playing", openMpOnPlaying, val);
  });
  settings.w("mpAutoClose", function(val) {
    player.arl("connected", closeMpOnDisconnect, val);
  });
  settings.al("lyricsInGpm lyricsAutoReload", postLyricsState);
  settings.w("showPlayingIndicator showProgress", function() {
    player.arl("playing", updateBrowserActionInfo, settings.showPlayingIndicator || settings.showProgress);
    updateBrowserActionInfo();
  });
  settings.w("showScrobbledIndicator", function(val) {
    song.arl("scrobbled", updateBrowserActionInfo, val);
    updateBrowserActionInfo();
  });
  settings.w("showLovedIndicator", function(val) {
    song.arl("loved", updateBrowserActionInfo, val);
    updateBrowserActionInfo();
  });
  settings.w("showRatingIndicator", function(val) {
    song.arl("rating", updateBrowserActionInfo, val);
    updateBrowserActionInfo();
  });

  function saveLastSongInfo(info) {
    if (settings.saveLastPosition && googlemusicport) {//if info is null but we are still connected (playlist finished), clear the lastSong storage
      chromeLocalStorage.set({ lastSong: info, lastPosition: song.position, rating: song.rating });
      lastSongInfo = info;
    }
  }
  function saveLastSongParam(param, value) {
    if (googlemusicport && song.info) {
      var items = {};
      items[param] = value;
      chromeLocalStorage.set(items);
    }
  }
  var saveLastSongPosition = saveLastSongParam.bind(window, "lastPosition");
  var saveLastSongRating = saveLastSongParam.bind(window, "rating");
  var saveLastSongScrobbled = saveLastSongParam.bind(window, "scrobbled");
  var saveLastSongScrobbleTime = saveLastSongParam.bind(window, "scrobbleTime");
  var saveLastSongFf = saveLastSongParam.bind(window, "ff");
  var saveLastSongTimestamp = saveLastSongParam.bind(window, "timestamp");
  function lastSongInfoChanged() {
    if (!player.connected) {
      if (settings.iconClickConnectAction == "resumeLastSong") {
        updateBrowserActionInfo();
        iconClickSettingsChanged();
      }
      chromeContextMenus.update("resumeLastSong", { enabled: isCommandAvailable("resumeLastSong"), title: getCommandText("resumeLastSong") }, ignoreLastError);
    }
  }
  settings.w("saveLastPosition", function(val) {
    saveLastSongInfo(song.info);
    song.arl("position", saveLastSongPosition, val);
    song.arl("rating", saveLastSongRating, val);
    song.wrl("scrobbled", saveLastSongScrobbled, val);
    song.wrl("scrobbleTime", saveLastSongScrobbleTime, val);
    song.wrl("ff", saveLastSongFf, val);
    song.wrl("timestamp", saveLastSongTimestamp, val);
    if (val) getLastSong(function(lastSong) {
      lastSongInfo = lastSong.info;
      lastSongInfoChanged();
    }); else lastSongInfoChanged();
  });

  localSettings.w("syncSettings", function(val) {
    settings.setSyncStorage(val, function() {
      if (optionsTabId) chromeTabs.reload(optionsTabId);
    });
  });
  localSettings.al("lastfmSessionName", calcScrobbleTime);
  localSettings.al("lyrics lyricsFontSize lyricsWidth", postLyricsState);
  localSettings.w("notificationsEnabled", function(val, old) {
    if (val) initNotifications();
    else if (old) GA.event(GA_CAT_OPTIONS, "notifications-disabled");
  });

  player.al("connected", function(val) {
    if (val) {
      loadNavlistIfConnected();
      startPlaylistIfConnected();
      executeFeelingLuckyIfConnected();
      resumeLastSongIfConnected();
      if (settings.connectedIndicator) postToGooglemusic({ type: "connectedIndicator", show: true });
      if (localSettings.lyrics && settings.lyricsInGpm) postLyricsState();
      localSettings.timerEnd = 0;
    } else {
      clearSleepTimer();
    }
  });
  //} register general listeners

  //{ position/info handler
  /** for correct calculation of song.ff and keeping the timestamp on resume */
  var lastSongPositionSec;
  var lastSongTimestamp = null;
  song.al("position", function(position) {
    var oldPos = lastSongPositionSec || song.positionSec;
    var newPos = song.positionSec = parseSeconds(position);

    if (song.info) {
      //check for fast forward
      if (lastSongPositionSec && (newPos >= lastSongPositionSec || newPos > 5)) lastSongPositionSec = null;
      if (!positionFromBackup && !song.ff && newPos > oldPos + 5) {
        song.ff = true;
        if (settings.disableScrobbleOnFf && !song.scrobbled) song.scrobbleTime = -1;
      } else if (song.ff && newPos <= 5 && !lastSongPositionSec) {//prev pressed or gone back
        song.ff = false;
        if (settings.disableScrobbleOnFf) calcScrobbleTime();
      }
      positionFromBackup = false;

      if (newPos == 2) {//new/resumed song, repeat single or rewinded -> reset some properties
        if (settings.skipRatedLower && song.rating > 0 && song.rating <= settings.skipRatedLower) skipSong();
        song.timestamp = null;
        song.nowPlayingSent = false;
        if (settings.scrobbleRepeated) {
          song.scrobbled = false;
          calcScrobbleTime();
        }
      } else if (newPos >= 3) {//information (song info, rating, position, ...) should be in sync from here
        if (localSettings.skipSongSeconds && newPos >= localSettings.skipSongSeconds) skipSong();

        if (isScrobblingEnabled()) {
          if (!song.timestamp) {//keep timestamp once it's set (here or from backup)
            song.timestamp = lastSongTimestamp || Math.round($.now() / 1000) - newPos;
            lastSongTimestamp = null;
          }

          if (!song.nowPlayingSent) {
            song.nowPlayingSent = true;
            sendNowPlaying();
          }

          if (!song.scrobbled && song.scrobbleTime >= 0 && newPos >= song.scrobbleTime) {
            song.scrobbled = true;
            scrobble();
          }
        }

        if (settings.toastProgress && toastOptions) {
          var progress = Math.floor(newPos * 100 / song.info.durationSec);
          if (progress > toastOptions.progress) {//avoid update on noop
            toastOptions.progress = progress;
            updateNotification(TOAST, toastOptions);
          }
        }

        if (drawProgress()) updateBrowserIcon();
      }
    }
  });

  song.al("info", function(info, old) {
    if (lastSongToResume && songsEqual(lastSongToResume.info, info)) {
      song.scrobbled = lastSongToResume.scrobbled;
      song.ff = lastSongToResume.ff;
      lastSongTimestamp = lastSongToResume.timestamp;
      lastSongPositionSec = lastSongToResume.positionSec;
      if (song.scrobbled) song.scrobbleTime = lastSongToResume.scrobbleTime;
    } else {
      song.scrobbled = false;
    }
    lastSongToResume = null;
    song.nowPlayingSent = false;
    positionFromBackup = false;
    song.lastfmInfo = null;
    song.loved = null;
    song.timestamp = null;

    function doToast() {
      if (!settings.toastNotIfGmActive) openToast();
      else chromeTabs.get(googlemusictabId, function(tab) {
        if (tab.active) chromeWindows.get(tab.windowId, function(win) { if (!win.focused) openToast(); });
        else openToast();
      });
    }

    if (info) {
      info.durationSec = parseSeconds(info.duration);
      if (settings.toast && (!miniplayer && !(settings.mpAutoOpen && !player.playing) || settings.toastIfMpOpen)) {
        if (miniplayer && settings.toastIfMpMinimized) {
          chromeWindows.get(miniplayer.id, function(win) {
            if (win.state == "minimized") doToast();
          });
        } else doToast();
      }
      if (!settings.hideRatings || settings.showLastfmInfo) loadCurrentLastfmInfo();
    } else closeToast();

    saveLastSongInfo(info);

    updateBrowserActionInfo();
    calcScrobbleTime();
    if (!old != !info) {//jshint ignore:line
      // (only update if exactly one of them is null)
      updateContextMenuConnectedItem(["prevSong", "nextSong", "ff", "openLyrics", "rate-1", "rate-2", "rate-3", "rate-4", "rate-5"]);
    }
  });
  //} position/info handler

  //{ command handling
  /** @return the label for the given command to be used in a toast button or as browser icon tooltip */
  function getCommandText(cmd) {
    var key;
    switch (cmd) {
    case "playPause":
      key = player.playing ? "pauseSong" : "resumeSong";
      break;
    case "resumeLastSong":
      if (lastSongInfo && settings.saveLastPosition) return i18n("resumeLastSongWithTitle", lastSongInfo.artist + " - " + lastSongInfo.title);
      /* falls through */
    case "prevSong":
    case "nextSong":
    case "openMiniplayer":
    case "feelingLucky":
    case "gotoGmusic":
      key = cmd;
      break;
    case "rate-1":
      if (isStarRatingMode()) key = "command_star1";
      else if (isThumbsRatingMode()) key = "command_thumbsDown";
      else key = "command_rate1";
      break;
    case "rate-5":
      if (isStarRatingMode()) key = "command_star5";
      else if (isThumbsRatingMode()) key = "command_thumbsUp";
      else key = "command_rate5";
      break;
    case "loveUnloveSong":
      key = song.loved ? "lastfmUnlove" : "lastfmLove";
      break;
    default:
      key = "command_" + cmd.replace(/-/g, "");
    }
    return i18n(key);
  }

  /** @return the icon URL (without .png extension and extension prefix path) for the given command to be used in a toast button or the browser icon */
  function getCommandIconUrl(cmd) {
    var icon = cmd;
    switch (cmd) {
    case "playPause":
      icon = player.playing ? "pause" : "play";
      break;
    case "rate-1":
      if (isThumbsRatingMode()) icon = "thumbsDown";
      break;
    case "rate-5":
      if (isThumbsRatingMode()) icon = "thumbsUp";
      break;
    case "loveUnloveSong":
      icon = song.loved ? "unloveSong" : "loveSong";
      break;
    }
    return "img/cmd/" + icon;
  }

  /**
   * Listener that handles updates on a command option such as toastButton1 or iconClickAction0.
   * If some of that options change, the UI (browser icon or toast button) needs to be updated
   * and listeners for player.playing or song.loved might need to be (un-)registered.
   * @param updateFn function to update the UI when the icon or text changed
   * @param cmd the command the option is set to
   */
  function commandOptionListener(updateFn, cmd) {
    player.arl("playing", updateFn, cmd == "playPause");
    song.arl("loved", updateFn, cmd == "loveUnloveSong");
    updateFn();
  }

  function getAvailableIconClickConnectAction() {
    var action = settings.iconClickConnectAction;
    return action != "resumeLastSong" || settings.saveLastPosition && lastSongInfo ? action : "";
  }

  function executeConnectAction(action) {
    switch (action) {
    case "resumeLastSong":
      getLastSong(resumeLastSong);
      break;
    case "gotoGmusic":
      openGoogleMusicTab();
      break;
    default:
      executeCommand(action, "connect");
    }
  }
  chromeRuntime.onStartup.addListener(executeConnectAction.bind(window, settings.startupAction));

  function executeIconClickConnectAction() {
    executeConnectAction(settings.iconClickConnectAction);
  }

  function isCommandAvailable(cmd) {
    if (!cmd) return false;
    switch (cmd) {
    case "playPause":
      return player.playing !== null;
    case "resumeLastSong":
      return settings.saveLastPosition && !!lastSongInfo;
    case "prevSong":
    case "nextSong":
    case "ff":
      return !!song.info;
    case "volumeUp":
      return !!player.volume && player.volume != "100";
    case "volumeDown":
      return !!player.volume && player.volume != "0";
    case "volumeMute":
      return !!player.volume;
    case "toggleRepeat":
      return !!player.repeat;
    case "toggleShuffle":
      return !!player.shuffle;
    case "loveUnloveSong":
      return !!song.info && !!localSettings.lastfmSessionKey;
    case "openLyrics":
      return localSettings.lyrics && !!song.info;
    default:
      if (cmd.indexOf("rate-") === 0) {
        var rating = parseInt(cmd.substr(5, 1));
        return !!song.info && (isStarRatingMode() || rating == 1 || rating == 5);
      }
    }
    return true;
  }

  function updateIconClickActionListeners(cmd) {
    //player.playing is already watched if cmd=="playPause"
    //song.info listener always triggers updateBrowserActionInfo

    function updateListener(add, bean, prop) {
      bean.arl(prop, updateBrowserActionInfo, add && settings.iconShowAction);
    }

    updateListener(cmd.indexOf("volume") === 0, player, "volume");
    updateListener(cmd == "toggleRepeat", player, "repeat");
    updateListener(cmd == "toggleShuffle", player, "shuffle");
    updateListener(cmd == "loveUnloveSong", localSettings, "lastfmSessionKey");
    updateListener(cmd == "openLyrics", localSettings, "lyrics");
  }

  settings.w("iconClickAction0", updateIconClickActionListeners);
  settings.al("iconShowAction", function() {
    updateIconClickActionListeners(settings.iconClickAction0);
    updateBrowserActionInfo();
  });

  player.al("playing", updateContextMenuConnectedItem.bind(window, ["playPause"]));
  player.al("volume", updateContextMenuConnectedItem.bind(window, ["volumeUp", "volumeDown", "volumeMute"]));
  player.al("repeat", updateContextMenuConnectedItem.bind(window, ["toggleRepeat"]));
  player.al("shuffle", updateContextMenuConnectedItem.bind(window, ["toggleShuffle"]));
  song.al("loved", updateContextMenuConnectedItem.bind(window, ["loveUnloveSong"]));

  /** Execute a command (might come from commands API, toast or browser icon action) */
  function executeCommand(command, src) {
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
      if (song.info) openToast();
      break;
    case "loveUnloveSong":
      if (song.loved === true) unloveTrack();
      else loveTrack(true);
      break;
    case "volumeUp":
      if (player.volume !== null && player.volume != "100") setVolume(Math.min(100, parseInt(player.volume) + 10) / 100);
      break;
    case "volumeDown":
      if (player.volume !== null && player.volume != "0") setVolume(Math.max(0, parseInt(player.volume) - 10) / 100);
      break;
    case "volumeMute":
      if (player.volume !== null) {
        if (volumeBeforeMute && player.volume == "0") {
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
      if (command.indexOf("rate-") === 0 && song.info) {
        var rating = parseInt(command.substr(5, 1));
        if (!settings.preventCommandRatingReset || !isRatingReset(song.rating, rating) || src == "icon" && settings.showRatingIndicator || src == "toast" && settings.toastRating) rate(rating);
      }
    }
  }

  chrome.commands.onCommand.addListener(executeCommand);
  //} command handling

  //{ omnibox handling
  function xmlEscape(text) {
    return text && text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  var linkPrefix = " - link:";
  var omniboxSuggest, omniboxSearch, omniboxTimer;
  function setDefaultSuggestion(msgKey, search) {
    chromeOmnibox.setDefaultSuggestion({ description: i18n(msgKey, search && "<match>" + search + "</match>") });
  }

  chromeOmnibox.onInputChanged.addListener(function(text, suggest) {
    omniboxSuggest = omniboxSearch = null;
    clearTimeout(omniboxTimer);
    if (!text.indexOf("f ")) {
      var search = text.substr(2).trim();
      if (search) {
        var suggestions = [];
        var searchRegex = new RegExp(xmlEscape(search), "gi");
        localSettings.favorites.forEach(function(fav) {
          var title = xmlEscape(fav.title);
          if (searchRegex.test(title)) suggestions.push({ content: i18n("ob_startsugg", title) + linkPrefix + fav.link, description: title.replace(searchRegex, "<match>$&</match>") });
        });
        setDefaultSuggestion(suggestions.length ? "ob_foundfavorites" : "ob_nofavorites", xmlEscape(search));
        suggest(suggestions);
      } else setDefaultSuggestion("ob_favoritessugg");
    } else if (text.trim().length > 1) {
      setDefaultSuggestion("ob_loading", xmlEscape(text));
      omniboxSearch = text.trim();
      omniboxTimer = setTimeout(function() {
        omniboxSuggest = suggest;
        loadNavigationList(getSearchLink(omniboxSearch));
      }, 500);
    } else setDefaultSuggestion("ob_defaultsugg");
  });

  chromeOmnibox.onInputEntered.addListener(function(text) {
    omniboxSuggest = null;
    clearTimeout(omniboxTimer);
    var index = text.lastIndexOf(linkPrefix);
    if (index >= 0) startPlaylist(text.substr(index + linkPrefix.length), true);
    else if (omniboxSearch) selectLink(getSearchLink(omniboxSearch), true);
    omniboxSearch = null;
  });

  player.al("navigationList", function(navlist) {
    if (!navlist || !omniboxSuggest || navlist.link != getSearchLink(omniboxSearch)) return;
    player.navigationList = null;//free memory
    var search = xmlEscape(omniboxSearch);
    var suggestions = [];
    if (!navlist.error && !navlist.empty) {
      var searchRegex = new RegExp(search, "gi");
      var countEnd = 0;
      for (var listIndex = 0; countEnd < navlist.lists.length; listIndex++) {
        countEnd = 0;
        for (var navlistIndex = 0; navlistIndex < navlist.lists.length; navlistIndex++) {
          var list = navlist.lists[navlistIndex];
          var entry = list.list[listIndex];
          if (!entry || !(list.type == "albumContainers" || list.type == "playlistsList")) {
            countEnd++;
            continue;
          }
          var title = xmlEscape(entry.title);
          var description = title;
          if (entry.subTitle) {
            var suffix = " (" + xmlEscape(entry.subTitle) + ")";
            title += suffix;
            description += "<dim>" + suffix + "</dim>";
          }
          description = description.replace(searchRegex, "<match>$&</match>") + "<dim> - " + xmlEscape(list.header) + "</dim>";
          suggestions.push({ content: i18n("ob_startsugg", title) + linkPrefix + (list.type == "playlistsList" ? entry.titleLink : entry.link), description: description });
        }
      }
    }
    setDefaultSuggestion(suggestions.length ? "ob_results" : "ob_noresults", search);
    omniboxSuggest(suggestions);
  });
  //} omnibox handling

  getLastSong(function(lastSong) {
    lastSongInfo = lastSong.info;
    lastSongInfoChanged();
  });

  connectGoogleMusicTabs();

  if (isScrobblingEnabled()) scrobbleCachedSongs();

  //{ exports
  //{ beans
  exports.localSettings = localSettings;
  exports.settings = settings;
  exports.song = song;
  exports.player = player;
  //}

  //{ utility functions
  /** @return time string for amount of seconds (e.g. 263 -> 4:23) */
  exports.toTimeString = function(sec) {
    if (sec > 60 * 60 * 24) return chrome.i18n.getMessage("moreThanOneDay");
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
  };

  /** @return value of a named parameter in an URL query string, null if not contained or no value */
  exports.extractUrlParam = function(name, queryString) {
    var matched = RegExp(name + "=(.*?)(&|$|#.*)").exec(queryString);
    if (matched === null || matched.length < 2) return null;
    return matched[1];
  };

  exports.parseSeconds = parseSeconds;
  exports.songsEqual = songsEqual;
  exports.isNewerVersion = isNewerVersion;
  exports.getQuicklinks = getQuicklinks;
  exports.isRatingReset = isRatingReset;
  exports.getLastSong = getLastSong;
  exports.getTextForQuicklink = getTextForQuicklink;
  exports.openMiniplayer = openMiniplayer;
  exports.openOptions = openOptions;
  exports.openGoogleMusicTab = openGoogleMusicTab;
  exports.getSearchLink = getSearchLink;

  exports.getCommandOptionText = function(cmd) {
    switch (cmd) {
    case "playPause":
    case "resumeLastSong":
      return i18n(cmd);
    case "loveUnloveSong":
      return i18n("command_loveUnloveSong");
    default:
      return getCommandText(cmd);
    }
  };
  //} utility functions

  //{ lastfm functions
  exports.lastfm = lastfm;
  exports.isScrobblingEnabled = isScrobblingEnabled;
  exports.lastfmLogin = lastfmLogin;
  exports.lastfmLogout = lastfmLogout;
  exports.getLastfmInfo = getLastfmInfo;
  exports.love = love;
  exports.unlove = unlove;
  exports.loveTrack = loveTrack;
  exports.unloveTrack = unloveTrack;
  exports.loadCurrentLastfmInfo = loadCurrentLastfmInfo;

  /** Remember the session information after successful authentication. */
  exports.setLastfmSession = function(session) {
    localSettings.lastfmSessionKey = session.key;
    localSettings.lastfmSessionName = session.name;
    lastfm.session = session;
    GA.event(GA_CAT_LASTFM, "AuthorizeOK");
    loadCurrentLastfmInfo();
    scrobbleCachedSongs();
  };
  //} lastfm functions

  //{ content script post functions
  exports.executeInGoogleMusic = executeInGoogleMusic;
  exports.setVolume = setVolume;
  exports.setSongPosition = setSongPosition;
  exports.rate = rate;
  exports.loadNavigationList = loadNavigationList;
  exports.selectLink = selectLink;
  exports.startPlaylist = startPlaylist;
  exports.executeFeelingLucky = executeFeelingLucky;
  exports.resumeLastSong = resumeLastSong;
  exports.executePlayPause = executePlayPause;
  //} content script post functions

  //{ lyrics
  exports.lyricsProviders = lyricsProviders;
  exports.openLyrics = openLyrics;
  exports.fetchLyricsFrom = fetchLyricsFrom;
  exports.fetchLyrics = fetchLyrics;
  //} lyrics

  //{ update handling
  /** called by update notifier page when it is first opened after an update */
  exports.updateNotifierDone = updateNotifierDone;
  /** called by options page when it is first opened after an update */
  exports.updateInfosViewed = function() {
    previousVersion = null;
    localStorage.removeItem("previousVersion");
    updateNotifierDone();
  };
  //} update handling

  //{ timer handling
  exports.startSleepTimer = startSleepTimer;
  exports.clearSleepTimer = clearSleepTimer;
  //}
  //} exports
})(this);
