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
  /** store the static links referenced in markup that should not be candidates for favorites **/
  var staticLinks = { search: true };
  /** cache favorites for quick test if they exist **/
  var favoritesCache = {};

  /** shortcuts, for minimisation */
  var i18n = chrome.i18n.getMessage;
  var localSettings = bp.localSettings;
  var settings = bp.settings;
  var player = bp.player;
  var song = bp.song;

  settings.favorites.forEach(function(fav) {
    favoritesCache[fav.link] = true;
  });

  function isFavoriteCandidate(link) {
    return !staticLinks[link] && link.indexOf("sm/") !== 0;
  }
  
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
      $("#googleRating a").removeClass("disabled");
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
    $("#googleRating a").addClass("disabled");
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
        var sizing;
        if ($("#player").is(":visible")) {
          sizing = localSettings.miniplayerSizing;
          sizing[settings.layout].width = window.outerWidth;
          sizing[settings.layout].height = window.outerHeight;
          localSettings.miniplayerSizing = sizing;//trigger listener notification
        } else if ($("#nav").is(":visible")) {
          var type;
          if ($("#quicklinks").is(":visible")) type = "quicklinks";
          else if ($("#favoritesContainer").is(":visible")) type = "favorites";
          else if ($("#lyrics").is(":visible")) type = "lyrics";
          else type = $("#navlist").attr("class");
          var sizingSetting = type + "Sizing";
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
  
  function hideFavoritesWatcher(val) {
    $("body").toggleClass("hidefav", val);
  }
  
  function resize(sizing) {
    if (typeClass == "miniplayer" || typeClass == "toast") {
      window.resizeTo(sizing.width, sizing.height);
    }
  }

  function getFavoriteIcon(link, title) {
    if (isFavoriteCandidate(link)) {
      var fav = $("<a class='fav'>").data("fav", { link: link, title: title });
      if (favoritesCache[link]) fav.addClass("isfav");
      return fav;
    } else return $("<a class='fav' style='visibility:hidden'>");
  }
  
  var renderNavList = {
    playlistsList: function(navlist, list) {
      list.forEach(function(pl) {
        var row = $("<div>");
        $("<img>").attr("src", pl.cover || "img/cover.png").appendTo(row);
        row.append(getFavoriteIcon(pl.titleLink, pl.title));
        var info = $("<div>");
        $("<a tabindex='0' class='album nav'>").data("link", pl.titleLink).text(pl.title).attr("title", pl.title).appendTo(info);
        if (pl.subTitleLink) {
          $("<a tabindex='0' class='nav'>").data("link", pl.subTitleLink).text(pl.subTitle).attr("title", pl.subTitle).appendTo(info);
        } else if (pl.subTitle) {
          $("<span>").text(pl.subTitle).attr("title", pl.subTitle).appendTo(info);
        }
        row.append(info);
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
        var row = $("<div data-index='" + song.index + (song.current ? "' class='current'>" : "'>"));
        $("<img>").attr("src", song.cover || "img/cover.png").appendTo(row);
        $("<div class='rating r" + song.rating + "'>").html(ratingHtml).appendTo(row);
        if (song.rating >= 0) noRating = false;
        var info = $("<div class='info'>");
        var title;
        if (localSettings.lyrics) {
          title = $("<a tabindex='0' class='nav' data-link='lyrics'>").data("options", {artist: song.artist, title: song.title}).attr("title", i18n("lyricsFor", song.title));
        } else {
          title = $("<span>").attr("title", song.title);
        }
        title.text(song.title).appendTo(info);
        $("<span class='duration'>").text(song.duration).appendTo(info);
        duration += bp.parseSeconds(song.duration);
        if (song.artistLink) {
          $("<a tabindex='0' class='nav'>").data("link", song.artistLink).text(song.artist).attr("title", song.artist).appendTo(info);
        } else {
          $("<span>").text(song.artist).attr("title", song.artist).appendTo(info);
        }
        
        var currentAlbum = song.albumLink == currentNavList.link;
        var albumCol;
        if (song.albumLink && !currentAlbum) {
          albumCol = $("<a tabindex='0' class='album nav'>").data("link", song.albumLink);
        } else if (song.album) {
          albumCol = $("<span class='album'>");
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
        var row = $("<div>");
        $("<img>").attr("src", ac.cover || "img/cover.png").appendTo(row);
        row.append(getFavoriteIcon(ac.link, ac.title));
        $("<a tabindex='0' class='nav'>").data("link", ac.link).text(ac.title).attr("title", ac.title).appendTo(row);
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
    var header = $("<h2>").text(list.header);
    navlist.append(header);
    var container = $("<div>").addClass(list.type).appendTo(navlist);
    renderNavList[list.type](container, list.list, false, list.cluster, header);
    if (list.moreLink) $("<a tabindex='0' class='nav'>").data("link", list.moreLink).appendTo(header);
  }
  
  function renderNavigationList(val) {
    if (!val || val.link != currentNavList.link || val.search != currentNavList.search) return;
    player.navigationList = null;//free memory
    currentNavList.controlLink = val.controlLink;
    var navlist = $("#navlist");
    if (val.error) {
      navlist.removeClass().html("<div class='error'>");
    } else if (val.empty) {
      navlist.removeClass().html("<div class='empty'>");
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

  function renderLyrics(lyrics, options, providers, src, result) {
    lyrics.removeClass("loading");
    var content = lyrics.children(".content");
    var credits = lyrics.children(".credits");
    if (result.error) {
      content.html("<div class='error'>");
    } else if (result.noresults) {
      content.html("<div class='empty'>");
    } else {
      $("#navHead").children("span").text(result.title.text().trim());
      content.html(result.lyrics.html());
      if (result.credits) credits.html(result.credits.html() + "<hr>");
    }
    credits.append(i18n("lyricsSrcProvider", bp.lyricsProviders[src].getUrl()));
    if (result.src) $("<a target='_blank'>").attr("href", result.src).text(i18n("lyricsSrc")).appendTo(credits);
    if (result.searchSrc) $("<a target='_blank'>").attr("href", result.searchSrc).text(i18n("lyricsSearchResult")).appendTo(credits);
    credits.append("<br>");
    
    providers.forEach(function(provider) {
      var otherProviders = providers.slice();
      otherProviders.splice(otherProviders.indexOf(provider), 1);
      $("<a class='nav'>")
        .data("options", $.extend({}, options, { providers: otherProviders }))
        .data("link", "lyrics/" + provider)
        .text(i18n("lyricsSearchProvider", bp.lyricsProviders[provider].getUrl()))
        .appendTo(credits);
    });
  }

  function resetFavoritesView() {
    $("#favorites").find("input").remove().end().find(".nav").removeAttr("style");
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
    if (currentNavList.link && currentNavList.link != link) {
      navHistory.push(currentNavList);
    }
    currentNavList = { link: link, title: title, search: search, options: options };
    updateNavHead(title);
    $("#navlist").empty().removeClass();
    var lyrics = $("#lyrics");
    lyrics.removeClass().hide().children().empty();
    if (!search) $("#navHead > input").val("");
    $("#player,#navlistContainer,#quicklinks,#favoritesContainer,#navHead .fav").hide();
    if (link == "quicklinks") {
      resize(localSettings.quicklinksSizing);
      $("#quicklinks").show();
    } else if (link == "favorites") {
      resize(localSettings.favoritesSizing);
      resetFavoritesView();
      $("#favoritesContainer").show();
    } else if (!link.indexOf("lyrics")) {
      lyrics.addClass("loading");
      resize(localSettings.lyricsSizing);
      lyrics.show();
      var providerIndex = link.indexOf("/") + 1;
      if (providerIndex) bp.fetchLyricsFrom(options, link.substr(providerIndex), renderLyrics.bind(window, lyrics, options, options.providers));
      else bp.fetchLyrics(options, renderLyrics.bind(window, lyrics, options));
    } else {
      $("#navlist").addClass("loading");
      $("#navlistContainer").show();
      if (isFavoriteCandidate(link)) {
        $("#navHead .fav").toggleClass("isfav", !!favoritesCache[link]).data("fav", { link: link, title: title }).show();
      }
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
    $("#navHead .back").click(function() {
      if (navHistory.length) {
        var current = navHistory.pop();
        currentNavList = {};
        if (current.search) $("#navHead > input").val(current.search);
        switchView(current.title, current.link, current.search, current.options);
      } else restorePlayer();
    });
    $("#navHead .close").attr("title", i18n("close")).click(restorePlayer);
    
    $("#nav").on("click", ".fav", function() {
      var favElement = $(this);
      var fav = favElement.data("fav");
      var link = fav.link;
      
      var favorites = settings.favorites;
      if (favoritesCache[link]) {
        var index = -1;
        favorites.some(function(val, i) {
          if (val.link == link) {
            index = i;
            return true;
          }
        });
        if (index >= 0) favorites.splice(index, 1);
        delete favoritesCache[link];
      } else {
        favorites.unshift(fav);
        favoritesCache[link] = true;
      }
      favElement.toggleClass("isfav", !!favoritesCache[link]);
      settings.favorites = favorites;//trigger listener notification
    });
    
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
      var nav = $(this);
      var link = nav.data("link");
      if (link) {
        var options = nav.data("options");
        var title;
        var lyrics = !link.indexOf("lyrics");
        if (lyrics) {
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
        } else title = nav.data("text") || nav.text();
        
        if (settings.openLinksInMiniplayer == e.shiftKey && link != "quicklinks" && !lyrics) bp.selectLink(link);
        else switchView(title, link, nav.data("search"), options);
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
      bp.startPlaylist($(this).parent().find(".album").data("link"));
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
    
    var dropSelector = "div";
    var favorites = settings.favorites;
    $("#favorites").on("click", "img", function() {
      bp.startPlaylist($(this).siblings(".nav").data("link"));
      restorePlayer();
    }).on("click", ".edit", function() {
      var navLink = $(this).siblings(".nav");
      resetFavoritesView();
      navLink.hide();
      var input = $("<input type='text'>").val(navLink.text());
      navLink.after(input);
      input.focus();
    }).on("keyup", "input", function(ev) {
      var kc = ev.keyCode;
      if (kc == 27) {//ESC
        resetFavoritesView();
      } if (kc == 13) {//Return
        var navLink = $(this).siblings(".nav");
        favorites[navLink.parent().index()] = { link: navLink.data("link"), title: $(this).val() };
        settings.favorites = favorites;//trigger listeners
        resetFavoritesView();
      }
      return false;
    }).on("dragover", dropSelector, function(ev) {
      var types = ev.originalEvent.dataTransfer.types;
      var index = $(this).index();
      var dropAllowed = types.indexOf("srcfavorite") >= 0 && types.indexOf("srcfavorite/" + index) < 0 && types.indexOf("srcfavorite/" + (index - 1)) < 0;
      $(this).toggleClass("dragging", dropAllowed);
      return !dropAllowed;
    }).on("dragleave", dropSelector, function() {
      $(this).removeClass("dragging");
    }).on("drop", dropSelector, function(ev) {
      $(this).removeClass("dragging");
      var srcIndex = ev.originalEvent.dataTransfer.getData("srcfavorite");
      var destIndex = $(this).index();
      var src = favorites.splice(srcIndex, 1)[0];
      if (srcIndex < destIndex) destIndex--;
      favorites.splice(destIndex, 0, src);
      settings.favorites = favorites;//trigger listeners
      return false;
    }).on("dragstart", "div[draggable='true']", function(ev) {
      var dt = ev.originalEvent.dataTransfer;
      var index = $(this).index();
      dt.setData("srcfavorite", index);
      dt.setData("srcfavorite/" + index, "");
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
    var qlDiv = $("#quicklinks");
    qlDiv.empty();
    var div1 = $("<div>");
    var div2 = $("<div>");
    qlDiv.append(div1, div2);
    var quicklinks = bp.getQuicklinks();
    quicklinks.forEach(function(ql, i) {
      $("<a tabindex='0' class='nav'>").attr("data-link", ql).text(bp.getTextForQuicklink(ql)).appendTo(i < quicklinks.length / 2 ? div1 : div2);
    });
    
    updateCoverClickLink(settings.coverClickLink);
    updateTitleClickLink(settings.titleClickLink);
    var searchPlaceholder = val && val.searchPlaceholder ? val.searchPlaceholder : i18n("searchPlaceholder");
    $("#navHead > input").attr("placeholder", searchPlaceholder);
    collectStaticLinks();
  }

  function renderFavorites(favorites) {
    var favDiv = $("#favorites").empty();
    if (favorites.length) {
      favorites.forEach(function(fav) {
        var div = $("<div draggable='true'>");
        $("<img>").attr("src", "img/cover.png").appendTo(div);
        $("<a tabindex='0' class='fav'>").data("fav", fav).appendTo(div);
        $("<a tabindex='0' class='edit'>").appendTo(div);
        $("<a tabindex='0' class='nav'>").text(fav.title).data("link", fav.link).appendTo(div);
        favDiv.append(div);
      });
      favDiv.append("<div>");
    }else favDiv.append("<div class='empty'>");
  }
  
  function setSongPosition(event) {
    bp.setSongPosition(event.offsetX / $(this).width());
  }

  function setVolume(event) {
    bp.setVolume(event.offsetX / $(this).width());
  }

  function collectStaticLinks() {
    staticLinks = {};
    $("a[data-link]").each(function() {
      staticLinks[$(this).data("link")] = true;
    });
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

    $("#showfavorites")
      .data("text", i18n("favorites"))
      .attr("title", i18n("favorites"));

    setupNavigationEvents();

    localSettings.w("lastfmSessionName", lastfmUserWatcher, typeClass);
    localSettings.w("lyrics", lyricsWatcher, typeClass);
    localSettings.w("lyricsFontSize", lyricsFontSizeWatcher, typeClass);
    localSettings.w("quicklinks", renderQuicklinks, typeClass);
    localSettings.w("ratingMode", ratingModeWatcher, typeClass);
    
    settings.w("scrobble", scrobbleWatcher, typeClass);
    settings.w("showLastfmInfo", showLastfmInfoWatcher, typeClass);
    settings.w("color", colorWatcher, typeClass);
    settings.w("mpBgColor", mpBgColorWatcher, typeClass);
    settings.w("mpTextColor", mpTextColorWatcher, typeClass);
    settings.al("coverClickLink", updateCoverClickLink, typeClass);
    settings.al("titleClickLink", updateTitleClickLink, typeClass);
    settings.w("hideSearchfield", hideSearchfieldWatcher, typeClass);
    settings.al("saveLastPosition", saveLastPositionUpdated, typeClass);
    settings.w("hideFavorites", hideFavoritesWatcher, typeClass);
    settings.w("favorites", renderFavorites, typeClass);

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
