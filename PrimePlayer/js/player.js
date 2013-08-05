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

  function repeatWatcher(val) {
    $("#repeat").attr("class", val);
  }

  function shuffleWatcher(val) {
    $("#shuffle").attr("class", val);
  }

  function playlistsWatcher(val) {
    $("body").toggleClass("playlists", val.length > 0);
    if ($("#playlists").is(":visible")) {
      if (val.length > 0) {
        showPlaylists(true);//re-render
      } else {
        hidePlaylists();
      }
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
      $("#artist").text(val.artist).attr("title", val.artist);
      $("#album").text(val.album).attr("title", val.album);
      $("#cover").attr("src", val.cover || "img/cover.png");
      //although the value of scrobbleTime might have not changed, the relative position might have
      updateScrobblePosition(bp.song.scrobbleTime);
    } else {
      $("#cover").attr("src", "img/cover.png");
    }
    var plQueue = $("#queue").children("div.current");
    if (plQueue.length > 0) {
      plQueue.removeClass("current");
      var q = bp.player.queue;
      q[parseInt(plQueue.data("index"))].current = false;
      if (val) {
        for (var i = 0; i < q.length; i++) {
          if (bp.songsEqual(q[i], val)) {
            $("#queue").children("div[data-index='" + i + "']").addClass("current");
            q[i].current = true;
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

  function scrobbleWatcher(val) {
    $("body").toggleClass("scrobbleEnabled", val);
  }

  function colorWatcher(val, old) {
    $("html").removeClass("color-" + old).addClass("color-" + val);
  }
  
  function hideRatingsWatcher(val) {
    $("body").toggleClass("hideRatings", val);
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
          if ($("#playlists").is(":visible")) {
            sizingSetting = "playlistsSizing";
          } else if ($("#listenNow").is(":visible")) {
            sizingSetting = "listenNowSizing";
          } else if ($("#queue").is(":visible")) {
            sizingSetting = "queueSizing";
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
    if (val) {
      $("#coverContainer").click(showListenNow);
      $("#cover").attr("title", chrome.i18n.getMessage("showListenNow"));
    } else {
      $("#listenNow").hide();
      $("#queue").hide();
      $("#playlists").hide();
      restorePlayerSizing();
      $("#player").show();
    }
  }
  
  function resize(sizing) {
    if ((typeClass == "miniplayer" || typeClass == "toast") && sizing.width != null && sizing.height != null) {
      window.resizeTo(sizing.width, sizing.height);
    }
  }
  
  function savePlayerSizing() {
    if (typeClass == "miniplayer" || typeClass == "toast") {
      savedSizing = {
        height: window.outerHeight,
        width: window.outerWidth,
        screenX: window.screenX,
        screenY: window.screenY
      }
    }
  }
  
  function restorePlayerSizing() {
    if (savedSizing != null) {
      resize(savedSizing);
      window.moveTo(savedSizing.screenX, savedSizing.screenY);
      savedSizing = null;
    }
  }
  
  function showPlaylists(rerender) {
    if (!(rerender == true)) savePlayerSizing();
    var playlistSectionTitle = chrome.i18n.getMessage("playlists");
    var playlists = bp.player.playlists;
    var playlistLinks = "";
    for (var i = 0; i < playlists.length; i++) {
      playlistLinks += "<div><a href='#' data-link='" + playlists[i][0] + "' title='" + playlists[i][1] + "'>" + playlists[i][1] + "</a></div>";
    }
    $("#playlistContainer").html("<h2>" + playlistSectionTitle + "</h2>" + playlistLinks);
    $("#playlistContainer a").click(function() { playlistStart($(this).data("link")); });
    $("#player").hide();
    $("#playlists").unbind().click(hidePlaylists).show();
    if (!(rerender == true)) resize(bp.localSettings.playlistsSizing);
  }

  function hidePlaylists() {
    $("#playlists").hide();
    restorePlayerSizing();
    $("#player").show();
  }

  function renderListenNow(val) {
    bp.player.removeListener("listenNowList", renderListenNow);
    resize(bp.localSettings.listenNowSizing);
    var html = "";
    for (var i = 0; i < val.length; i++) {
      var e = val[i];
      html += "<div>";
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<a href='#' data-link='" + e.titleLink + "'>" + e.title + "</a>";
      if (e.subTitleLink) {
        html += "<a href='#' data-link='" + e.subTitleLink + "'>" + e.subTitle + "</a>";
      } else {
        html += "<span>" +  e.subTitle + "</span>";
      }
      html += "</div>";
    }
    $("#listenNow").removeClass("loading").html(html).find("span, a").each(function() {
      $(this).attr("title", $(this).text());
    });
  }
  
  function showListenNow() {
    savePlayerSizing();
    $("#player").hide();
    $("#listenNow").empty().addClass("loading").click(hideListenNow).show();
    bp.player.addListener("listenNowList", renderListenNow);
    bp.loadListenNow();
  }

  function hideListenNow() {
    bp.player.removeListener("listenNowList", renderListenNow);
    $("#listenNow").hide();
    restorePlayerSizing();
    $("#player").show();
  }
  
  function setupListenNowEvents() {
    $("#listenNow").on("click", "a", function() {
      selectLink($(this).data("link"));
      return false;
    }).on("click", "img", function() {
      playlistStart($(this).next("a").data("link"));
    });
  }

  function renderQueue(val) {
    resize(bp.localSettings.queueSizing);
    var html = "";
    var ratingHtml = "";
    if (bp.player.ratingMode == "star") {
      ratingHtml += "<div></div>";
      for (var i = 1; i <= 5; i++) ratingHtml += "<a href='#' data-rating='" + i + "'></a>";
    } else if (bp.player.ratingMode == "thumbs") {
      ratingHtml = "<a href='#' data-rating='5'></a><a href='#' data-rating='1'></a>";
    }
    for (var i = 0; i < val.length; i++) {
      var e = val[i];
      html += "<div data-index='" + i + (e.current ? "' class='current'>" : "'>");
      html += "<img src='" + (e.cover || "img/cover.png") + "'/>";
      html += "<div class='rating r" + e.rating + "'>" + ratingHtml + "</div>";
      html += "<div><span title=' (" + e.duration + ")'>" + e.title + "</span>";
      if (e.artistLink) {
        html += "<a class='artist' href='#'>" + e.artist + "</a>";
      } else {
        html += "<span>" + e.artist + "</span>";
      }
      html += "</div></div>";
    }
    $("#queue").removeClass("loading").html(html).find("span, a.artist").each(function() {
      $(this).attr("title", $(this).text() + ($(this).attr("title") || ""));
    });
  }
  
  function showQueue() {
    savePlayerSizing();
    $("#player").hide();
    $("#queue").empty().addClass("loading").click(hideQueue).show();
    bp.player.addListener("queue", renderQueue);
    bp.loadQueue();
  }

  function hideQueue() {
    bp.player.removeListener("queue", renderQueue);
    $("#queue").hide().empty();
    restorePlayerSizing();
    $("#player").show();
  }
  
  function setupQueueEvents() {
    $("#queue").on("click", "a[data-rating]", function() {
      var div = $(this).parent().parent();
      var rating = $(this).data("rating");
      if (div.hasClass("current")) {
        bp.rate(rating);
      } else {
        var index = div.data("index");
        bp.rateQueueSong(index, rating);
      }
      return false;
    }).on("click", "div > img", function() {
      var div = $(this).parent();
      if (div.hasClass("current")) return false;
      var index = div.data("index");
      bp.executeInGoogleMusic("startQueueSong", {index: index});
    }).on("click", "a.artist", function() {
      var index = $(this).parent().parent().data("index");
      selectLink(bp.player.queue[index].artistLink);
    });
  }

  function ratedCallback(rating, old, index) {
    if ($("#queue").is(":visible")) {
      var row;
      if (index === undefined) {
        row = $("#queue").children("div.current");
        index = row.data("index");
      } else {
        row = $("#queue").children("div[data-index='" + index + "']");
      }
      bp.player.queue[index].rating = rating;
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
    $("#playlistButton").click(showPlaylists).attr("title", chrome.i18n.getMessage("showPlaylists"));
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

  function playlistStart(pllink) {
    bp.executeInGoogleMusic("startPlaylist", {pllink: pllink});
  }

  function setSongPosition(event) {
    bp.setSongPosition(event.offsetX / $(this).width());
  }

  function setVolume(event) {
    bp.setVolume(event.offsetX / $(this).width());
  }

  function selectLink(link) {
    if (link) {
      bp.selectInGoogleMusic(link);
      bp.openGoogleMusicTab();
    }
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

    $("#track").click(showQueue).attr("title", chrome.i18n.getMessage("showQueue"));
    $("#artist").click(function() { selectLink(bp.song.info.artistLink); });
    $("#album").click(function() { selectLink(bp.song.info.albumLink); });
    
    $("#scrobblePosition").attr("title", chrome.i18n.getMessage("scrobblePosition"));
    $("#timeBarHolder").click(setSongPosition);
    
    setupListenNowEvents();
    setupQueueEvents();
    
    bp.localSettings.watch("lastfmSessionName", lastfmUserWatcher);
    bp.settings.watch("scrobble", scrobbleWatcher);
    bp.settings.watch("color", colorWatcher);
    bp.settings.watch("hideRatings", hideRatingsWatcher);
    
    bp.player.watch("repeat", repeatWatcher);
    bp.player.watch("shuffle", shuffleWatcher);
    bp.player.watch("playlists", playlistsWatcher);
    bp.player.watch("ratingMode", ratingModeWatcher);
    bp.player.watch("playing", playingWatcher);
    bp.player.watch("volume", volumeWatcher);
    bp.player.watch("connected", connectedWatcher);
    
    bp.song.watch("info", songInfoWatcher);
    bp.song.watch("positionSec", positionSecWatcher);
    bp.song.watch("rating", ratingWatcher);
    bp.song.watch("scrobbleTime", updateScrobblePosition);
    bp.song.watch("loved", songLovedWatcher);
    
    bp.ratedCallbacks[typeClass] = ratedCallback;
    
    $(window).unload(function() {
      bp.settings.removeListener("layout", layoutWatcher);
      bp.localSettings.removeListener("lastfmSessionName", lastfmUserWatcher);
      bp.settings.removeListener("scrobble", scrobbleWatcher);
      bp.settings.removeListener("color", colorWatcher);
      bp.settings.removeListener("hideRatings", hideRatingsWatcher);
      
      bp.player.removeListener("repeat", repeatWatcher);
      bp.player.removeListener("shuffle", shuffleWatcher);
      bp.player.removeListener("playlists", playlistsWatcher);
      bp.player.removeListener("ratingMode", ratingModeWatcher);
      bp.player.removeListener("playing", playingWatcher);
      bp.player.removeListener("volume", volumeWatcher);
      bp.player.removeListener("connected", connectedWatcher);
      bp.player.removeListener("listenNowList", renderListenNow);
      bp.player.removeListener("queue", renderQueue);
      
      bp.song.removeListener("info", songInfoWatcher);
      bp.song.removeListener("positionSec", positionSecWatcher);
      bp.song.removeListener("rating", ratingWatcher);
      bp.song.removeListener("scrobbleTime", updateScrobblePosition);
      bp.song.removeListener("loved", songLovedWatcher);
      
      bp.ratedCallbacks[typeClass] = null;
    });
    
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast") setToastAutocloseTimer();
  });

});