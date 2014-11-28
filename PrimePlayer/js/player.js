/**
 * This script does all the magic for the miniplayer, popup and toasts.
 * @author Sven Ackermann (svenrecknagel@googlemail.com)
 * @license BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var typeClass = bp.extractUrlParam("type", location.search) || "popup";
  var savedSizing;
  var navHistory = [];
  var currentNavList = {};
  var listRatingTimer;
  var ratingHtml;
  var getLastSongInfo;
  var lastSongInfo = false;

  if (typeClass == "popup") {
    bp.popupOpened();
    $("html").addClass("layout-normal");
  } else {
    bp.settings.watch("layout", function(val, old) {
      $("html").removeClass("layout-" + old).addClass("layout-" + val);
    }, typeClass);
  }

  function hideRatingsWatcher(val) {
    $("html").toggleClass("hideRatings", val);
    if (!val && lastSongInfo === false && getLastSongInfo) getLastSongInfo();
  }
  bp.settings.watch("hideRatings", hideRatingsWatcher, typeClass);

  function faviconWatcher(val) {
    $("#favicon").attr("href", val);
  }
  bp.player.watch("favicon", faviconWatcher, typeClass);

  function repeatWatcher(val) {
    $("#repeat").attr("class", val);
  }

  function shuffleWatcher(val) {
    $("#shuffle").attr("class", val);
    //reload list on shuffle if visible
    if (val == "ALL_SHUFFLE" &&
      currentNavList.controlLink == "#/ap/queue" &&
      currentNavList.titleList &&
      currentNavList.titleList.length > 0 &&
      $("#navlistContainer").children(".playlist").is(":visible")) {
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
      .attr("title", chrome.i18n.getMessage("lyricsFor", info.title))
      .addClass("nav")
      .data("options", {artist: info.artist, title: info.title});
  }
  
  function songInfoWatcher(val) {
    clearTimeout(listRatingTimer);
    if ($("body").hasClass("hasLastSong")) {
      $("body").removeClass("hasLastSong");
      renderRating(bp.song.rating);
      getLastSongInfo = null;
      lastSongInfo = false;
      $("#resume").removeClass("lastSongEnabled").unbind().click(googleMusicExecutor("playPause"));
    }
    $("body").toggleClass("hasSong", val !== null);
    if (val) {
      renderSongInfo(val);
      //although the value of scrobbleTime might have not changed, the relative position might have
      updateScrobblePosition(bp.song.scrobbleTime);
      if (bp.settings.lyricsAutoReload && $("#lyrics").is(":visible")) {
        var song = val.title;
        if (val.artist) song = val.artist + " - " + song;
        switchView(chrome.i18n.getMessage("lyricsTitle", song), "lyrics", null, {artist: val.artist, title: val.title});
      }
    } else {
      $("#cover").attr("src", "img/cover.png");
      $("#showlyrics").removeAttr("title").removeClass("nav").removeData("options");
    }
    var playlist = $("#navlistContainer").find(".playlist");
    if (playlist.is(":visible") && currentNavList.titleList) {
      var pl = currentNavList.titleList;
      var cur = playlist.children("div.current");
      if (cur.length > 0) {
        cur.removeClass("current");
        pl[parseInt(cur.data("index"))].current = false;
      }
      if (val) {
        for (var i = 0; i < pl.length; i++) {
          if (bp.songsEqual(pl[i], val)) {
            playlist.children("div[data-index='" + i + "']").addClass("current");
            pl[i].current = true;
            break;
          }
        }
      }
    }
  }

  function renderPosition(positionSec, durationSec, position) {
    $("#currentTime").text(position);
    $("#timeBar").css({width: durationSec > 0 ? (positionSec / durationSec * 100) + "%" : 0});
  }
  
  function positionSecWatcher(val) {
    renderPosition(val, bp.song.info && bp.song.info.durationSec || 0, bp.song.position);
  }

  function renderRating(rating) {
    $("#googleRating").removeClass().addClass("rating-" + rating);
  }
  
  function renderLastSong(lastSong) {
    $("body").addClass("hasLastSong");
    renderSongInfo(lastSong.info);
    renderPosition(lastSong.positionSec, lastSong.info.durationSec, lastSong.position);
    ratingModeWatcher(lastSong.ratingMode);
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
    if (bp.settings.showLastfmInfo || (!bp.settings.hideRatings && bp.localSettings.lastfmSessionName)) getLastSongInfo();
    
    if (lastSong.info.albumLink) {
      $("#resume").addClass("lastSongEnabled").unbind().click(bp.resumeLastSong.bind(window, lastSong));
    }
  }
  
  function ratingModeWatcher(val) {
    var body = $("body");
    body.removeClass("star-rating thumbs-rating");
    if (val) {
      body.addClass(val + "-rating");
    }
    ratingHtml = "";
    if (val == "star") {
      ratingHtml = "<div></div>";
      for (var i = 1; i <= 5; i++) ratingHtml += "<a tabindex='0' data-rating='" + i + "'></a>";
    } else if (val == "thumbs") {
      ratingHtml = "<a tabindex='0' data-rating='5'></a><a tabindex='0' data-rating='1'></a>";
    }
  }

  function ratingWatcher(val, old) {
    if (!$("body").hasClass("hasLastSong")) {
      renderRating(val);
      //if song info does not change within 1s, also update list rating (otherwise the rating changed because of a new song)
      clearTimeout(listRatingTimer);
      listRatingTimer = setTimeout(function() {
        var cur = $("#navlist.playlist .current");
        if (cur.length > 0) {
          cur.find(".rating").removeClass("r" + old).addClass("r" + val);
          currentNavList.titleList[cur.data("index")].rating = val;
        }
      }, 1000);
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
    target.toggleClass("nav", link !== "");
    if (link) {
      var text = bp.getTextForQuicklink(link);
      target.data({link: link, text: text}).attr("title", chrome.i18n.getMessage("openLink", text));
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
          sizing = bp.localSettings.miniplayerSizing;
          sizing[bp.settings.layout].width = window.outerWidth;
          sizing[bp.settings.layout].height = window.outerHeight;
          bp.localSettings.miniplayerSizing = sizing;//trigger listener notification
        } else if ($("#nav").is(":visible")) {
          var type = $("#quicklinks").is(":visible") ? "quicklinks" : $("#navlist").attr("class");
          sizingSetting = type + "Sizing";
        } else if ($("#lyrics").is(":visible")) {
          sizingSetting = "lyricsSizing";
        }
        if (sizingSetting) {
          sizing = bp.localSettings[sizingSetting];
          if (sizing) {
            sizing.width = window.outerWidth;
            sizing.height = window.outerHeight;
            bp.localSettings[sizingSetting] = sizing;//trigger listener notification
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
    $("body").toggleClass("lastfm", user !== null);
    if (user) {
      $("#lastfmUser")
        .attr("title", chrome.i18n.getMessage("lastfmUser") + user)
        .attr("href", "http://last.fm/user/" + user);
      if (!bp.settings.hideRatings && getLastSongInfo) getLastSongInfo();
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

  function connectedWatcher(val) {
    $("body").toggleClass("connected", val);
    if (!val) {
      restorePlayer();
      if (bp.settings.saveLastPosition) bp.getLastSong(renderLastSong);
    }
  }

  function resize(sizing) {
    if (typeClass == "miniplayer" || typeClass == "toast") {
      window.resizeTo(sizing.width, sizing.height);
    }
  }

  var renderNavList = {
    playlistsList: function(navlist, list) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = $("<div></div>");
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<a tabindex='0' class='album nav'></a>").data("link", e.titleLink).text(e.title).attr("title", e.title).appendTo(row);
        if (e.subTitleLink) {
          $("<a tabindex='0' class='nav'></a>").data("link", e.subTitleLink).text(e.subTitle).attr("title", e.subTitle).appendTo(row);
        } else if (e.subTitle) {
          $("<span></span>").text(e.subTitle).attr("title", e.subTitle).appendTo(row);
        }
        navlist.append(row);
      }
    },
    playlist: function(navlist, list, update) {
      if (!update) {
        currentNavList.titleList = [];
        currentNavList.noAlbum = true;
        currentNavList.noRating = true;
        currentNavList.duration = 0;
        $("#navHead").children("span").append("<span class='duration'></span>");
      }
      var current;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (currentNavList.titleList.length > e.index) continue;
        var row = $("<div data-index='" + e.index + (e.current ? "' class='current'>" : "'></div>"));
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<div class='rating r" + e.rating + "'>" + ratingHtml + "</div>").appendTo(row);
        if (e.rating >= 0) currentNavList.noRating = false;
        var info = $("<div class='info'></div>");
        var title;
        if (bp.localSettings.lyrics) {
          title = $("<a tabindex='0' class='nav' data-link='lyrics'></a>").data("options", {artist: e.artist, title: e.title}).attr("title", chrome.i18n.getMessage("lyricsFor", e.title));
        } else {
          title = $("<span></span>").attr("title", e.title);
        }
        title.text(e.title).appendTo(info);
        $("<span class='duration'></span>").text(e.duration).appendTo(info);
        currentNavList.duration += bp.parseSeconds(e.duration);
        if (e.artistLink) {
          $("<a tabindex='0' class='nav'></a>").data("link", e.artistLink).text(e.artist).attr("title", e.artist).appendTo(info);
        } else {
          $("<span></span>").text(e.artist).attr("title", e.artist).appendTo(info);
        }
        if (e.albumLink) {
          if (e.albumLink != currentNavList.link) {
            $("<a tabindex='0' class='album nav'></a>").data("link", e.albumLink).text(e.album).attr("title", e.album).appendTo(info);
            currentNavList.noAlbum = false;
          }
        } else if (e.album) {
          $("<span class='album'></span>").text(e.album).attr("title", e.album).appendTo(info);
          currentNavList.noAlbum = false;
        }
        row.append(info);
        navlist.append(row);
        currentNavList.titleList.push(e);
        if (e.current) current = row.get(0);
      }
      navlist.toggleClass("noalbum", currentNavList.noAlbum);
      navlist.toggleClass("norating", currentNavList.noRating);
      navlist.toggleClass("noduration", currentNavList.duration === 0);
      if (currentNavList.duration > 0) $("#navHead").find("span.duration").text("(" + bp.toTimeString(currentNavList.duration) + ")");
      if (current) current.scrollIntoView(true);
    },
    albumContainers: function(navlist, list) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = $("<div></div>");
        $("<img></img>").attr("src", e.cover || "img/cover.png").appendTo(row);
        $("<a tabindex='0' class='nav'></a>").data("link", e.link).text(e.title).attr("title", e.title).appendTo(row);
        navlist.append(row);
      }
    }
  };

  function updateListrating(val) {
    if (val === null || val.controlLink != currentNavList.controlLink) return;
    var e = currentNavList.titleList[val.index];
    $("#navlistContainer .playlist")
      .children("div[data-index='" + val.index + "']")
      .children("div.rating").removeClass("r" + e.rating).addClass("r" + val.rating);
    e.rating = val.rating;
  }

  function renderSubNavigationList(list, navlist, update) {
    var header = $("<h2></h2>").text(list.header);
    if (list.moreLink) $("<a tabindex='0' class='nav'></a>").data("link", list.moreLink).appendTo(header);
    navlist.append(header);
    var container = $("<div></div>").addClass(list.type).appendTo(navlist);
    renderNavList[list.type](container, list.list, update);
  }
  
  function renderNavigationList(val) {
    if (!val || val.link != currentNavList.link || val.search != currentNavList.search) return;
    bp.player.navigationList = null;//free memory
    currentNavList.controlLink = val.controlLink;
    var navlist = $("#navlist");
    if (val.error) {
      navlist.removeClass().html("<div class='error'></div>");
    } else if (val.empty) {
      navlist.removeClass().html("<div class='empty'></div>");
    } else {
      if (!val.update) {
        navlist.empty().removeClass().addClass(val.type);
        resize(bp.localSettings[val.type + "Sizing"]);
      }
      if (val.type == "searchresult") {
        $("#navHead").children("span").text(val.header);
        for (var i = 0; i < val.lists.length; i++) {
          var list = val.lists[i];
          if (list) renderSubNavigationList(list, navlist, val.update);
        }
        navlist.find("h2 a.nav").data("text", val.header).data("search", val.search).text(val.moreText);
      } else {
        renderNavList[val.type](navlist, val.list, val.update);
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
    if (result.src) credits.append($("<a target='_blank'></a>").attr("href", result.src).text(chrome.i18n.getMessage("lyricsSrc"))).append($("<br/>"));
    if (result.searchSrc) credits.append($("<a target='_blank'></a>").attr("href", result.searchSrc).text(chrome.i18n.getMessage("lyricsSearchResult")));
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
      currentNavList.titleList = null;//free memory
      navHistory.push(currentNavList);
    }
    currentNavList = {link: link, title: title, search: search, options: options};
    updateNavHead(title);
    $("#navlist").empty().removeClass();
    var lyrics = $("#lyrics");
    lyrics.removeClass().hide().children().empty();
    if (!search) $("#navHead > input").val("");
    $("#navlistContainer").hide();
    $("#quicklinks").hide();
    if (link == "quicklinks") {
      resize(bp.localSettings.quicklinksSizing);
      $("#quicklinks").show();
    } else if (link == "lyrics") {
      lyrics.addClass("loading");
      resize(bp.localSettings.lyricsSizing);
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
    var backHint = navHistory.length > 0 ? chrome.i18n.getMessage("backToLink", navHistory[navHistory.length - 1].title) : chrome.i18n.getMessage("backToPlayer");
    $("#navHead").children(".back").attr("title", backHint).end().children("span").text(title);
  }
  
  function setupNavigationEvents() {
    $("#navHead").find(".back").click(function() {
      if (navHistory.length === 0) restorePlayer();
      else {
        var current = navHistory.pop();
        currentNavList = {};
        if (current.search) $("#navHead > input").val(current.search);
        switchView(current.title, current.link, current.search, current.options);
      }
    });
    $("#navHead").find(".close").attr("title", chrome.i18n.getMessage("close")).click(restorePlayer);
    
    var searchInputTimer;
    $("#navHead > input").keyup(function() {
      clearTimeout(searchInputTimer);
      searchInputTimer = setTimeout(function() {
        var text = $.trim($("#navHead > input").val());
        if (text.length > 1) switchView(chrome.i18n.getMessage("searchResults"), "search", text);
      }, 500);
    });

    function ctrlHandler(urlField, e) {
      if (e.ctrlKey) {
        e.stopImmediatePropagation();
        var lastfmInfo = bp.song.lastfmInfo || lastSongInfo;
        if (lastfmInfo && lastfmInfo[urlField]) chrome.tabs.create({url: lastfmInfo[urlField]});
      }
    }
    
    $("#track").click(ctrlHandler.bind(window, "url"));
    $("#artist").click(ctrlHandler.bind(window, "artistUrl"));
    $("#album").click(ctrlHandler.bind(window, "albumUrl"));
    
    $("body").on("click", ".nav", function(e) {
      var link = $(this).data("link");
      if (link) {
        e.preventDefault();
        var options = $(this).data("options");
        var title;
        if (link == "lyrics") {
          if (bp.settings.openLyricsInMiniplayer == e.shiftKey) {
            bp.openLyrics(options);
            return;
          }
          if (!options) {
            if (!bp.song.info) return;
            options = {artist: bp.song.info.artist, title: bp.song.info.title};
          }
          var song = options.title;
          if (options.artist) song = options.artist + " - " + song;
          title = chrome.i18n.getMessage("lyricsTitle", song);
        } else title = $(this).data("text") || $(this).text();
        
        if (bp.settings.openLinksInMiniplayer == e.shiftKey && link != "quicklinks" && link != "lyrics") bp.selectLink(link);
        else switchView(title, link, $(this).data("search"), options);
      }
    });
    
    $(window).keyup(function(e) {
      if (e.keyCode == 27 && !$("#player").is(":visible")) {//ESC
        restorePlayer();
      } else if (e.keyCode == 81 && !bp.settings.hideSearchfield) {//q
        var inp = $("#navHead > input");
        if (!inp.is(":focus") && !inp.is(":disabled")) {
          if (!inp.is(":visible")) switchView(chrome.i18n.getMessage("quicklinks"), "quicklinks");
          $("#navHead > input").focus();
        }
      } else if (e.keyCode == 32 && !$("#navHead > input").is(":focus")) {//space
        bp.executePlayPause();
      }
    });

    $("#navlistContainer").on("click", ".playlistsList img", function() {
      bp.startPlaylist($(this).next("a").data("link"));
      restorePlayer();
    }).on("click", ".playlist img", function() {
      var div = $(this).parent();
      if (div.hasClass("current")) {
        bp.executeInGoogleMusic("playPause");
      } else {
        var index = div.data("index");
        bp.executeInGoogleMusic("startPlaylistSong", {link: currentNavList.controlLink, index: index});
      }
    }).on("click", ".playlist a[data-rating]", function() {
      var div = $(this).parent().parent();
      var rating = $(this).data("rating");
      if (div.hasClass("current")) {
        bp.rate(rating);
      } else {
        var index = div.data("index");
        var e = currentNavList.titleList[index];
        if (e.rating < 0) return;//negative ratings cannot be changed
        if (rating == 5 && bp.settings.linkRatings && !bp.isRatingReset(e.rating, rating)) bp.love({ title: e.title, artist: e.artist}, bp.noop);
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
    $("#repeat").click(googleMusicExecutor("toggleRepeat")).attr("title", chrome.i18n.getMessage("command_toggleRepeat"));
    $("#shuffle").click(googleMusicExecutor("toggleShuffle")).attr("title", chrome.i18n.getMessage("command_toggleShuffle"));
    $("#volume").click(toggleVolumeControl).attr("title", chrome.i18n.getMessage("volumeControl"));
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
      infoText = chrome.i18n.getMessage("lastfmInfo_userplaycount", lastfmInfo.userplaycount + "") +
        "\n" + chrome.i18n.getMessage("lastfmInfo_playcount", lastfmInfo.playcount + "") +
        "\n" + chrome.i18n.getMessage("lastfmInfo_listeners", lastfmInfo.listeners + "");
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
    var rat = $("#lastfmRating").removeClass("loved notloved error");
    var a = rat.find("a").unbind();
    if (typeof(loved) == "string") {
      rat.addClass("error");
      a.data("msg", chrome.i18n.getMessage("lastfmError") + loved).click(actions.getLastfmInfo);
    } else if (loved === true) {
      rat.addClass("loved");
      a.data("msg", chrome.i18n.getMessage("lastfmUnlove")).click(actions.unlove);
    } else if (loved === false) {
      rat.addClass("notloved");
      a.data("msg", chrome.i18n.getMessage("lastfmLove")).click(actions.love);
    }
    renderLastfmTitle(a);
  }
  
  function songLovedWatcher(loved) {
    renderSongLoved(loved, {getLastfmInfo: bp.loadCurrentLastfmInfo, unlove: bp.unloveTrack, love: bp.loveTrack});
  }

  function toggleVolumeControl() {
    if (bp.player.volume !== null) {
      $("#volumeBarContainer").toggle();
    }
  }

  function renderQuicklinks(val) {
    $("#quicklinks a.nav").each(function() {
      $(this).text(bp.getTextForQuicklink($(this).data("link")));
    });
    updateCoverClickLink(bp.settings.coverClickLink);
    updateTitleClickLink(bp.settings.titleClickLink);
    var searchPlaceholder = val && val.searchPlaceholder ? val.searchPlaceholder : chrome.i18n.getMessage("searchPlaceholder");
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
    $("head > title").first().text(chrome.i18n.getMessage("extTitle"));

    setupGoogleRating();
    renderPlayControls();

    $("#miniplayerlink")
      .click(bp.openMiniplayer)
      .attr("title", chrome.i18n.getMessage("openMiniplayer"));

    $("#feelingLucky")
      .click(bp.executeFeelingLucky)
      .attr("title", chrome.i18n.getMessage("feelingLucky"));

    $("#nosong").children("a:first-child").text(chrome.i18n.getMessage("nothingPlaying"))
      .end().children("a:last-child")
        .click(bp.openGoogleMusicTab)
        .text(chrome.i18n.getMessage("gotoGmusic"));

    $("#scrobblePosition").attr("title", chrome.i18n.getMessage("scrobblePosition"));
    $("#timeBarHolder").click(setSongPosition);

    $("#quicklinksBtn")
      .data("text", chrome.i18n.getMessage("quicklinks"))
      .attr("title", chrome.i18n.getMessage("showQuicklinks"));

    $("#lastfmInfo")
            .find(".userplaycount").html(chrome.i18n.getMessage("lastfmInfo_userplaycount", "<span></span>"))
      .end().find(".playcount").html(chrome.i18n.getMessage("lastfmInfo_playcount", "<span></span>"))
      .end().find(".listeners").html(chrome.i18n.getMessage("lastfmInfo_listeners", "<span></span>"));

    $("#lastfmUser")
      .on("contextmenu", function(e) {
        e.preventDefault();
        bp.settings.scrobble = !bp.settings.scrobble;
      });

    setupNavigationEvents();

    bp.localSettings.watch("lastfmSessionName", lastfmUserWatcher, typeClass);
    bp.localSettings.watch("lyrics", lyricsWatcher, typeClass);
    bp.localSettings.watch("lyricsFontSize", lyricsFontSizeWatcher, typeClass);
    
    bp.settings.watch("scrobble", scrobbleWatcher, typeClass);
    bp.settings.watch("showLastfmInfo", showLastfmInfoWatcher, typeClass);
    bp.settings.watch("color", colorWatcher, typeClass);
    bp.settings.watch("mpBgColor", mpBgColorWatcher, typeClass);
    bp.settings.watch("mpTextColor", mpTextColorWatcher, typeClass);
    bp.settings.watch("coverClickLink", updateCoverClickLink, typeClass);
    bp.settings.watch("titleClickLink", updateTitleClickLink, typeClass);
    bp.settings.watch("hideSearchfield", hideSearchfieldWatcher, typeClass);

    bp.player.watch("repeat", repeatWatcher, typeClass);
    bp.player.watch("shuffle", shuffleWatcher, typeClass);
    bp.player.watch("ratingMode", ratingModeWatcher, typeClass);
    bp.player.watch("playing", playingWatcher, typeClass);
    bp.player.watch("volume", volumeWatcher, typeClass);
    bp.player.watch("connected", connectedWatcher, typeClass);
    bp.player.watch("quicklinks", renderQuicklinks, typeClass);
    bp.player.addListener("navigationList", renderNavigationList, typeClass);
    bp.player.addListener("listrating", updateListrating, typeClass);

    bp.song.watch("info", songInfoWatcher, typeClass);
    bp.song.watch("positionSec", positionSecWatcher, typeClass);
    bp.song.watch("rating", ratingWatcher, typeClass);
    bp.song.watch("scrobbleTime", updateScrobblePosition, typeClass);
    bp.song.watch("loved", songLovedWatcher, typeClass);
    bp.song.watch("lastfmInfo", renderLastfmInfo, typeClass);
    bp.song.watch("scrobbled", scrobbledWatcher, typeClass);

    if (bp.settings.layout != "hbar") resize(bp.localSettings.miniplayerSizing[bp.settings.layout]);//try to restore saved size (chrome.windows.create does not always set the desired size)
    if (typeClass == "miniplayer" || typeClass == "toast") setupResizeMoveListeners();
    if (typeClass == "toast" && bp.settings.toastDuration > 0) setToastAutocloseTimer();

    if (bp.settings.saveLastPosition && bp.player.connected && bp.song.info === null) bp.getLastSong(renderLastSong);
    
    $(window).unload(function() {
      bp.localSettings.removeAllListeners(typeClass);
      bp.settings.removeAllListeners(typeClass);
      bp.player.removeAllListeners(typeClass);
      bp.song.removeAllListeners(typeClass);
    });
  });

});
