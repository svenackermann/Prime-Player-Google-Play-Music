/**
 * This script does all the magic for the miniplayer, popup and toasts.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */

chrome.runtime.getBackgroundPage(function(bp) {

  /** "popup", "miniplayer" or "toast" */
  var typeClass = bp.extractUrlParam("type", location.search) || "popup";

  /** the size of the player to restore after closing playlist/lyrics/... */
  var savedSizing;

  /** history to allow for back navigation */
  var navHistory = [];

  /** information about the currently displayed navigation list */
  var currentNavList = {};

  /** cached HTML snippet for rating in playlists, depending on the rating mode */
  var ratingHtml;

  /** function to get the last.fm info for the saved last song, if any */
  var getLastSongInfo;

  /** the cached last.fm info for the saved last song, if any or false if not loaded yet */
  var lastSongInfo = false;

  /** shortcuts, for minimisation */
  var i18n = chrome.i18n.getMessage;
  var localSettings = bp.localSettings;
  var settings = bp.settings;
  var player = bp.player;
  var song = bp.song;
  
  if (typeClass == "popup") {
    bp.popupOpened();// tell bp that we're open (needed for icon click action handling)
    $("html").addClass("layout-normal");//popup has fixed layout
  } else {
    settings.w("layout", function(val, old) {
      $("html").removeClass("layout-" + old).addClass("layout-" + val);
    }, typeClass);
  }

  function hideRatingsWatcher(val) {
    $("html").toggleClass("hideRatings", val);
    if (!val && lastSongInfo === false && getLastSongInfo) getLastSongInfo();
  }
  settings.w("hideRatings", hideRatingsWatcher, typeClass);

  function faviconWatcher(val) {
    $("#favicon").attr("href", val);
  }
  player.w("favicon", faviconWatcher, typeClass);

  function repeatWatcher(val) {
    $("#repeat").attr("class", val);
  }

  function getVisiblePlaylists() {
    return $("#navlistContainer").find(".playlist:visible");
  }
  
  function shuffleWatcher(val) {
    $("#shuffle").attr("class", val);
    //reload queue on shuffle if visible
    if (val == "ALL_SHUFFLE" &&
      currentNavList.controlLink == "#/ap/queue" &&
      getVisiblePlaylists().length) {
      currentNavList.link = "ap/queue";//avoid history entry
      switchView(currentNavList.title, currentNavList.link);
    }
  }

  function playingWatcher(val) {
    $("#resume").toggleClass("enabled", val !== null);
    $("body").toggleClass("playing", val === true);
  }

  function renderSongInfo(info) {
    $("#songTime").text(info.duration);
    $("#track").text(info.title);
    $("#artist").text(info.artist).attr("title", info.artist).data("link", info.artistLink).toggleClass("nav", info.artistLink !== undefined);
    $("#album").text(info.album).attr("title", info.album).data("link", info.albumLink).toggleClass("nav", info.albumLink !== null);
    $("#cover").attr("src", info.cover || "img/cover.png");
    $("#showlyrics")
      .attr("title", i18n("lyricsFor", info.title))
      .addClass("nav")
      .data("options", {artist: info.artist, title: info.title});
  }
  
  function clusterFilter(cluster) {
    return function() {
      return $(this).data("cluster") === cluster;
    };
  }
  
  function addPlaylistSongTimebars(playlists) {
    var timebar = $("<div class='timebar'><div></div></div>");
    var duration = song.info ? song.info.durationSec : 0;
    renderPlaylistPosition(timebar, duration ? song.positionSec / duration * 100 : 0);
    timebar.appendTo(playlists.find(".current"));
  }
  
  function songInfoWatcher(val) {
    if ($("body").hasClass("hasLastSong")) {
      $("body").removeClass("hasLastSong");
      renderRating(song.rating);
      getLastSongInfo = null;
      lastSongInfo = false;
      $("#resume").removeClass("lastSongEnabled").unbind().click(googleMusicExecutor("playPause"));
    }
    $("body").toggleClass("hasSong", !!val);
    if (val) {
      renderSongInfo(val);
      //although the value of scrobbleTime might not have changed, the relative position might have (e.g. if the new song's duration is different and both songs reached settings.scrobbleTime)
      updateScrobblePosition(song.scrobbleTime);
      if (settings.lyricsAutoReload && $("#lyrics").is(":visible")) {
        var title = val.title;
        if (val.artist) title = val.artist + " - " + title;
        switchView(i18n("lyricsTitle", title), "lyrics", null, {artist: val.artist, title: val.title});
      }
    } else {
      $("#cover").attr("src", "img/cover.png");
      $("#showlyrics").removeAttr("title").removeClass("nav").removeData("options");
    }
    
    function markCurrent(songRow) {
      var curSong = songRow.data("song");
      if (bp.songsEqual(curSong, val)) {
        songRow.addClass("current");
        curSong.current = true;
        return true;
      }
      return false;
    }
    
    function tryListMatch(listData) {
      var expectedDiv = playlists.filter(clusterFilter(listData.cluster)).children("div[data-index='" + listData.index + "']");
      return expectedDiv[0] && markCurrent(expectedDiv);
    }
    
    var playlists = getVisiblePlaylists();
    if (playlists.length) {
      var currentData;
      //clear currents
      playlists.children(".current").each(function() {
        var current = $(this);
        current.data("song").current = false;
        current.children(".timebar").remove();
        current.removeClass("current");
        currentData = { cluster: getClusterIndex(current), index: current.data("index") };
      });
      if (val) {
        //mark new currents
        var matched = false;
        if (val.playlist == currentNavList.link) {
          matched = tryListMatch(val);
        }
        if (!matched && currentData) {
          currentData.index++;//try next song
          matched = tryListMatch(currentData);
          if (!matched) {
            currentData.index -= 2;//try previous song
            matched = tryListMatch(currentData);
          }
        }
        if (!matched) {//we're not on the playlist page in GM and next/prev song did not match, so search through all of them, possibly marking multiple songs as current
          playlists.children("div").each(function() {
            if (markCurrent($(this))) matched = true;
          });
        }
        if (matched) addPlaylistSongTimebars(playlists);
      }
    }
  }

  function renderPlaylistPosition(timebar, percent) {
    timebar.children("div").css({ width: percent + "%" });
  }

  function renderPosition(positionSec, durationSec, position) {
    $("#currentTime").text(position);
    var percent = durationSec ? positionSec / durationSec * 100 : 0;
    $("#timeBar").css({ width: percent + "%" });
    renderPlaylistPosition($(".playlist:visible>.current>.timebar"), percent);
  }
  
  function positionSecWatcher(positionSec) {
    renderPosition(positionSec, song.info && song.info.durationSec || 0, song.position);
  }

  function renderRating(rating) {
    $("#googleRating").removeClass().addClass("rating-" + rating);
  }
  
  function renderLastSong(lastSong) {
    $("body").addClass("hasLastSong");
    renderSongInfo(lastSong.info);
    renderPosition(lastSong.positionSec, lastSong.info.durationSec, lastSong.position);
    renderRating(lastSong.rating);
    
    function updateSongInfo(updateFn) {
      renderLastSongInfo(null);
      updateFn(lastSong.info, renderLastSongInfo);
    }
    getLastSongInfo = updateSongInfo.bind(window, bp.getLastfmInfo);
    var unloveLast = updateSongInfo.bind(window, bp.unlove);
    var loveLast = updateSongInfo.bind(window, bp.love);
    function renderLastSongInfo(loved, lastfmInfo) {
      renderSongLoved(loved, {getLastfmInfo: getLastSongInfo, unlove: unloveLast, love: loveLast});
      if (lastfmInfo !== undefined) {//not for love/unlove
        lastSongInfo = lastfmInfo;
        renderLastfmInfo(lastfmInfo);
      }
    }
    if (settings.showLastfmInfo || (!settings.hideRatings && localSettings.lastfmSessionName)) getLastSongInfo();
    
    if (lastSong.info.albumLink) {
      $("#resume").addClass("lastSongEnabled").unbind().click(bp.resumeLastSong.bind(window, lastSong));
    }
  }
  
  function ratingModeWatcher(val) {
    var body = $("body");
    body.removeClass("star-rating thumbs-rating");
    if (val) body.addClass(val + "-rating");
    ratingHtml = "";
    if (val == "star") {
      ratingHtml = "<div></div>";
      for (var i = 1; i <= 5; i++) ratingHtml += "<a tabindex='0' data-rating='" + i + "'></a>";
    } else if (val == "thumbs") {
      ratingHtml = "<a tabindex='0' data-rating='5'></a><a tabindex='0' data-rating='1'></a>";
    }
  }

  function getClusterIndex(el) {
    return parseInt(el.closest(".playlist").data("cluster")) || 0;
  }
  
  function ratingWatcher(val) {
    if (!$("body").hasClass("hasLastSong")) renderRating(val);
  }

  function updateScrobblePosition(scrobbleTime) {
    var sp = $("#scrobblePosition");
    if (scrobbleTime >= 0 && song.info && song.info.durationSec > 0) {
      sp.addClass("songscrobble").css({left: (scrobbleTime / song.info.durationSec * 100) + "%"});
    } else sp.removeClass("songscrobble");
  }

  function scrobbledWatcher(val) {
    $("body").toggleClass("scrobbled", val);
  }

  function scrobbleWatcher(val) {
    $("body").toggleClass("scrobbleEnabled", val);
  }
  
  function showLastfmInfoWatcher(val) {
    $("#lastfmInfo").toggle(val);
    if (val && lastSongInfo === false && getLastSongInfo) getLastSongInfo();
  }

  function colorWatcher(val, old) {
    $("html").removeClass("color-" + old).addClass("color-" + val);
  }

  function mpBgColorWatcher(val) {
    $("#player").css("background-color", val);
  }

  function mpTextColorWatcher(val) {
    $("#player").css("color", val);
  }
  
  function hideSearchfieldWatcher(val) {
    $("#nav").toggleClass("searchField", !val);
  }

  function updateClickLink(target, link) {
    target = $(target);
    target.toggleClass("nav", !!link);
    if (link) {
      var text = bp.getTextForQuicklink(link);
      target.data({link: link, text: text}).attr("title", i18n("openLink", text));
    } else {
      target.removeData("link text").removeAttr("title");
    }
  }

  var updateCoverClickLink = updateClickLink.bind(window, "#coverContainer");
  
  var updateTitleClickLink = updateClickLink.bind(window, "#track, #nosong a:first-child");

  /** listen for resize events and poll for position changes to update the settings */
  function setupResizeMoveListeners() {
    var timerId;
    $(window).resize(function() {
      clearTimeout(timerId);
      timerId = setTimeout(function() {
        if (document.webkitHidden) return;//do not save size of minimized window
        var sizingSetting;
        var sizing;
        if ($("#player").is(":visible")) {
          sizing = localSettings.miniplayerSizing;
          sizing[settings.layout].width = window.outerWidth;
          sizing[settings.layout].height = window.outerHeight;
          localSettings.miniplayerSizing = sizing;//trigger listener notification
        } else if ($("#nav").is(":visible")) {
          var type = $("#quicklinks").is(":visible") ? "quicklinks" : $("#navlist").attr("class");
          sizingSetting = type + "Sizing";
        } else if ($("#lyrics").is(":visible")) {
          sizingSetting = "lyricsSizing";
        }
        if (sizingSetting) {
          sizing = localSettings[sizingSetting];
          if (sizing) {
            sizing.width = window.outerWidth;
            sizing.height = window.outerHeight;
            localSettings[sizingSetting] = sizing;//trigger listener notification
          }
        }
      }, 500);
    });

    var oldX = window.screenX;
    var oldY = window.screenY;
    setInterval(function() {
      if ($("#player").is(":visible") && (oldX != window.screenX || oldY != window.screenY) && !document.webkitHidden) {
        oldX = window.screenX;
        oldY = window.screenY;
        var sizing = localSettings.miniplayerSizing;
        sizing[settings.layout].left = oldX;
        sizing[settings.layout].top = oldY;
        localSettings.miniplayerSizing = sizing;//trigger listener notification
      }
    }, 1000);
  }

  function setToastAutocloseTimer() {
    var windowTimer = setTimeout(function() { window.close(); }, settings.toastDuration * 1000);
    //do not close as long as the mouse is over
    $(window).mouseover(function() { clearTimeout(windowTimer); });
    //after the mouse is out, close in 3 seconds
    $(window).mouseout(function() { windowTimer = setTimeout(function() { window.close(); }, 3000); });
  }

  function lastfmUserWatcher(user) {
    $("body").toggleClass("lastfm", user !== null);
    if (user) {
      $("#lastfmUser")
        .attr("title", i18n("lastfmUser") + user)
        .attr("href", "http://last.fm/user/" + user);
      if (!settings.hideRatings && getLastSongInfo) getLastSongInfo();
    }
  }
  
  function lyricsWatcher(val) {
    $("body").toggleClass("lyrics", val);
  }
  
  function lyricsFontSizeWatcher(val) {
    $("#lyrics").css("font-size", val + "px");
  }

  function allincWatcher(val) {
    $("#quicklinks").toggleClass("allinc", val);
  }
  
  function volumeWatcher(val) {
    if (val === null) {
      $("#volumeBarContainer").hide();
    } else {
      $("#volumeBar").css({width: val + "%"});
      $("#volume").toggleClass("muted", val == "0");
    }
  }

  function renderLastSongIfAllowed() {
    if (settings.saveLastPosition && lastSongInfo === false && (!player.connected || !song.info)) bp.getLastSong(renderLastSong);
  }
  
  function connectedWatcher(val) {
    $("body").toggleClass("connected", val);
    if (!val) restorePlayer();
    renderLastSongIfAllowed();
  }

  function saveLastPositionUpdated(val) {
    if (val) renderLastSongIfAllowed();
    else if (!song.info) songInfoWatcher(null);
  }
  
  function resize(sizing) {
    if (typeClass == "miniplayer" || typeClass == "toast") {
      window.resizeTo(sizing.width, sizing.height);
    }
  }

  var renderNavList = {
    playlistsList: function(navlist, list) {
      list.forEach(function(pl) {
        var row = $("<div></div>");
        $("<img></img>").attr("src", pl.cover || "img/cover.png").appendTo(row);
        $("<a tabindex='0' class='album nav'></a>").data("link", pl.titleLink).text(pl.title).attr("title", pl.title).appendTo(row);
        if (pl.subTitleLink) {
          $("<a tabindex='0' class='nav'></a>").data("link", pl.subTitleLink).text(pl.subTitle).attr("title", pl.subTitle).appendTo(row);
        } else if (pl.subTitle) {
          $("<span></span>").text(pl.subTitle).attr("title", pl.subTitle).appendTo(row);
        }
        navlist.append(row);
      });
    },
    playlist: function(navlist, list, update, cluster, header) {
      navlist.data("cluster", cluster);
      var noAlbum = true;
      var noRating = true;
      var duration = 0;
      if (update) {
        noAlbum = navlist.hasClass("noalbum");
        noRating = navlist.hasClass("norating");
        duration = navlist.data("duration");
      } else header.append("<span class='duration'></span>");
      var current;
      list.forEach(function(song) {
        if (navlist.children().length > song.index) return;
        var row = $("<div data-index='" + song.index + (song.current ? "' class='current'>" : "'></div>"));
        $("<img></img>").attr("src", song.cover || "img/cover.png").appendTo(row);
        $("<div class='rating r" + song.rating + "'>" + ratingHtml + "</div>").appendTo(row);
        if (song.rating >= 0) noRating = false;
        var info = $("<div class='info'></div>");
        var title;
        if (localSettings.lyrics) {
          title = $("<a tabindex='0' class='nav' data-link='lyrics'></a>").data("options", {artist: song.artist, title: song.title}).attr("title", i18n("lyricsFor", song.title));
        } else {
          title = $("<span></span>").attr("title", song.title);
        }
        title.text(song.title).appendTo(info);
        $("<span class='duration'></span>").text(song.duration).appendTo(info);
        duration += bp.parseSeconds(song.duration);
        if (song.artistLink) {
          $("<a tabindex='0' class='nav'></a>").data("link", song.artistLink).text(song.artist).attr("title", song.artist).appendTo(info);
        } else {
          $("<span></span>").text(song.artist).attr("title", song.artist).appendTo(info);
        }
        
        var currentAlbum = song.albumLink == currentNavList.link;
        var albumCol;
        if (song.albumLink && !currentAlbum) {
          albumCol = $("<a tabindex='0' class='album nav'></a>").data("link", song.albumLink);
        } else if (song.album) {
          albumCol = $("<span class='album'></span>");
        }
        if (albumCol) {
          albumCol.text(song.album).attr("title", song.album).appendTo(info);
          if (!currentAlbum) noAlbum = false;
        }
        
        row.append(info);
        
        row.data("song", song);
        navlist.append(row);
        if (song.current) current = row[0];
      });
      navlist.toggleClass("noalbum", noAlbum);
      navlist.toggleClass("norating", noRating);
      navlist.data("duration", duration);
      navlist.toggleClass("noduration", !duration);
      if (duration) header.find("span.duration").text("(" + bp.toTimeString(duration) + ")");
      if (current) {
        addPlaylistSongTimebars(navlist);
        current.scrollIntoView(true);
      }
    },
    albumContainers: function(navlist, list) {
      list.forEach(function(ac) {
        var row = $("<div></div>");
        $("<img></img>").attr("src", ac.cover || "img/cover.png").appendTo(row);
        $("<a tabindex='0' class='nav'></a>").data("link", ac.link).text(ac.title).attr("title", ac.title).appendTo(row);
        navlist.append(row);
      });
    }
  };

  function updateListrating(val) {
    if (val === null || val.controlLink != currentNavList.controlLink) return;
    var songRow = getVisiblePlaylists().filter(clusterFilter(val.cluster)).children("div[data-index='" + val.index + "']");
    if (songRow.length) {
      var aSong = songRow.data("song");
      songRow.children("div.rating").removeClass("r" + aSong.rating).addClass("r" + val.rating);
      aSong.rating = val.rating;
    }
  }

  function renderSubNavigationList(list, navlist) {
    var header = $("<h2></h2>").text(list.header);
    navlist.append(header);
    var container = $("<div></div>").addClass(list.type).appendTo(navlist);
    renderNavList[list.type](container, list.list, false, list.cluster, header);
    if (list.moreLink) $("<a tabindex='0' class='nav'></a>").data("link", list.moreLink).appendTo(header);
  }
  
  function renderNavigationList(val) {
    if (!val || val.link != currentNavList.link || val.search != currentNavList.search) return;
    player.navigationList = null;//free memory
    currentNavList.controlLink = val.controlLink;
    var navlist = $("#navlist");
    if (val.error) {
      navlist.removeClass().html("<div class='error'></div>");
    } else if (val.empty) {
      navlist.removeClass().html("<div class='empty'></div>");
    } else {
      if (!val.update) {
        navlist.empty().removeClass().addClass(val.type);
        resize(localSettings[val.type + "Sizing"]);
      }
      var header = $("#navHead").children("span");
      if (val.type == "mixed") {
        navlist.removeData("cluster");
        header.text(val.header);
        val.lists.forEach(function(list) { renderSubNavigationList(list, navlist); });
        navlist.find("h2 a.nav").data("text", val.header).data("search", val.search).text(val.moreText);
      } else {
        renderNavList[val.type](navlist, val.list, val.update, 0, header);
      }
    }
  }

  function renderLyrics(lyrics, result) {
    lyrics.removeClass("loading");
    var content = lyrics.children(".content");
    var credits = lyrics.children(".credits");
    if (result.error) {
      content.html("<div class='error'></div>");
    } else if (result.noresults) {
      content.html("<div class='empty'></div>");
    } else {
      $("#navHead").children("span").text(result.title.text().trim());
      content.html(result.lyrics.html());
      if (result.credits) credits.html(result.credits.html() + "<br/>");
    }
    if (result.src) credits.append($("<a target='_blank'></a>").attr("href", result.src).text(i18n("lyricsSrc"))).append($("<br/>"));
    if (result.searchSrc) credits.append($("<a target='_blank'></a>").attr("href", result.searchSrc).text(i18n("lyricsSearchResult")));
  }
  
  function switchView(title, link, search, options) {
    if ($("#player").is(":visible") && (typeClass == "miniplayer" || typeClass == "toast")) {
      savedSizing = {
        height: window.outerHeight,
        width: window.outerWidth,
        screenX: window.screenX - screen.availLeft,
        screenY: window.screenY
      };
    }
    $("#player").hide();
    if (currentNavList.link && currentNavList.link != link) {
      navHistory.push(currentNavList);
    }
    currentNavList = { link: link, title: title, search: search, options: options };
    updateNavHead(title);
    $("#navlist").empty().removeClass();
    var lyrics = $("#lyrics");
    lyrics.removeClass().hide().children().empty();
    if (!search) $("#navHead > input").val("");
    $("#navlistContainer").hide();
    $("#quicklinks").hide();
    if (link == "quicklinks") {
      resize(localSettings.quicklinksSizing);
      $("#quicklinks").show();
    } else if (link == "lyrics") {
      lyrics.addClass("loading");
      resize(localSettings.lyricsSizing);
      lyrics.show();
      bp.fetchLyrics(options, renderLyrics.bind(window, lyrics));
    } else {
      $("#navlist").addClass("loading");
      $("#navlistContainer").show();
      bp.loadNavigationList(link, search);
    }
    $("#nav").show();
  }

  function restorePlayer() {
    $("#nav").hide();
    $("#navlist").empty();
    if (savedSizing) {
      resize(savedSizing);
      var screenX = savedSizing.screenX;
      var screenY = savedSizing.screenY;
      setTimeout(function() { window.moveTo(screenX, screenY); }, 200);//on some machines moveTo is faster than resizeTo and then the move does not happen
      savedSizing = null;
    }
    navHistory = [];
    currentNavList = {};
    $("#player").show();
  }

  function updateNavHead(title) {
    var backHint = navHistory.length > 0 ? i18n("backToLink", navHistory[navHistory.length - 1].title) : i18n("backToPlayer");
    $("#navHead").children(".back").attr("title", backHint).end().children("span").text(title);
  }
  
  function setupNavigationEvents() {
    $("#navHead").find(".back").click(function() {
      if (navHistory.length) {
        var current = navHistory.pop();
        currentNavList = {};
        if (current.search) $("#navHead > input").val(current.search);
        switchView(current.title, current.link, current.search, current.options);
      } else restorePlayer();
    });
    $("#navHead").find(".close").attr("title", i18n("close")).click(restorePlayer);
    
    var searchInputTimer;
    $("#navHead > input").keyup(function() {
      clearTimeout(searchInputTimer);
      searchInputTimer = setTimeout(function() {
        var text = $.trim($("#navHead > input").val());
        if (text.length > 1) switchView(i18n("searchResults"), "search", text);
      }, 500);
    });

    function ctrlHandler(urlField, e) {
      if (e.ctrlKey) {
        e.stopImmediatePropagation();
        var lastfmInfo = song.lastfmInfo || lastSongInfo;
        if (lastfmInfo && lastfmInfo[urlField]) chrome.tabs.create({url: lastfmInfo[urlField]});
      }
    }
    
    $("#track").click(ctrlHandler.bind(window, "url"));
    $("#artist").click(ctrlHandler.bind(window, "artistUrl"));
    $("#album").click(ctrlHandler.bind(window, "albumUrl"));
    
    $("body").on("click", ".nav", function(e) {
      var link = $(this).data("link");
      if (link) {
        var options = $(this).data("options");
        var title;
        if (link == "lyrics") {
          if (settings.openLyricsInMiniplayer == e.shiftKey) {
            bp.openLyrics(options);
            return;
          }
          if (!options) {
            if (!song.info) return;
            options = {artist: song.info.artist, title: song.info.title};
          }
          title = options.title;
          if (options.artist) title = options.artist + " - " + title;
          title = i18n("lyricsTitle", title);
        } else title = $(this).data("text") || $(this).text();
        
        if (settings.openLinksInMiniplayer == e.shiftKey && link != "quicklinks" && link != "lyrics") bp.selectLink(link);
        else switchView(title, link, $(this).data("search"), options);
        return false;
      }
    });
    
    $(window).keyup(function(e) {
      var kc = e.keyCode;
      if (kc == 27) {//ESC
        if (!$("#player").is(":visible")) restorePlayer();
      } else {
        if ($("input").is(":focus")) return;//avoid shortcut behavior when typing
        if (kc == 81) {//q
          if (!settings.hideSearchfield) {
            var searchField = $("#navHead > input");
            if (!searchField.is(":focus") && !searchField.is(":disabled")) {
              if (!searchField.is(":visible")) switchView(i18n("quicklinks"), "quicklinks");
              searchField.focus();
            }
          }
        } else if (kc == 32) {//space
          bp.executePlayPause();
        }
      }
    });

    $("#navlistContainer").on("click", ".playlistsList img", function() {
      bp.startPlaylist($(this).next("a").data("link"));
      restorePlayer();
    }).on("click", ".playlist img", function() {
      var songRow = $(this).closest("div[data-index]");
      if (songRow.hasClass("current")) {
        bp.executeInGoogleMusic("playPause");
      } else {
        bp.executeInGoogleMusic("startPlaylistSong", { link: currentNavList.controlLink, index: songRow.data("index"), cluster: getClusterIndex(songRow) });
      }
    }).on("click", ".playlist a[data-rating]", function() {
      var songRow = $(this).closest("div[data-index]");
      var rating = $(this).data("rating");
      if (songRow.hasClass("current")) {
        bp.rate(rating);
      } else {
        var index = songRow.data("index");
        var aSong = songRow.data("song");
        if (aSong.rating < 0) return;//negative ratings cannot be changed
        if (rating == 5 && settings.linkRatings && !bp.isRatingReset(aSong.rating, rating)) bp.love({ title: aSong.title, artist: aSong.artist }, $.noop);
        bp.executeInGoogleMusic("ratePlaylistSong", { link: currentNavList.controlLink, index: index, cluster: getClusterIndex(songRow), rating: rating });
      }
    });
  }

  function googleMusicExecutor(command) {
    return function() {
      if ($(this).css("opacity") == 1) bp.executeInGoogleMusic(command);
    };
  }

  function renderPlayControls() {
    $(".playPause").click(googleMusicExecutor("playPause")).each(function() {
      $(this).attr("title", i18n(this.id + "Song"));
    });
    $("#prev").click(googleMusicExecutor("prevSong")).attr("title", i18n("prevSong"));
    $("#next").click(googleMusicExecutor("nextSong")).attr("title", i18n("nextSong"));
    $("#repeat").click(googleMusicExecutor("toggleRepeat")).attr("title", i18n("command_toggleRepeat"));
    $("#shuffle").click(googleMusicExecutor("toggleShuffle")).attr("title", i18n("command_toggleShuffle"));
    $("#volume").click(toggleVolumeControl).attr("title", i18n("volumeControl"));
    $("#volumeBarBorder").click(setVolume);
  }

  function setupGoogleRating() {
    $("html").on("click", ".hasSong #googleRating > .rating-container > a", function() {
      var cl = $(this).attr("class");
      var rating = cl.substr(cl.indexOf("rating-") + 7, 1);
      bp.rate(rating);
    });
  }

  function renderLastfmTitle(a) {
    var title = a.data("msg") || "";
    var lastfmInfo = a.data("lastfmInfo");
    if (lastfmInfo) title += "\n" + lastfmInfo;
    a.attr("title", title);
  }
  
  function renderLastfmInfo(lastfmInfo) {
    var infoText = "";
    if (lastfmInfo) {
      infoText = i18n("lastfmInfo_userplaycount", lastfmInfo.userplaycount + "") +
        "\n" + i18n("lastfmInfo_playcount", lastfmInfo.playcount + "") +
        "\n" + i18n("lastfmInfo_listeners", lastfmInfo.listeners + "");
      $("#lastfmInfo").addClass("hasInfo")
              .find(".userplaycount > span").text(lastfmInfo.userplaycount)
        .end().find(".playcount > span").text(lastfmInfo.playcount)
        .end().find(".listeners > span").text(lastfmInfo.listeners);
    } else {
      $("#lastfmInfo").removeClass("hasInfo").find("span").text("?");
    }
    
    var a = $("#lastfmRating").find("a");
    a.data("lastfmInfo", infoText);
    renderLastfmTitle(a);
  }
  
  function renderSongLoved(loved, actions) {
    var lastfmRating = $("#lastfmRating").removeClass("loved notloved error loading");
    var a = lastfmRating.find("a").unbind();
    if (loved === null) {
      lastfmRating.addClass("loading");
    } else if (typeof(loved) == "string") {
      lastfmRating.addClass("error");
      a.data("msg", i18n("lastfmError") + loved).click(actions.getLastfmInfo);
      a.data("lastfmInfo", "");
    } else if (loved === true) {
      lastfmRating.addClass("loved");
      a.data("msg", i18n("lastfmUnlove")).click(actions.unlove);
    } else if (loved === false) {
      lastfmRating.addClass("notloved");
      a.data("msg", i18n("lastfmLove")).click(actions.love);
    }
    renderLastfmTitle(a);
  }
  
  function songLovedWatcher(loved) {
    renderSongLoved(loved, {getLastfmInfo: bp.loadCurrentLastfmInfo, unlove: bp.unloveTrack, love: bp.loveTrack});
  }

  function toggleVolumeControl() {
    if (player.volume !== null) {
      $("#volumeBarContainer").toggle();
    }
  }

  function renderQuicklinks(val) {
    $("#quicklinks a.nav").each(function() {
      $(this).text(bp.getTextForQuicklink($(this).data("link")));
    });
    updateCoverClickLink(settings.coverClickLink);
    updateTitleClickLink(settings.titleClickLink);
    var searchPlaceholder = val && val.searchPlaceholder ? val.searchPlaceholder : i18n("searchPlaceholder");
    $("#navHead > input").attr("placeholder", searchPlaceholder);
  }

  function setSongPosition(event) {
    bp.setSongPosition(event.offsetX / $(this).width());
  }

  function setVolume(event) {
    bp.setVolume(event.offsetX / $(this).width());
  }

  $(function() {
    $("html").addClass(typeClass);
    $("head > title").first().text(i18n("extTitle"));

    setupGoogleRating();
    renderPlayControls();

    $("#miniplayerlink")
      .click(bp.openMiniplayer)
      .attr("title", i18n("openMiniplayer"));

    $("#feelingLucky")
      .click(bp.executeFeelingLucky)
      .attr("title", i18n("feelingLucky"));

    $("#nosong").children("a:first-child").text(i18n("nothingPlaying"))
      .end().children("a:last-child")
        .click(bp.openGoogleMusicTab)
        .text(i18n("gotoGmusic"));

    $("#scrobblePosition").attr("title", i18n("scrobblePosition"));
    $("#timeBarHolder").click(setSongPosition);

    $("#quicklinksBtn")
      .data("text", i18n("quicklinks"))
      .attr("title", i18n("showQuicklinks"));

    $("#lastfmInfo")
            .find(".userplaycount").html(i18n("lastfmInfo_userplaycount", "<span></span>"))
      .end().find(".playcount").html(i18n("lastfmInfo_playcount", "<span></span>"))
      .end().find(".listeners").html(i18n("lastfmInfo_listeners", "<span></span>"));

    $("#lastfmUser")
      .on("contextmenu", function() {
        settings.scrobble = !settings.scrobble;
        return false;
      });

    setupNavigationEvents();

    localSettings.w("lastfmSessionName", lastfmUserWatcher, typeClass);
    localSettings.w("lyrics", lyricsWatcher, typeClass);
    localSettings.w("lyricsFontSize", lyricsFontSizeWatcher, typeClass);
    localSettings.w("allinc", allincWatcher, typeClass);
    localSettings.w("ratingMode", ratingModeWatcher, typeClass);
    localSettings.w("quicklinks", renderQuicklinks, typeClass);
    
    settings.w("scrobble", scrobbleWatcher, typeClass);
    settings.w("showLastfmInfo", showLastfmInfoWatcher, typeClass);
    settings.w("color", colorWatcher, typeClass);
    settings.w("mpBgColor", mpBgColorWatcher, typeClass);
    settings.w("mpTextColor", mpTextColorWatcher, typeClass);
    settings.al("coverClickLink", updateCoverClickLink, typeClass);
    settings.al("titleClickLink", updateTitleClickLink, typeClass);
    settings.w("hideSearchfield", hideSearchfieldWatcher, typeClass);
    settings.al("saveLastPosition", saveLastPositionUpdated, typeClass);

    player.w("repeat", repeatWatcher, typeClass);
    player.w("shuffle", shuffleWatcher, typeClass);
    player.w("playing", playingWatcher, typeClass);
    player.w("volume", volumeWatcher, typeClass);
    player.w("connected", connectedWatcher, typeClass);
    player.al("navigationList", renderNavigationList, typeClass);
    player.al("listrating", updateListrating, typeClass);

    song.w("info", songInfoWatcher, typeClass);
    song.w("positionSec", positionSecWatcher, typeClass);
    song.w("rating", ratingWatcher, typeClass);
    song.w("scrobbleTime", updateScrobblePosition, typeClass);
    song.w("loved", songLovedWatcher, typeClass);
    song.w("lastfmInfo", renderLastfmInfo, typeClass);
    song.w("scrobbled", scrobbledWatcher, typeClass);

    if (settings.layout != "hbar") resize(localSettings.miniplayerSizing[settings.layout]);//try to restore saved size (chrome.windows.create does not always set the desired size)
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast" && settings.toastDuration > 0) setToastAutocloseTimer();

    $(window).unload(function() {
      localSettings.ral(typeClass);
      settings.ral(typeClass);
      player.ral(typeClass);
      song.ral(typeClass);
    });
  });

});
