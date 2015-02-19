/**
 * This is the script for the options page.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */

chrome.runtime.getBackgroundPage(function(bp) {

  var thisTabId;
  var context = "options";
  var settingsView = $("#settings");
  var i18n = chrome.i18n.getMessage;
  var settings = bp.settings;
  var localSettings = bp.localSettings;
    
  /** request and store last.fm session info */
  function getLastfmSession(token) {
    var status = $("#lastfmStatus");
    status.find(".loader").show();
    bp.lastfm.auth.getSession({token: token},
      {
        success: function(response) {
          status.find(".loader").hide();
          bp.setLastfmSession(response.session);
          status.find(".success").attr("title", i18n("lastfmConnectSuccess")).show();
        },
        error: function(code, message) {
          status.find(".loader").hide();
          var title = i18n("lastfmConnectError");
          if (message) title += ": " + message;
          status.find(".failure").attr("title", title).show();
          bp.gaEvent("LastFM", "AuthorizeError-" + code);
        }
      }
    );
  }

  function setSubsEnabled(id, enabled) {
    $("#" + id).nextUntil("*:not(.sub)").children("input").prop("disabled", !enabled);
  }
  
  function scrobbleChanged(val) {
    var se = bp.isScrobblingEnabled();
    $("#_showScrobbledIndicator").prop("disabled", !se);
    $("#_scrobble").prop("checked", val);
    setSubsEnabled("scrobble", se);
  }

  function linkRatingsChanged() {
    setSubsEnabled("linkRatings", settings.linkRatings && localSettings.lastfmSessionName);
  }
  
  function toastChanged() {
    $("#_toast").prop("checked", settings.toast);
    $("#_toastIfMpOpen, #_toastNotIfGmActive, #_toastDuration").prop("disabled", !settings.toast);
    $("#_toastIfMpMinimized").prop("disabled", !settings.toast || !settings.toastIfMpOpen);
    $("#_toastUseMpStyle").prop("disabled", !settings.toast || !localSettings.notificationsEnabled);
    $("fieldset.toast > .notif").children("input, select").prop("disabled", !settings.toast || settings.toastUseMpStyle);
    $("#toast").children(".hint").toggle(!settings.toastIfMpOpen);
  }
  
  function lyricsChanged() {
    setSubsEnabled("lyrics", localSettings.lyrics);
    $("#_lyricsWidth").prop("disabled", !localSettings.lyrics || !settings.lyricsInGpm);
    $("option.lyrics").prop("disabled", !localSettings.lyrics);
  }
  
  function lastfmUserChanged(user) {
    var action;
    var actionText;
    $("#_scrobble, #_linkRatings, #_showLovedIndicator, option.lastfm").prop("disabled", !user);
    scrobbleChanged(settings.scrobble);
    linkRatingsChanged();
    var links = $("#lastfmStatus").find("a");
    var userLink = links.first();
    if (user) {
      action = bp.lastfmLogout;
      actionText = i18n("logout");
      userLink.text(user).attr("href", "http://last.fm/user/" + user).removeClass("disconnected");
    } else {
      action = bp.lastfmLogin;
      actionText = i18n("connect");
      userLink.text(i18n("disconnected")).removeAttr("href").addClass("disconnected");
    }
    links.last().text(actionText).unbind().click(action);
  }

  function iconClickChanged() {
    if (!settings.iconClickAction0) settings.iconClickAction1 = "";
    if (!settings.iconClickAction1) settings.iconClickAction2 = "";
    if (!settings.iconClickAction2) settings.iconClickAction3 = "";
    var noClickTime = $("#_iconDoubleClickTime").prop("disabled", !settings.iconClickAction0).val() == "0";
    $("#_iconClickAction1").prop("disabled", !settings.iconClickAction0 || noClickTime).val(settings.iconClickAction1);
    $("#_iconClickAction2").prop("disabled", !settings.iconClickAction1 || noClickTime).val(settings.iconClickAction2);
    $("#_iconClickAction3").prop("disabled", !settings.iconClickAction2 || noClickTime).val(settings.iconClickAction3);
  }
  
  function showProgressChanged() {
    setSubsEnabled("showProgress", settings.showProgress);
  }

  function saveLastPositionChanged() {
    $("option[value='resumeLastSong']").prop("disabled", !settings.saveLastPosition);
  }
  
  function notificationsEnabledChanged(val) {
    settingsView.toggleClass("notifDisabled", !val);
    if (!val && settings.toast && !settings.toastUseMpStyle) $("#_toastUseMpStyle").click();//use click here to change the checkbox value
    else toastChanged();//in if clause this is triggered by the click listener on #toastUseMpStyle
  }
  
  var countdownInterval;
  function updateTimerStatus(timerEnd) {
    var countdown = Math.floor((timerEnd || 0) - ($.now() / 1000));
    if (countdown > 0) {
      $("#timerStatus").text(i18n("timerAction_" + localSettings.timerAction) + " in " + bp.toTimeString(countdown));
    } else {
      $("#timerStatus").empty();
      clearInterval(countdownInterval);
    }
  }
  
  function timerEndChanged(timerEnd) {
    clearInterval(countdownInterval);
    if (timerEnd) {
      countdownInterval = setInterval(updateTimerStatus.bind(window, timerEnd), 1000);
    }
    updateTimerStatus(timerEnd);
    $("#startTimer, #timerMin, #timerNotify, #timerPreNotify, #timerAction").prop("disabled", timerEnd !== 0);
    $("#stopTimer").prop("disabled", !timerEnd);
  }
  
  function ratingModeChanged(val) {
    settingsView.removeClass("star thumbs");
    if (val) settingsView.addClass(val);
    $("#_skipRatedLower option[value='2']").text(i18n("setting_skipRatedLower_2" + (val == "star" ? "_stars" : "")));
    $("option[value='rate-1'], option[value='rate-5']").each(function() {
      $(this).text(bp.getCommandOptionText($(this).attr("value")));
    });
  }
  
  function quicklinksChanged() {
    var linkSelects = $("#_coverClickLink,#_titleClickLink");
    linkSelects.empty();
    [""].concat(bp.getQuicklinks()).forEach(function(ql) {
      $("<option>").attr("value", ql).text(bp.getTextForQuicklink(ql)).appendTo(linkSelects);
    });
    linkSelects.each(function() {
      $(this).val(settings[this.id.substr(1)]);
    });
  }
  
  function stringUpdater(prop, theSettings) {
    return function() { theSettings[prop] = $(this).val(); };
  }

  function numberUpdater(prop, theSettings) {
    return function() { theSettings[prop] = parseFloat($(this).val()); };
  }

  function boolUpdater(prop, theSettings) {
    return function() { theSettings[prop] = !theSettings[prop]; };
  }

  /**
   * Appends a question mark symbol to the container and links it with a new element for the hint text.
   * @return the empty jQuery <p> element for the hint text, NOT added to the DOM yet
   */
  function appendHint(container) {
    var hint = $("<p class='hint-text'></p>");
    $("<img src='img/hint.png' class='hint'/>").click(function() {hint.slideToggle("fast");}).appendTo(container);
    return hint;
  }
  
  /**
   * Adds a question mark symbol for an option and an element containing the hint text, that will be toggled on click on the symbol.
   * The i18n key for the hint is "setting_" + prop + "Hint".
   * @return the added hint element
   */
  function initHint(prop) {
    var container = $("#" + prop);
    var hint = appendHint(container);
    hint.html(i18n("setting_" + prop + "Hint")).appendTo(container);
    return hint;
  }

  /** the i18n key for the label is "setting_" + prop */
  function addLabel(input) {
    return $("<label>").attr("for", input.attr("id")).text(i18n("setting_" + input.parent().attr("id"))).insertAfter(input);
  }
  
  function setIdAndAddItWithLabel(input, prop) {
    input.attr("id", "_" + prop);
    $("#" + prop).append(input);
    return addLabel(input);
  }
  
  /**
   * Initialize a checkbox input for an option.
   * @param prop the option name
   * @param theSettings the settings object, defaults to settings
   * @return the checkbox input element
   */
  function initCheckbox(prop, theSettings) {
    theSettings = theSettings || settings;
    var input = $("<input type='checkbox'>");
    input.prop("checked", theSettings[prop]).click(boolUpdater(prop, theSettings));
    setIdAndAddItWithLabel(input, prop);
    return input;
  }

  /**
   * Initialize a number input for an option.
   * @param prop the option name
   * @param min the minimum value to set, or null/undefined if not needed
   * @param max the maximum value to set, or null/undefined if not needed
   * @param theSettings the settings object, defaults to settings
   * @return the number input element
   */
  function initNumberInput(prop, min, max, theSettings) {
    theSettings = theSettings || settings;
    var input = $("<input type='number'>").attr("min", min).attr("max", max);
    input.val(theSettings[prop]).blur(numberUpdater(prop, theSettings));
    setIdAndAddItWithLabel(input, prop);
    return input;
  }

  /**
   * Initialize a select input for an option.
   * @param prop the option name in settings
   * @param values array with the values for the options
   * @param getOptionText function that takes the option's value as argument and returns the label for the option, the default i18n key for option "<opt>" is "setting_" + prop + "_<opt>"
   * @param updater a custom updater for the option's value, defaults to "stringUpdater"
   * @return the select input element
   */
  function initSelect(prop, values, getOptionText, updater) {
    getOptionText = getOptionText || function(val) {return i18n("setting_" + prop + "_" + val);};
    updater = updater || stringUpdater;
    var input = $("<select>");
    values.forEach(function(value) {
      $("<option>").attr("value", value).text(getOptionText(value)).appendTo(input);
    });
    input.val(settings[prop]).change(updater(prop, settings));
    setIdAndAddItWithLabel(input, prop);
    return input;
  }
  
  /**
   * Initialize a select input for an option based on the options of another select input.
   * @param prop the option name in settings
   * @param from the other select input as jQuery object
   * @return the select input element
   */
  function initSelectFrom(prop, from) {
    var select = initSelect(prop, []);
    select.append(from.children().clone()).val(settings[prop]);
    return select;
  }
  
  /**
   * Initialize a color input for an option.
   * @param prop the option name in settings
   * @return the color input element
   */
  function initColorInput(prop) {
    var input = $("<input type='color'>");
    input.val(settings[prop]).change(stringUpdater(prop, settings));
    setIdAndAddItWithLabel(input, prop);
    return input;
  }
  
  /** Initialize the icon style radio buttons. */
  function initIconStyle() {
    var iconStyle = $("#iconStyle");
    $("<label>").text(i18n("setting_iconStyle")).appendTo(iconStyle);
    ["default", "grey", "phones", "phones-grey", "phones-app", "phones-beta", "play"].forEach(function(value) {
      $("<input type='radio' name='iconStyle'>").attr("value", value).click(stringUpdater("iconStyle", settings)).appendTo(iconStyle);
      $("<img src='img/icon/" + value + "/connected.png'>").appendTo(iconStyle);
    });
    iconStyle.find("input[value='" + settings.iconStyle + "']").prop("checked", true);
  }
  
  /** Handle the optional lyrics permission. */
  function initLyricsProviders(lyrics) {
    var providers = localSettings.lyricsProviders;
    
    lyrics.prop("disabled", !providers.length);
    
    function sortProviders() {
      var prev = $("#legendLyrics");
      providers.forEach(function(p) {
        var current = $("#lyrics_" + p);
        current.insertAfter(prev);
        prev = current;
      });
    }

    $(".lyrics-providers").each(function() {
      var div = $(this);
      var id = div.attr("id");
      var providerName = id.substr(7);
      var provider = bp.lyricsProviders[providerName];
      
      var checkbox = $("<input type='checkbox'>");
      var label = setIdAndAddItWithLabel(checkbox, id);
      var link = $("<a target='_blank'>").attr("href", provider.getHomepage()).text(provider.getUrl());
      label.html(link);
      
      function setDraggable(draggable) {
        div.attr("draggable", draggable);
        
        function isValidDroptarget(ev) {
          var types = ev.originalEvent.dataTransfer.types;
          return types.indexOf("srcprovider/" + providerName) < 0 && types.indexOf("srcprovider") >= 0;
        }
        
        if (draggable) {
          div.on("dragover", function(ev) {
            //allow dropping (by returning false) only if not dragged over this provider and if source is another provider
            return !isValidDroptarget(ev);
          }).on("dragenter", function(ev) {
            if (isValidDroptarget(ev)) div.addClass("dragging");
          }).on("dragleave", function() {
            div.removeClass("dragging");
          }).on("dragstart", function(ev) {
            var dt = ev.originalEvent.dataTransfer;
            //we need 2 data elements here, because in the dragover/dragenter handler the value cannot be read (only the keys are available as "types")
            dt.setData("srcprovider/" + providerName, "");
            dt.setData("srcprovider", providerName);
          }).on("drop", function(ev) {
            div.removeClass("dragging");
            var src = ev.originalEvent.dataTransfer.getData("srcprovider");
            if (!src || src == providerName) return false;//just to be sure (in this cases the dragover handler should not allow dropping)
            var srcIndex = providers.indexOf(src);
            providers.splice(srcIndex, 1);
            var destIndex = providers.indexOf(providerName);
            if (srcIndex == destIndex) destIndex++;//insert after this if it was already the previous element
            providers.splice(destIndex, 0, src);
            localSettings.lyricsProviders = providers;//trigger listeners
            sortProviders();
            return false;
          });
        } else {
          div.off();
        }
      }
      
      function setProviderEnabled(enabled) {
        if (enabled) {
          providers.push(providerName);
          if (providers.length >= 1) lyrics.prop("disabled", false);
        } else {
          var index = providers.indexOf(providerName);
          providers.splice(index, 1);
          if (!providers.length) {
            lyrics.prop("disabled", true);
            if (localSettings.lyrics) {
              lyrics.prop("checked", false);
              localSettings.lyrics = false;
              lyricsChanged();
            }
          }
        }
        localSettings.lyricsProviders = providers;//trigger listeners
        setDraggable(enabled);
        sortProviders();
      }
      
      function enableCheckBox() {
        var checked = providers.indexOf(providerName) >= 0;
        checkbox.prop("checked", checked);
        setDraggable(checked);
        
        checkbox.unbind().click(function() {
          setProviderEnabled(checkbox.prop("checked"));
        });
      }
      
      provider.checkPermission(function(hasPermission) {
        if (hasPermission) {
          enableCheckBox();
        } else {
          //just to be sure, check if it has to be reset here (e.g. switching to another Chrome channel keeps the settings, but loses the permissions)
          if (providers.indexOf(providerName) >= 0) {
            setProviderEnabled(false);
          }
          checkbox.click(function() {
            alert(i18n("lyricsAlert", provider.getUrl()));
            provider.requestPermission(function(granted) {
              if (granted) {
                setProviderEnabled(true);
                enableCheckBox();
              } else {
                checkbox.prop("checked", false);
              }
            });
          });
        }
      });
    });
    
    sortProviders();
  }
  
  /** @return version from a class attribute (e.g. for an element with class "abc v-1.2.3 def" this returns "1.2.3") */
  function extractVersionFromClass(el) {
    var cl = $(el).attr("class");
    var start = cl.indexOf("v-") + 2;
    if (start < 0) return null;
    var end = cl.indexOf(" ", start);
    return cl.substring(start, end < 0 ? cl.length : end);
  }
  
  function updatePreNotifyMax() {
    var timerPreNotify = $("#timerPreNotify");
    var max = $("#timerMin").val() * 60;
    timerPreNotify.attr("max", max);
    if (timerPreNotify.val() > max) timerPreNotify.val(max);
  }
  
  /** Setup UI and logic for the timer. */
  function initTimer() {
    $("#timerMin").val(localSettings.timerMinutes).change(updatePreNotifyMax).parent().find("label").text(i18n("timerMinutes"));
    $("#timerNotify").prop("checked", localSettings.timerNotify).parent().find("label").text(i18n("timerNotify"));
    $("#timerPreNotify").val(localSettings.timerPreNotify).parent().find("label").text(i18n("timerPreNotify"));
    $("#timerAction").val(localSettings.timerAction).parent().find("label").text(i18n("timerAction"));
    $("#timerAction").find("option").each(function() {
      $(this).text(i18n("timerAction_" + $(this).attr("value")));
    });
    $("#startTimer").text(i18n("startTimer")).click(function() {
      var min = $("#timerMin").val();
      if (min) {
        localSettings.timerMinutes = min;
        localSettings.timerAction = $("#timerAction").val();
        localSettings.timerNotify = $("#timerNotify").prop("checked");
        localSettings.timerPreNotify = $("#timerPreNotify").val();
        localSettings.timerEnd = ($.now() / 1000) + (min * 60);
        bp.startSleepTimer();
      }
    });
    $("#stopTimer").text(i18n("stopTimer")).click(bp.clearSleepTimer);
    updatePreNotifyMax();
  }
  
  /** Setup UI and logic for the options filter. */
  function initFilter() {
    function optionsModeChanged() {
      settingsView.removeClass("f-beg f-adv f-exp").addClass("f-" + settings.optionsMode);
    }
    initSelect("optionsMode", ["beg", "adv", "exp"]).change(optionsModeChanged);
    optionsModeChanged();
    
    $("#filter p").text(i18n("filterHint"));
    
    var container = $("<div>").appendTo("#filter");
    var line = $("<div>").appendTo(container);
    function appendCheckbox(id) {
      $("<div>").attr("id", id).appendTo(line);
      var cb = initCheckbox(id);
      var label = cb.siblings("label").removeAttr("for");
      function updateFilter() {
        settingsView.toggleClass(id, !settings[id]);
        label.html(settings[id] ? "<a href='#" + id.replace("filter", "legend") + "'>" + label.text() + "</a>" : label.text());
      }
      cb.click(updateFilter);
      updateFilter();
    }
    ["filterTimer", "filterLastfm", "filterToast"].forEach(appendCheckbox);
    line = $("<div>").appendTo(container);
    ["filterMiniplayer", "filterLyrics", "filterLookfeel"].forEach(appendCheckbox);
  }
  
  /** Set labels and hints for the legends. */
  function initLegends() {
    $("#settings legend").each(function() {
      $(this).text(i18n(this.id));
      appendHint(this).text(i18n(this.id + "Hint")).insertAfter(this);
    });
  }
  
  function getConnectActionText(val) {
    if (val) return i18n(val);
    return i18n("openPopup");
  }
  
  function addOptionClass(select, value, clazz) {
    select.children("option[value='" + value + "']").addClass(clazz);
  }
  
  $(function() {
    $("head > title").text(i18n("options") + " - " + i18n("extTitle"));
    initLegends();
    
    $("#lastfmStatus").find("span").text(i18n("lastfmUser"));
    $("#bugfeatureinfo").html(i18n("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenackermann/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>"));
    
    initTimer();
    
    initCheckbox("scrobble");
    var percentSpan = $("#scrobblePercent").find("span");
    percentSpan.text(settings.scrobblePercent);
    var scrobblePercent = $("#_scrobblePercent");
    scrobblePercent
      .val(settings.scrobblePercent)
      .mouseup(numberUpdater("scrobblePercent", settings))
      .change(function(){ percentSpan.text($(this).val()); });
    addLabel(scrobblePercent);
    initNumberInput("scrobbleTime", 0);
    initNumberInput("scrobbleMaxDuration", 0);
    initCheckbox("disableScrobbleOnFf");
    initHint("disableScrobbleOnFf");
    initCheckbox("scrobbleRepeated");
    initCheckbox("linkRatings").click(linkRatingsChanged);
    initHint("linkRatings");
    initNumberInput("linkRatingsMin", 2, 5);
    initCheckbox("linkRatingsGpm");
    initCheckbox("linkRatingsAuto");
    initHint("linkRatingsAuto");
    initCheckbox("showLastfmInfo");
    
    $("#notificationDisabledWarning").text(i18n("notificationsDisabled"));
    initCheckbox("toast").click(toastChanged);
    initHint("toast");
    initNumberInput("toastDuration", 0);
    initHint("toastDuration");
    initCheckbox("toastIfMpOpen").click(toastChanged);
    initCheckbox("toastIfMpMinimized");
    initCheckbox("toastNotIfGmActive");
    initCheckbox("toastUseMpStyle").click(toastChanged);
    initHint("toastUseMpStyle");
    initSelect("toastPriority", [1, 2, 3], null, numberUpdater);
    initCheckbox("toastProgress");
    initCheckbox("toastRating");
    var toastClick = initSelect("toastClick", [
      "",
      "playPause",
      "prevSong",
      "nextSong",
      "ff",
      "openMiniplayer",
      "volumeUp",
      "volumeDown",
      "volumeMute",
      "toggleRepeat",
      "toggleShuffle",
      "loveUnloveSong",
      "rate-1",
      "rate-2",
      "rate-3",
      "rate-4",
      "rate-5",
      "feelingLucky",
      "openLyrics"
    ], bp.getCommandOptionText);
    addOptionClass(toastClick, "openMiniplayer", "miniplayer");
    addOptionClass(toastClick, "loveUnloveSong", "lastfm");
    addOptionClass(toastClick, "rate-2", "stars");
    addOptionClass(toastClick, "rate-3", "stars");
    addOptionClass(toastClick, "rate-4", "stars");
    addOptionClass(toastClick, "openLyrics", "lyrics");
    initSelectFrom("toastButton1", toastClick);
    initSelectFrom("toastButton2", toastClick);
    
    function setLayoutHintVisibility() {
      var panel = settings.miniplayerType == "panel" || settings.miniplayerType == "detached_panel";
      var mpt = $("#miniplayerType");
      mpt.children(".hint").toggle(panel);
      if (!panel) mpt.children(".hint-text").hide();
      
      var visible = panel && settings.layout == "hbar";
      var layout = $("#layout");
      layout.children(".hint").toggle(visible);
      if (!visible) layout.children(".hint-text").hide();
    }
    initSelect("miniplayerType", ["normal", "popup", "panel", "detached_panel"]).change(setLayoutHintVisibility);
    initHint("miniplayerType").find("a").text("chrome://flags").attr("tabindex", "0").click(function() { chrome.tabs.create({ url: "chrome://flags" }); });
    initSelect("layout", ["normal", "compact1", "compact2", "hbar"]).change(setLayoutHintVisibility);
    initHint("layout");
    setLayoutHintVisibility();
    initSelect("color", ["turq", "green", "red", "blue", "black", "orange"]);
    initColorInput("mpBgColor");
    initColorInput("mpTextColor");
    initSelect("coverClickLink", []);
    initSelect("titleClickLink", []);
    initCheckbox("openLinksInMiniplayer");
    initHint("openLinksInMiniplayer");
    initCheckbox("hideSearchfield");
    initCheckbox("hideRatings");
    initCheckbox("omitUnknownAlbums");
    initHint("omitUnknownAlbums");
    initCheckbox("mpAutoOpen");
    initCheckbox("mpAutoClose");
    initCheckbox("mpCloseGm");
    
    var lyrics = initCheckbox("lyrics", localSettings).click(lyricsChanged);
    initLyricsProviders(lyrics);
    initCheckbox("openLyricsInMiniplayer");
    initHint("openLyricsInMiniplayer");
    initCheckbox("lyricsAutoReload");
    initNumberInput("lyricsFontSize", 1, null, localSettings);
    initCheckbox("lyricsInGpm").click(lyricsChanged);
    initNumberInput("lyricsWidth", 50, null, localSettings);
    
    $("#shortcutsLink").text(i18n("configShortcuts")).click(function() { chrome.tabs.create({ url: "chrome://extensions/configureCommands" }); });
    initIconStyle();
    initCheckbox("showPlayingIndicator");
    initCheckbox("showRatingIndicator");
    initCheckbox("showLovedIndicator");
    initCheckbox("showScrobbledIndicator");
    initCheckbox("showProgress").click(showProgressChanged);
    initColorInput("showProgressColor");
    initColorInput("showProgressColorPaused");
    
    var iconClickConnectAction = initSelect("iconClickConnectAction", [
      "",
      "feelingLucky",
      "resumeLastSong",
      "gotoGmusic",
      "openMiniplayer"
    ], getConnectActionText);
    $("#iconClickActionTitle").text(i18n("iconClickActionTitle"));
    for (var i = 0; i < 4; i++) {
      initSelectFrom("iconClickAction" + i, toastClick)
        .change(iconClickChanged)
        .find("option[value='']").text(i18n("openPopup"));
    }
    initNumberInput("iconDoubleClickTime", 0, 1000).change(iconClickChanged);
    initHint("iconDoubleClickTime");
    initCheckbox("iconShowAction");
    
    initCheckbox("saveLastPosition").click(saveLastPositionChanged);
    initHint("saveLastPosition");
    var skipRatedLower = initSelect("skipRatedLower", [0, 1, 2, 3, 4]).change(function() { $("#_skipRatedThumbsDown").prop("checked", settings.skipRatedLower > 0); });
    initCheckbox("skipRatedThumbsDown").unbind().prop("checked", settings.skipRatedLower > 0).click(function() {
       settings.skipRatedLower = $(this).prop("checked") ? 2 : 0;
       skipRatedLower.val(settings.skipRatedLower);
    });
    initCheckbox("openGoogleMusicPinned");
    initCheckbox("openGmBackground");
    initSelectFrom("startupAction", iconClickConnectAction).find("option[value='']").text(i18n("command_"));
    initNumberInput("googleAccountNo", 0, null, localSettings);
    initHint("googleAccountNo");
    initCheckbox("connectedIndicator");
    initCheckbox("preventCommandRatingReset");
    initHint("preventCommandRatingReset");
    initCheckbox("updateNotifier");
    initCheckbox("syncSettings", localSettings);
    initCheckbox("gaEnabled");
    initHint("gaEnabled");
    
    //watch this if changed via miniplayer
    settings.al("scrobble", scrobbleChanged, context);
    //we must watch this as the session could be expired
    localSettings.w("lastfmSessionName", lastfmUserChanged, context);
    //show/hide notification based options
    localSettings.w("notificationsEnabled", notificationsEnabledChanged, context);
    //update timer
    localSettings.w("timerEnd", timerEndChanged, context);
    localSettings.al("timerAction", function(val) {
      $("#timerAction").val(val);
    }, context);
    localSettings.al("timerMinutes", function(val) {
      $("#timerMin").val(val);
      updatePreNotifyMax();
    }, context);
    //Google account dependent options
    localSettings.w("ratingMode", ratingModeChanged, context);
    localSettings.w("quicklinks", quicklinksChanged, context);
    
    //disable inputs if neccessary
    lyricsChanged();
    iconClickChanged();
    showProgressChanged();
    saveLastPositionChanged();
    
    $("#resetSettings").click(function() {
      settings.reset();
      localSettings.reset();
      bp.gaEvent("Options", "reset");
      location.reload();
    }).text(i18n("resetSettings"));
    
    //tell the background page that we're open
    chrome.tabs.getCurrent(function(tab) {
      thisTabId = tab.id;
      if (bp.optionsTabId === null) bp.optionsTabId = tab.id;
    });
    
    //get last.fm session if we are the callback page (query param "token" exists)
    var token;
    if (localSettings.lastfmSessionName === null && (token = bp.extractUrlParam("token", location.search))) {
      getLastfmSession(token);
      history.replaceState("", "", chrome.extension.getURL("options.html"));//remove token from URL
    }
    
    //mark new features
    if (bp.previousVersion) {
      $("div[class*='v-']").each(function() {
        var version = extractVersionFromClass(this);
        if (bp.isNewerVersion(version)) $(this).addClass("newFeature");
      });
      bp.updateInfosViewed();
    }
    
    //set headings in changelog
    $("#changelog > div[class*='v-']").each(function() {
      var version = extractVersionFromClass(this);
      $(this).prepend("<h3>Version " + version + "</h3>");
    });
    
    $("#changelog").on("click", "input[type='checkbox']", function() {
      $("#changelog").toggleClass(this.id.substr(3,1));
    });
    
    $("#credits").on("click", "a[data-network]", function() {
      bp.gaSocial($(this).data("network"), $(this).data("action") || "show");
    });
    
    initFilter();
  });

  $(window).unload(function() {
    settings.ral(context);
    localSettings.ral(context);
    if (bp.optionsTabId == thisTabId) bp.optionsTabId = null;
  });
});
