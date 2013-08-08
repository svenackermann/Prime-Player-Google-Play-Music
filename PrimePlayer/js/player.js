/**
 * This script does all the magic for the miniplayer, popup and toasts.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var typeClass = bp.extractUrlParam("type", location.search) || "popup";
  var savedSizing;

  function layoutWatcher(val, old) {
    $("html").removeClass("layout-" + old).addClass("layout-" + val);
  }
  if (typeClass == "miniplayer" || typeClass == "toast") {
    bp.settings.watch("layout", layoutWatcher);
  } else {
    $("html").addClass("layout-normal");
  }
  
  function hideRatingsWatcher(val) {
    $("html").toggleClass("hideRatings", val);
  }
  
  bp.settings.watch("hideRatings", hideRatingsWatcher);

  function repeatWatcher(val) {
    $("#repeat").attr("class", val);
  }

  function shuffleWatcher(val) {
    $("#shuffle").attr("class", val);
  }

  function playingWatcher(val) {
    $("body").toggleClass("playing", val);
  }

  function songInfoWatcher(val) {
    $("body").toggleClass("hasSong", val != null);
    if (val) {
      $("#songTime").text(val.duration);
      $("#track").text(val.title);
      $("#artist").text(val.artist).attr("title", val.artist);
      $("#album").text(val.album).attr("title", val.album);
      $("#cover").attr("src", val.cover || "img/cover.png");
      //although the value of scrobbleTime might have not changed, the relative position might have
      updateScrobblePosition(bp.song.scrobbleTime);
    } else {
      $("#cover").attr("src", "img/cover.png");
    }
    if (bp.player.playlist) {
      var pl = bp.player.playlist.list;
      var cur = $("#playlist").children("div.current");
      if (cur.length > 0) {
        cur.removeClass("current");
        pl[parseInt(cur.data("index"))].current = false;
      }
      if (val) {
        for (var i = 0; i < pl.length; i++) {
          if (bp.songsEqual(pl[i], val)) {
            $("#playlist").children("div[data-index='" + i + "']").addClass("current");
            pl[i].current = true;
            break;
          }
        }
      }
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
    var body = $("body");
    body.removeClass("star-rating thumbs-rating");
    if (val) {
      body.addClass(val + "-rating");
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
  
  function scrobbledWatcher(val) {
    $("body").toggleClass("scrobbled");
  }

  function scrobbleWatcher(val) {
    $("body").toggleClass("scrobbleEnabled", val);
  }

  function colorWatcher(val, old) {
    $("html").removeClass("color-" + old).addClass("color-" + val);
  }

  /** listen for resize events and poll for position changes to update the settings */
  function setupResizeMoveListeners() {
    var timerId;
    $(window).resize(function() {
      clearTimeout(timerId);
      timerId = setTimeout(function() {
        if ($("#player").is(":visible")) {
          var sizing = bp.localSettings.miniplayerSizing;
          sizing[bp.settings.layout].width = window.innerWidth;
          sizing[bp.settings.layout].height = window.innerHeight;
          bp.localSettings.miniplayerSizing = sizing;//trigger listener notification
        } else {
          var sizingSetting;
          if ($("#playlistsList").is(":visible")) {
            sizingSetting = "playlistsListSizing";
          } else if ($("#playlist").is(":visible")) {
            sizingSetting = "playlistSizing";
          } else if ($("#quicklinks").is(":visible")) {
            sizingSetting = "quicklinksSizing";
          } else if ($("#albumContainers").is(":visible")) {
            sizingSetting = "albumContainersSizing";
          } else return;
          var sizing = bp.localSettings[sizingSetting];
          sizing.width = window.outerWidth;
          sizing.height = window.outerHeight;
          bp.localSettings[sizingSetting] = sizing;//trigger listener notification
        }
      }, 500);
    });
    
    var oldX = window.screenX;
    var oldY = window.screenY;
    setInterval(function() {
      if ($("#player").is(":visible") && (oldX != window.screenX || oldY != window.screenY)) {
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
      $("#volume").toggleClass("muted", val == "0");
    }
  }
  
  function connectedWatcher(val) {
    $("body").toggleClass("connected", val);
    $("#coverContainer").unbind();
    $("#cover").removeAttr("title");
    $("#nosong a:first-child").removeAttr("title").unbind();
    if (val) {
      $("#coverContainer").click(function() { showPlaylistsList("now"); });
      $("#cover").attr("title", chrome.i18n.getMessage("showListenNow"));
      $("#nosong a:first-child")
        .attr("title", chrome.i18n.getMessage("showQueue"))
        .click(function() { showPlaylist("ap/queue"); });
      renderQuicklinks();
    } else {
      restorePlayer();
    }
  }
  
  function resize(sizing) {
    if ((typeClass == "miniplayer" || typeClass == "toast") && sizing.width != null && sizing.height != null) {
      window.resizeTo(sizing.width, sizing.height);
    }
  }
  
  function savePlayerSizing() {
    if ($("#player").is(":visible") && (typeClass == "miniplayer" || typeClass == "toast")) {
      savedSizing = {
        height: window.outerHeight,
        width: window.outerWidth,
        screenX: window.screenX - screen.availLeft,
        screenY: window.screenY
      }
    }
  }
  
  function restorePlayer() {
    $("#playlistsList").hide().empty();
    $("#playlist").hide().empty();
    $("#quicklinks").hide();
    $("#albumContainers").hide().empty();
    if (savedSizing != null) {
      resize(savedSizing);
      window.moveTo(savedSizing.screenX, savedSizing.screenY);
      savedSizing = null;
    }
    $("#player").show();
  }

  function renderPlaylistsList(val) {
    resize(bp.localSettings.playlistsListSizing);
    var html = "";
    for (var i = 0; i < val.length; i++) {
      var e = val[i];
      html += "<div>";
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<a href='#' data-link='" + e.titleLink + "' class='title'>" + e.title + "</a>";
      if (e.subTitleLink) {
        html += "<a href='#' data-link='" + e.subTitleLink + "'>" + e.subTitle + "</a>";
      } else if (e.subTitle) {
        html += "<span>" +  e.subTitle + "</span>";
      }
      html += "</div>";
    }
    $("#playlistsList").removeClass("loading").html(html).find("span, a").each(function() {
      $(this).attr("title", $(this).text());
    });
  }
  
  function showPlaylistsList(link) {
    savePlayerSizing();
    $("body > div:visible").hide();
    $("#playlistsList").empty().addClass("loading").show();
    bp.player.addListener("playlistsList", renderPlaylistsList);
    bp.loadPlaylistsList(link);
  }

  function clearPlaylistsList() {
    bp.player.removeListener("playlistsList", renderPlaylistsList);
    bp.player.playlistsList = [];
  }
  
  function hidePlaylistsList() {
    clearPlaylistsList();
    restorePlayer();
  }
  
  function setupPlaylistsListEvents() {
    $("#playlistsList").on("click", "div > a.title", function() {
      clearPlaylistsList();
      showPlaylist($(this).data("link"));
      return false;
    }).on("click", "div > a:not(.title)", function() {
      clearPlaylistsList();
      showPlaylistsList($(this).data("link"));
      return false;
    }).on("click", "img", function() {
      startPlaylist($(this).next("a").data("link"));
    });
  }

  function renderPlaylist(val) {
    if (val == null) {
      hidePlaylist();
      return;
    }
    if (val.list.length == 0) {
      $("#playlist").removeClass("loading").html("<div class='empty'></div>");
      return;
    }
    resize(bp.localSettings.playlistSizing);
    var html = "";
    var ratingHtml = "";
    if (bp.player.ratingMode == "star") {
      ratingHtml += "<div></div>";
      for (var i = 1; i <= 5; i++) ratingHtml += "<a href='#' data-rating='" + i + "'></a>";
    } else if (bp.player.ratingMode == "thumbs") {
      ratingHtml = "<a href='#' data-rating='5'></a><a href='#' data-rating='1'></a>";
    }
    for (var i = 0; i < val.list.length; i++) {
      var e = val.list[i];
      html += "<div data-index='" + i + (e.current ? "' class='current'>" : "'>");
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<div class='rating r" + e.rating + "'>" + ratingHtml + "</div>";
      html += "<div><span" + (e.duration ? " title=' (" + e.duration + ")'>" : ">") + e.title + "</span>";
      if (e.artistLink) {
        html += "<a class='artist' href='#' data-link='" + e.artistLink + "'>" + e.artist + "</a>";
      } else {
        html += "<span>" + e.artist + "</span>";
      }
      html += "</div></div>";
    }
    $("#playlist").removeClass("loading").html(html).find("span, a.artist").each(function() {
      $(this).attr("title", $(this).text() + ($(this).attr("title") || ""));
    });
  }
  
  function showPlaylist(link) {
    savePlayerSizing();
    $("body > div:visible").hide();
    $("#playlist").empty().addClass("loading").show();
    bp.player.addListener("playlist", renderPlaylist);
    bp.loadPlaylist(link);
  }

  function clearPlaylist() {
    bp.player.removeListener("playlist", renderPlaylist);
    bp.player.playlist = null;
  }
  
  function hidePlaylist() {
    clearPlaylist();
    restorePlayer();
  }
  
  function setupPlaylistEvents() {
    $("#playlist").on("click", "a[data-rating]", function() {
      var div = $(this).parent().parent();
      var rating = $(this).data("rating");
      if (div.hasClass("current")) {
        bp.rate(rating);
      } else {
        var index = div.data("index");
        bp.ratePlaylistSong(index, rating);
      }
      return false;
    }).on("click", "div > img", function() {
      var div = $(this).parent();
      if (div.hasClass("current")) {
        bp.executeInGoogleMusic("playPause");
      } else {
        var index = div.data("index");
        bp.executeInGoogleMusic("startPlaylistSong", {link: bp.player.playlist.controlLink, index: index});
      }
      return false;
    }).on("click", "a.artist", function() {
      clearPlaylist();
      showPlaylistsList($(this).data("link"));
      return false;
    });
  }

  function ratedCallback(rating, old, index) {
    if ($("#playlist").is(":visible") && bp.player.playlist) {
      var row;
      if (index === undefined) {
        row = $("#playlist").children("div.current");
        index = row.data("index");
      } else {
        row = $("#playlist").children("div[data-index='" + index + "']");
      }
      bp.player.playlist.list[index].rating = rating;
      if (row.length > 0) {
        row.find("div.rating").removeClass("r" + old).addClass("r" + rating);
      }
    }
  }
  
  function googleMusicExecutor(command) {
    return function() { bp.executeInGoogleMusic(command); };
  }
  
  function renderPlayControls() {
    $(".playPause").click(googleMusicExecutor("playPause")).each(function() {
      $(this).attr("title", chrome.i18n.getMessage(this.id + "Song"));
    });
    $("#prev").click(googleMusicExecutor("prevSong")).attr("title", chrome.i18n.getMessage("prevSong"));
    $("#next").click(googleMusicExecutor("nextSong")).attr("title", chrome.i18n.getMessage("nextSong"));
    $("#repeat").click(googleMusicExecutor("toggleRepeat")).attr("title", chrome.i18n.getMessage("repeat"));
    $("#shuffle").click(googleMusicExecutor("toggleShuffle")).attr("title", chrome.i18n.getMessage("shuffle"));
    $("#volume").click(toggleVolumeControl).attr("title", chrome.i18n.getMessage("volumeControl"));
    $("#volumeBarBorder").click(setVolume);
  }

  function setupGoogleRating() {
    $("#googleRating").find("div.rating-container").on("click", "a", function() {
      var cl = $(this).attr("class");
      var rating = cl.substr(cl.indexOf("rating-") + 7, 1);
      bp.rate(rating);
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
  
  function renderQuicklinks() {
    var ql = bp.player.quicklinks;
    $("#qlListenNow").text(ql.listenNowText);
    $("#qlArtists").text(ql.artistsText);
    $("#qlAlbums").text(ql.albumsText);
    $("#qlGenres").text(ql.genresText);
    $("#qlMixes").text(ql.mixesText);
    $("#qlPlaylists").text(chrome.i18n.getMessage("myPlaylists"));
    var apl = "";
    for (var i = 0; i < ql.autoPlaylists.length; i++) {
      apl += "<a href='#' data-link='" + ql.autoPlaylists[i].link + "'>" + ql.autoPlaylists[i].text + "</a>";
    }
    $("#qlAutoPlaylists").html(apl);
  }
  
  function setupQuicklinksEvents() {
    $("#qlListenNow").click(function() {
      showPlaylistsList("now");
      return false;
    });
    $("#qlArtists").click(function() {
      showAlbumContainers("artists");
      return false;
    });
    $("#qlAlbums").click(function() {
      showPlaylistsList("albums");
      return false;
    });
    $("#qlGenres").click(function() {
      showAlbumContainers("genres");
      return false;
    });
    $("#qlMixes").click(function() {
      showPlaylistsList("rd");
      return false;
    });
    $("#qlPlaylists").click(function() {
      showPlaylistsList("myPlaylists");
      return false;
    });
    $("#qlAutoPlaylists").on("click", "a", function() {
      showPlaylist($(this).data("link"));
      return false;
    });
  }
  
  function showQuicklinks() {
    savePlayerSizing();
    $("#player").hide();
    $("#quicklinks").show();
    resize(bp.localSettings.quicklinksSizing);
  }
  
  function renderAlbumContainers(val) {
    resize(bp.localSettings.albumContainersSizing);
    var html = "";
    for (var i = 0; i < val.length; i++) {
      var e = val[i];
      html += "<div>";
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<a href='#' data-link='" + e.link + "'>" + e.title + "</a>";
      html += "</div>";
    }
    $("#albumContainers").removeClass("loading").html(html);
  }
  
  function showAlbumContainers(link) {
    savePlayerSizing();
    $("body > div:visible").hide();
    $("#albumContainers").empty().addClass("loading").show();
    bp.player.addListener("albumContainers", renderAlbumContainers);
    bp.loadAlbumContainers(link);
  }

  function hideAlbumContainers() {
    bp.player.removeListener("albumContainers", renderAlbumContainers);
    bp.player.albumContainers = null;
    restorePlayer();
  }
  
  function startPlaylist(link) {
    bp.startPlaylist(link);
  }

  function setSongPosition(event) {
    bp.setSongPosition(event.offsetX / $(this).width());
  }

  function setVolume(event) {
    bp.setVolume(event.offsetX / $(this).width());
  }
  
  $(function() {
    $("html").addClass(typeClass);
    $("head > title").first().text(chrome.i18n.getMessage("extTitle"));
    
    setupGoogleRating();
    renderPlayControls();
    
    $("#miniplayerlink")
      .click(bp.openMiniplayer)
      .attr("title", chrome.i18n.getMessage("openMiniplayer"));
      
    $("#nosong").children("a:first-child").text(chrome.i18n.getMessage("nothingPlaying"))
      .parent().children("a:last-child")
        .click(bp.openGoogleMusicTab)
        .text(chrome.i18n.getMessage("gotoGmusic"));

    $("#track").click(function(){ showPlaylist("ap/queue"); }).attr("title", chrome.i18n.getMessage("showQueue"));
    $("#artist").click(function() { showPlaylistsList(bp.song.info.artistLink); });
    $("#album").click(function() { showPlaylist(bp.song.info.albumLink); });
    
    $("#scrobblePosition").attr("title", chrome.i18n.getMessage("scrobblePosition"));
    $("#timeBarHolder").click(setSongPosition);
    
    $("#albumContainers").on("click", "a", function() {
      showPlaylistsList($(this).data("link"));
      return false;
    });
    
    $("#playlist").click(hidePlaylist);
    $("#playlistsList").click(hidePlaylistsList);
    $("#quicklinks").click(restorePlayer);
    $("#albumContainers").click(hideAlbumContainers);
    $("#quicklinksBtn")
      .click(showQuicklinks)
      .attr("title", chrome.i18n.getMessage("showQuicklinks"));
    
    setupPlaylistsListEvents();
    setupPlaylistEvents();
    setupQuicklinksEvents();
    
    bp.localSettings.watch("lastfmSessionName", lastfmUserWatcher);
    bp.settings.watch("scrobble", scrobbleWatcher);
    bp.settings.watch("color", colorWatcher);
    
    bp.player.watch("repeat", repeatWatcher);
    bp.player.watch("shuffle", shuffleWatcher);
    bp.player.watch("ratingMode", ratingModeWatcher);
    bp.player.watch("playing", playingWatcher);
    bp.player.watch("volume", volumeWatcher);
    bp.player.watch("connected", connectedWatcher);
    
    bp.song.watch("info", songInfoWatcher);
    bp.song.watch("positionSec", positionSecWatcher);
    bp.song.watch("rating", ratingWatcher);
    bp.song.watch("scrobbleTime", updateScrobblePosition);
    bp.song.watch("loved", songLovedWatcher);
    bp.song.watch("scrobbled", scrobbledWatcher);
    
    bp.ratedCallbacks[typeClass] = ratedCallback;
    
    $(window).unload(function() {
      bp.settings.removeListener("layout", layoutWatcher);
      bp.localSettings.removeListener("lastfmSessionName", lastfmUserWatcher);
      bp.settings.removeListener("scrobble", scrobbleWatcher);
      bp.settings.removeListener("color", colorWatcher);
      bp.settings.removeListener("hideRatings", hideRatingsWatcher);
      
      bp.player.removeListener("repeat", repeatWatcher);
      bp.player.removeListener("shuffle", shuffleWatcher);
      bp.player.removeListener("ratingMode", ratingModeWatcher);
      bp.player.removeListener("playing", playingWatcher);
      bp.player.removeListener("volume", volumeWatcher);
      bp.player.removeListener("connected", connectedWatcher);
      bp.player.removeListener("playlistsList", renderPlaylistsList);
      bp.player.removeListener("playlist", renderPlaylist);
      bp.player.removeListener("albumContainers", renderAlbumContainers);
      
      bp.song.removeListener("info", songInfoWatcher);
      bp.song.removeListener("positionSec", positionSecWatcher);
      bp.song.removeListener("rating", ratingWatcher);
      bp.song.removeListener("scrobbleTime", updateScrobblePosition);
      bp.song.removeListener("loved", songLovedWatcher);
      bp.song.removeListener("scrobbled", scrobbledWatcher);
      
      bp.ratedCallbacks[typeClass] = null;
    });
    
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast") setToastAutocloseTimer();
  });

});