/**
 * This script does all the magic for the miniplayer, popup and toasts.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var typeClass = bp.extractUrlParam("type", location.search) || "popup";
  var savedSizing;
  var navHistory = [];
  var currentNavList = {};

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
    $("#resume").toggleClass("enabled", val != null);
    $("body").toggleClass("playing", val === true);
  }

  function songInfoWatcher(val) {
    $("body").toggleClass("hasSong", val != null);
    if (val) {
      $("#songTime").text(val.duration);
      $("#track").text(val.title);
      $("#artist").text(val.artist).attr("title", val.artist).data("link", val.artistLink);
      $("#album").text(val.album).attr("title", val.album).data("link", val.albumLink);
      $("#cover").attr("src", val.cover || "img/cover.png");
      //although the value of scrobbleTime might have not changed, the relative position might have
      updateScrobblePosition(bp.song.scrobbleTime);
    } else {
      $("#cover").attr("src", "img/cover.png");
    }
    if (currentNavList.type == "playlist" && currentNavList.list) {
      var pl = currentNavList.list;
      var cur = $("#navlist.playlist").children("div.current");
      if (cur.length > 0) {
        cur.removeClass("current");
        pl[parseInt(cur.data("index"))].current = false;
      }
      if (val) {
        for (var i = 0; i < pl.length; i++) {
          if (bp.songsEqual(pl[i], val)) {
            $("#navlist.playlist").children("div[data-index='" + i + "']").addClass("current");
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
    if ($("#navlist.playlist").is(":visible") && currentNavList.list && currentNavList.type == "playlist") {
      var row = $("#navlist.playlist").children("div.current");
      index = row.data("index");
      if (index) {
        currentNavList.list[index].rating = val;
        if (row.length > 0) {
          row.find("div.rating").removeClass("r" + old).addClass("r" + val);
        }
      }
    }
  }

  function updateScrobblePosition(scrobbleTime) {
    if (scrobbleTime >= 0 && bp.song.info && bp.song.info.durationSec > 0) {
      $("#scrobblePosition").addClass("songscrobble").css({left: (scrobbleTime / bp.song.info.durationSec * 100) + "%"});
    } else {
      $("#scrobblePosition").removeClass("songscrobble");
    }
  }
  
  function scrobbledWatcher(val) {
    $("body").toggleClass("scrobbled", val);
  }

  function scrobbleWatcher(val) {
    $("body").toggleClass("scrobbleEnabled", val);
  }

  function colorWatcher(val, old) {
    $("html").removeClass("color-" + old).addClass("color-" + val);
  }
  
  function coverClickLinkWatcher(val) {
    $("#coverContainer").toggleClass("clickable", val.length > 0);
  }
  
  function titleClickLinkWatcher(val) {
    $("#track, #nosong a:first-child").toggleClass("clickable", val.length > 0);
  }

  /** listen for resize events and poll for position changes to update the settings */
  function setupResizeMoveListeners() {
    var timerId;
    $(window).resize(function() {
      clearTimeout(timerId);
      timerId = setTimeout(function() {
        if (document.webkitHidden) return;//do not save size of minimized window
        if ($("#player").is(":visible")) {
          var sizing = bp.localSettings.miniplayerSizing;
          sizing[bp.settings.layout].width = window.innerWidth;
          sizing[bp.settings.layout].height = window.innerHeight;
          bp.localSettings.miniplayerSizing = sizing;//trigger listener notification
        } else if ($("#nav").is(":visible") && currentNavList.type) {
          var sizingSetting = currentNavList.type + "Sizing";
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
      if ($("#player").is(":visible") && (oldX != window.screenX || oldY != window.screenY) && !document.webkitHidden) {
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
  
  function switchBySetting(setting) {
    if (setting) {
      var view = setting.split(";");
      switchView(view[0], bp.getTextForQuicklink(setting), view[1]);
    }
  }
  
  function titleClicked() {
    switchBySetting(bp.settings.titleClickLink);
  }
  
  function connectedWatcher(val) {
    $("body").toggleClass("connected", val);
    $("#coverContainer").unbind();
    $("#nosong a:first-child").unbind();
    if (val) {
      $("#coverContainer").click(function() { switchBySetting(bp.settings.coverClickLink); });
      $("#nosong a:first-child").click(titleClicked);
    } else {
      restorePlayer();
    }
  }
  
  function resize(sizing) {
    if ((typeClass == "miniplayer" || typeClass == "toast") && sizing.width != null && sizing.height != null) {
      window.resizeTo(sizing.width, sizing.height);
    }
  }
  
  var renderNavList = {
    playlistsList: function(navlist, list) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = $("<div></div>");
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<a href='#' class='title' data-navtype='playlist'></a>").data("link", e.titleLink).text(e.title).attr("title", e.title).appendTo(row);
        if (e.subTitleLink) {
          $("<a href='#' data-navtype='playlistsList'></a>").data("link", e.subTitleLink).text(e.subTitle).attr("title", e.subTitle).appendTo(row);
        } else if (e.subTitle) {
          $("<span></span>").text(e.subTitle).attr("title", e.subTitle).appendTo(row);
        }
        navlist.append(row);
      }
    },
    playlist: function(navlist, list) {
      var ratingHtml = "";
      if (bp.player.ratingMode == "star") {
        ratingHtml += "<div></div>";
        for (var i = 1; i <= 5; i++) ratingHtml += "<a href='#' data-rating='" + i + "'></a>";
      } else if (bp.player.ratingMode == "thumbs") {
        ratingHtml = "<a href='#' data-rating='5'></a><a href='#' data-rating='1'></a>";
      }
      var noAlbum = true;
      var noRating = true;
      var noDuration = true;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = $("<div data-index='" + i + (e.current ? "' class='current'>" : "'></div>"));
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<div class='rating r" + e.rating + "'>" + ratingHtml + "</div>").appendTo(row);
        if (e.rating >= 0) noRating = false;
        var info = $("<div class='info'></div>");
        $("<span></span>").text(e.title).attr("title", e.title).appendTo(info);
        $("<span class='duration'></span>").text(e.duration).appendTo(info);
        if (e.duration) noDuration = false;
        if (e.artistLink) {
          $("<a href='#' data-navtype='playlistsList'></a>").data("link", e.artistLink).text(e.artist).attr("title", e.artist).appendTo(info);
        } else {
          $("<span></span>").text(e.artist).attr("title", e.artist).appendTo(info);
        }
        if (e.albumLink) {
          if (e.albumLink != currentNavList.link) {
            $("<a href='#' data-navtype='playlist'></a>").data("link", e.albumLink).text(e.album).attr("title", e.album).appendTo(info);
            noAlbum = false;
          }
        } else {
          $("<span></span>").text(e.album).attr("title", e.album).appendTo(info);
          noAlbum = false;
        }
        row.append(info);
        navlist.append(row);
      }
      if (noAlbum) navlist.addClass("noalbum");
      if (noRating) navlist.addClass("norating");
      if (noDuration) navlist.addClass("noduration");
    },
    albumContainers: function(navlist, list) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = $("<div></div>");
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<a href='#' data-navtype='playlistsList'></a>").data("link", e.link).text(e.title).attr("title", e.title).appendTo(row);
        navlist.append(row);
      }
    }
  };
  
  function updateListrating(val) {
    if (val == null || val.controlLink != currentNavList.controlLink) return;
    var e = currentNavList.list[val.index];
    $("#navlist.playlist")
      .children("div[data-index='" + val.index + "']")
      .children("div.rating").removeClass("r" + e.rating).addClass("r" + val.rating);
    e.rating = val.rating;
  }
  
  function renderNavigationList(val) {
    if (val == null || val.link != currentNavList.link) return;
    currentNavList.list = val.list;
    currentNavList.controlLink = val.controlLink;
    var navlist = $("#navlist");
    navlist.removeClass("loading").addClass(currentNavList.type);
    if (val.error) {
      navlist.html("<div class='error'></div>");
    } else if (currentNavList.list.length == 0) {
      navlist.html("<div class='empty'></div>");
    } else {
      resize(bp.localSettings[currentNavList.type + "Sizing"]);
      renderNavList[currentNavList.type](navlist.empty(), currentNavList.list);
    }
  }
  
  function switchView(type, title, link) {
    if ($("#player").is(":visible") && (typeClass == "miniplayer" || typeClass == "toast")) {
      savedSizing = {
        height: window.outerHeight,
        width: window.outerWidth,
        screenX: window.screenX - screen.availLeft,
        screenY: window.screenY
      }
    }
    $("#player").hide();
    if (currentNavList.type) {
      currentNavList.list = null;
      navHistory.push(currentNavList);
    }
    currentNavList = {type: type, link: link, title: title};
    updateNavHead(title);
    $("#navlist").empty().removeClass();
    if (type == "quicklinks") {
      $("#navlistContainer").hide();
      resize(bp.localSettings["quicklinksSizing"]);
      $("#quicklinks").show();
    } else {
      $("#quicklinks").hide();
      $("#navlist").addClass("loading");
      $("#navlistContainer").show();
      bp.loadNavigationList(link, type);
    }
    $("#nav").show();
  }
  
  function restorePlayer() {
    $("#nav").hide();
    $("#navlist").empty();
    if (savedSizing != null) {
      resize(savedSizing);
      window.moveTo(savedSizing.screenX, savedSizing.screenY);
      savedSizing = null;
    }
    navHistory = [];
    currentNavList = {};
    bp.player.navigationList = null;
    $("#player").show();
  }

  function updateNavHead(title) {
    var backBtn = $("#navHead").find(".back");
    if (navHistory.length > 0) {
      backBtn.attr("title", navHistory[navHistory.length - 1].title);
    } else {
      backBtn.removeAttr("title");
    }
    backBtn.toggleClass("disabled", navHistory.length == 0);
    $("#navHead").find("span").text(title);
  }
  
  function setupNavigationEvents() {
    $("#navHead").find(".back").click(function() {
      var current = navHistory.pop();
      currentNavList = {};
      switchView(current.type, current.title, current.link);
    });
    $("#navHead").find(".close").attr("title", chrome.i18n.getMessage("close")).click(restorePlayer);
    
    $("body").on("click", "a[data-navtype]", function() {
      switchView($(this).data("navtype"), $(this).text(), $(this).data("link"));
    });
    
    $("#nav").on("click", "#navlist.playlistsList img", function() {
      bp.startPlaylist($(this).next("a").data("link"));
      restorePlayer();
    }).on("click", "#navlist.playlist img", function() {
      var div = $(this).parent();
      if (div.hasClass("current")) {
        bp.executeInGoogleMusic("playPause");
      } else {
        var index = div.data("index");
        bp.executeInGoogleMusic("startPlaylistSong", {link: currentNavList.controlLink, index: index});
      }
    }).on("click", "#navlist.playlist a[data-rating]", function() {
      var div = $(this).parent().parent();
      var rating = $(this).data("rating");
      if (div.hasClass("current")) {
        bp.rate(rating);
      } else {
        var index = div.data("index");
        var e = currentNavList.list[index];
        if (e.rating < 0) return;//negative ratings cannot be changed
        var reset = bp.isRatingReset(e.rating, rating);
        if (bp.settings.linkRatings && rating == 5 && !reset) bp.loveTrack(null, { info: { title: e.title, artist: e.artist} });
        bp.executeInGoogleMusic("ratePlaylistSong", {link: currentNavList.controlLink, index: index, rating: rating});
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
  
  function renderQuicklinks(val) {
    if (val) {
      $("#quicklinks a[data-link='now']").text(val.texts.now);
      $("#quicklinks a[data-link='artists']").text(val.texts.artists);
      $("#quicklinks a[data-link='albums']").text(val.texts.albums);
      $("#quicklinks a[data-link='genres']").text(val.texts.genres);
      $("#quicklinks a[data-link='rd']").text(val.texts.rd);
      $("#quicklinks a[data-link='myPlaylists']").text(chrome.i18n.getMessage("myPlaylists"));
      var apl = $("#qlAutoPlaylists").empty();
      for (var link in val.autoPlaylists) {
        $("<a href='#' data-navtype='playlist'></a>").data("link", link).text(val.autoPlaylists[link]).appendTo(apl);
      }
    }
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

    $("#track").click(titleClicked);
    
    $("#scrobblePosition").attr("title", chrome.i18n.getMessage("scrobblePosition"));
    $("#timeBarHolder").click(setSongPosition);
    
    $("#quicklinksBtn")
      .click(function() { switchView("quicklinks", chrome.i18n.getMessage("quicklinks")); })
      .attr("title", chrome.i18n.getMessage("showQuicklinks"));
    
    setupNavigationEvents();
    
    bp.localSettings.watch("lastfmSessionName", lastfmUserWatcher);
    bp.settings.watch("scrobble", scrobbleWatcher);
    bp.settings.watch("color", colorWatcher);
    bp.settings.watch("coverClickLink", coverClickLinkWatcher);
    bp.settings.watch("titleClickLink", titleClickLinkWatcher);
    
    bp.player.watch("repeat", repeatWatcher);
    bp.player.watch("shuffle", shuffleWatcher);
    bp.player.watch("ratingMode", ratingModeWatcher);
    bp.player.watch("playing", playingWatcher);
    bp.player.watch("volume", volumeWatcher);
    bp.player.watch("connected", connectedWatcher);
    bp.player.watch("quicklinks", renderQuicklinks);
    bp.player.addListener("navigationList", renderNavigationList);
    bp.player.addListener("listrating", updateListrating);
    
    bp.song.watch("info", songInfoWatcher);
    bp.song.watch("positionSec", positionSecWatcher);
    bp.song.watch("rating", ratingWatcher);
    bp.song.watch("scrobbleTime", updateScrobblePosition);
    bp.song.watch("loved", songLovedWatcher);
    bp.song.watch("scrobbled", scrobbledWatcher);
    
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast") setToastAutocloseTimer();
    
    $(window).unload(function() {
      bp.settings.removeListener("layout", layoutWatcher);
      bp.localSettings.removeListener("lastfmSessionName", lastfmUserWatcher);
      bp.settings.removeListener("scrobble", scrobbleWatcher);
      bp.settings.removeListener("color", colorWatcher);
      bp.settings.removeListener("coverClickLink", coverClickLinkWatcher);
      bp.settings.removeListener("titleClickLink", titleClickLinkWatcher);
      bp.settings.removeListener("hideRatings", hideRatingsWatcher);
      
      bp.player.removeListener("repeat", repeatWatcher);
      bp.player.removeListener("shuffle", shuffleWatcher);
      bp.player.removeListener("ratingMode", ratingModeWatcher);
      bp.player.removeListener("playing", playingWatcher);
      bp.player.removeListener("volume", volumeWatcher);
      bp.player.removeListener("connected", connectedWatcher);
      bp.player.removeListener("quicklinks", renderQuicklinks);
      bp.player.removeListener("navigationList", renderNavigationList);
      bp.player.removeListener("listrating", updateListrating);
      
      bp.song.removeListener("info", songInfoWatcher);
      bp.song.removeListener("positionSec", positionSecWatcher);
      bp.song.removeListener("rating", ratingWatcher);
      bp.song.removeListener("scrobbleTime", updateScrobblePosition);
      bp.song.removeListener("loved", songLovedWatcher);
      bp.song.removeListener("scrobbled", scrobbledWatcher);
    });
  });

});