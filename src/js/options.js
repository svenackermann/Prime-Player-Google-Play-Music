/**
 * This is the script for the options page.
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var thisTabId;
  var context = "options";
  var settingsView = $("#settings");
  var i18n = chrome.i18n.getMessage;
    
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

  function setSubsEnabled(el, enabled) {
    el.parent().nextUntil("*:not(.sub)").children("input").prop("disabled", !enabled);
  }
  
  function scrobbleChanged(val) {
    var se = bp.isScrobblingEnabled();
    $("#showScrobbledIndicator").prop("disabled", !se);
    setSubsEnabled($("#scrobble").prop("checked", val), se);
  }

  function linkRatingsChanged() {
    setSubsEnabled($("#linkRatings"), bp.settings.linkRatings && bp.localSettings.lastfmSessionName);
  }
  
  function toastChanged() {
    $("#toastIfMpOpen, #toastDuration").prop("disabled", !bp.settings.toast);
    $("#toastUseMpStyle").prop("disabled", !bp.settings.toast || !bp.localSettings.notificationsEnabled);
    $("fieldset.toast > .notif").children("input, select").prop("disabled", !bp.settings.toast || bp.settings.toastUseMpStyle);
    $("#toast").siblings(".hint").toggle(!bp.settings.toastIfMpOpen);
  }
  
  function lyricsChanged() {
    setSubsEnabled($("#lyrics"), bp.localSettings.lyrics);
    $("#lyricsWidth").prop("disabled", !bp.localSettings.lyrics || !bp.settings.lyricsInGpm);
  }
  
  function lastfmUserChanged(user) {
    var action;
    var actionText;
    $("#scrobble, #linkRatings, #showLovedIndicator").prop("disabled", !user);
    scrobbleChanged(bp.settings.scrobble);
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
    if (!bp.settings.iconClickAction0) bp.settings.iconClickAction1 = "";
    if (!bp.settings.iconClickAction1) bp.settings.iconClickAction2 = "";
    if (!bp.settings.iconClickAction2) bp.settings.iconClickAction3 = "";
    var ict = $("#iconDoubleClickTime").prop("disabled", !bp.settings.iconClickAction0).val();
    $("#iconClickAction1").prop("disabled", !bp.settings.iconClickAction0 || ict === 0).val(bp.settings.iconClickAction1);
    $("#iconClickAction2").prop("disabled", !bp.settings.iconClickAction1 || ict === 0).val(bp.settings.iconClickAction2);
    $("#iconClickAction3").prop("disabled", !bp.settings.iconClickAction2 || ict === 0).val(bp.settings.iconClickAction3);
  }
  
  function showProgressChanged() {
    setSubsEnabled($("#showProgress"), bp.settings.showProgress);
  }

  function notificationsEnabledChanged(val) {
    settingsView.toggleClass("notifDisabled", !val);
    if (!val && bp.settings.toast && !bp.settings.toastUseMpStyle) $("#toastUseMpStyle").click();//use click here to change the checkbox value
    else toastChanged();//in if clause this is triggered by the click listener on #toastUseMpStyle
  }
  
  var countdownInterval;
  function updateTimerStatus(timerEnd) {
    var countdown = Math.floor((timerEnd || 0) - ($.now() / 1000));
    if (countdown > 0) {
      $("#timerStatus").text(i18n("timerAction_" + bp.localSettings.timerAction) + " in " + bp.toTimeString(countdown));
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
    $("#startTimer, #timerMin, #timerNotify, #timerPreNotify, #timerAction").prop("disabled", timerEnd === null || timerEnd !== 0);
    $("#stopTimer").prop("disabled", timerEnd === null || timerEnd === 0);
  }
  
  function ratingModeChanged(val) {
    settingsView.removeClass("star thumbs");
    if (val) settingsView.addClass(val);
    $("#skipRatedLower option[value='2']").text(i18n("setting_skipRatedLower_2" + (val == "star" ? "_stars" : "")));
    $("#toastClick, #toastButton1, #toastButton2, #iconClickAction0, #iconClickAction1, #iconClickAction2, #iconClickAction3").children("option[value='rate-1'], option[value='rate-5']").each(function() {
      $(this).text(bp.getTextForToastBtn($(this).attr("value")));
    });
  }
  
  function allincChanged(val) {
    settingsView.toggleClass("allinc", val);
  }
  
  function quicklinksChanged() {
    $("#coverClickLink, #titleClickLink").children("option").each(function() {
      $(this).text(bp.getTextForQuicklink($(this).attr("value")));
    });
  }
  
  function stringUpdater(prop, settings) {
    return function() { settings[prop] = $(this).val(); };
  }

  function numberUpdater(prop, settings) {
    return function() { settings[prop] = parseFloat($(this).val()); };
  }

  function boolUpdater(prop, settings) {
    return function() { settings[prop] = !settings[prop]; };
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
    var container = $("#" + prop).parent();
    var hint = appendHint(container);
    hint.html(i18n("setting_" + prop + "Hint")).appendTo(container);
    return hint;
  }

  /** the i18n key for the label is "setting_" + prop */
  function setLabel(prop) {
    $("label[for='" + prop + "']").text(i18n("setting_" + prop));
  }
  
  /**
   * Initialize a checkbox input for an option.
   * @param prop the option name
   * @param settings the settings object, defaults to bp.settings
   * @return the checkbox input element
   */
  function initCheckbox(prop, settings) {
    settings = settings || bp.settings;
    var input = $("#" + prop);
    input.prop("checked", settings[prop]).click(boolUpdater(prop, settings));
    setLabel(prop);
    return input;
  }

  /**
   * Initialize a number input for an option.
   * @param prop the option name
   * @param settings the settings object, defaults to bp.settings
   * @return the number input element
   */
  function initNumberInput(prop, settings) {
    settings = settings || bp.settings;
    var input = $("#" + prop);
    input.val(settings[prop]).blur(numberUpdater(prop, settings));
    setLabel(prop);
    return input;
  }

  /**
   * Initialize a select input for an option.
   * @param prop the option name in bp.settings
   * @param getOptionText function that takes the option's value as argument and returns the label for the option, the default i18n key for option "<opt>" is "setting_" + prop + "_<opt>"
   * @param updater a custom updater for the option's value, defaults to "stringUpdater"
   * @return the select input element
   */
  function initSelect(prop, getOptionText, updater) {
    getOptionText = getOptionText || function(val) {return i18n("setting_" + prop + "_" + val);};
    updater = updater || stringUpdater;
    var input = $("#" + prop);
    input.val(bp.settings[prop]).change(updater(prop, bp.settings)).find("option").each(function() {
      $(this).text(getOptionText($(this).attr("value")));
    });
    setLabel(prop);
    return input;
  }
  
  /**
   * Initialize a color input for an option.
   * @param prop the option name in bp.settings
   * @return the color input element
   */
  function initColorInput(prop) {
    var input = $("#" + prop);
    input
      .val(bp.settings[prop])
      .change(stringUpdater(prop, bp.settings));
    setLabel(prop);
    return input;
  }
  
  /** Initialize the icon style radio buttons. */
  function initIconStyle() {
    setLabel("iconStyle");
    $("#iconStyle").find("input[value='" + bp.settings.iconStyle + "']").prop("checked", true);
    $("#iconStyle").find("input").click(stringUpdater("iconStyle", bp.settings));
  }
  
  /** Handle the optional lyrics permission. */
  function initLyrics() {
    var lyrics = initCheckbox("lyrics", bp.localSettings).unbind();
    function enableCheckBox() {
      lyrics.unbind().click(boolUpdater("lyrics", bp.localSettings)).click(lyricsChanged);
    }
    var perm = { origins: ["http://www.songlyrics.com/*"] };
    chrome.permissions.contains(perm, function(result) {
      if (result) {
        enableCheckBox();
      } else {
        //just to be sure, reset here (e.g. switching to another Chrome channel keeps the settings, but loses the permissions)
        bp.localSettings.lyrics = false;
        lyrics.prop("checked", false);
        lyrics.click(function() {
          alert(i18n("lyricsAlert"));
          chrome.permissions.request(perm, function(granted) {
            if (granted) {
              bp.localSettings.lyrics = true;
              lyricsChanged();
              enableCheckBox();
            } else {
              lyrics.prop("checked", false);
            }
          });
        });
      }
    });
  }
  
  /** @return version from a class attribute (e.g. for an element with class "abc v-1.2.3 def" this returns "1.2.3") */
  function extractVersionFromClass(el) {
    var cl = $(el).attr("class");
    var start = cl.indexOf("v-") + 2;
    if (start < 0) return null;
    var end = cl.indexOf(" ", start);
    return cl.substring(start, end < 0 ? cl.length : end);
  }
  
  /** Setup UI and logic for the timer. */
  function initTimer() {
    function updatePreNotifyMax() {
      $("#timerPreNotify").attr("max", $("#timerMin").val() * 60);
    }
    $("#timerMin").val(bp.localSettings.timerMinutes).change(updatePreNotifyMax).parent().find("label").text(i18n("timerMinutes"));
    $("#timerNotify").prop("checked", bp.localSettings.timerNotify).parent().find("label").text(i18n("timerNotify"));
    $("#timerPreNotify").val(bp.localSettings.timerPreNotify).parent().find("label").text(i18n("timerPreNotify"));
    $("#timerAction").val(bp.localSettings.timerAction).parent().find("label").text(i18n("timerAction"));
    $("#timerAction").find("option").each(function() {
      $(this).text(i18n("timerAction_" + $(this).attr("value")));
    });
    $("#startTimer").text(i18n("startTimer")).click(function() {
      var min = $("#timerMin").val();
      if (min) {
        bp.localSettings.timerMinutes = min;
        bp.localSettings.timerAction = $("#timerAction").val();
        bp.localSettings.timerNotify = $("#timerNotify").prop("checked");
        bp.localSettings.timerPreNotify = $("#timerPreNotify").val();
        bp.localSettings.timerEnd = ($.now() / 1000) + (min * 60);
        bp.startSleepTimer();
      }
    });
    $("#stopTimer").text(i18n("stopTimer")).click(bp.clearSleepTimer);
    updatePreNotifyMax();
  }
  
  /** Setup UI and logic for the options filter. */
  function initFilter() {
    function optionsModeChanged() {
      settingsView.removeClass("f-beg f-adv f-exp").addClass("f-" + bp.settings.optionsMode);
    }
    initSelect("optionsMode").change(optionsModeChanged);
    optionsModeChanged();
    
    $("#filter p").text(i18n("filterHint"));
    $("#filter > div > div > input[type='checkbox']").each(function() {
      var id = $(this).attr("id");
      var cb = initCheckbox(id);
      var label = cb.siblings("label[for='" + id + "']");
      function updateFilter() {
        settingsView.toggleClass(id, !bp.settings[id]);
        label.html(bp.settings[id] ? "<a href='#" + id.replace("filter", "legend") + "'>" + label.text() + "</a>" : label.text());
      }
      cb.click(updateFilter);
      updateFilter();
    });
  }
  
  /** Set labels and hints for the legends. */
  function initLegends() {
    $("#settings legend").each(function() {
      $(this).text(i18n(this.id));
      appendHint(this).text(i18n(this.id + "Hint")).insertAfter(this);
    });
  }
  
  $(function() {
    $("head > title").text(i18n("options") + " - " + i18n("extTitle"));
    initLegends();
    
    $("#lastfmStatus").find("span").text(i18n("lastfmUser"));
    $("#bugfeatureinfo").html(i18n("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenackermann/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>"));
    
    initTimer();
    
    initCheckbox("scrobble");
    var percentSpan = $("#scrobblePercent").parent().find("span");
    percentSpan.text(bp.settings.scrobblePercent);
    $("#scrobblePercent")
      .val(bp.settings.scrobblePercent)
      .mouseup(numberUpdater("scrobblePercent", bp.settings))
      .change(function(){ percentSpan.text($(this).val()); });
    setLabel("scrobblePercent");
    initNumberInput("scrobbleTime");
    initNumberInput("scrobbleMaxDuration");
    initCheckbox("disableScrobbleOnFf");
    initHint("disableScrobbleOnFf");
    initCheckbox("scrobbleRepeated");
    initCheckbox("linkRatings").click(linkRatingsChanged);
    initHint("linkRatings");
    initNumberInput("linkRatingsMin");
    initCheckbox("linkRatingsGpm");
    initCheckbox("linkRatingsAuto");
    initHint("linkRatingsAuto");
    initCheckbox("showLovedIndicator");
    initCheckbox("showScrobbledIndicator");
    initCheckbox("showLastfmInfo");
    
    $("#notificationDisabledWarning").text(i18n("notificationsDisabled"));
    initCheckbox("toast").click(toastChanged);
    initHint("toast");
    initCheckbox("toastUseMpStyle").click(toastChanged);
    initHint("toastUseMpStyle");
    initNumberInput("toastDuration");
    initHint("toastDuration");
    initSelect("toastPriority", null, numberUpdater);
    initCheckbox("toastProgress");
    initCheckbox("toastRating");
    initCheckbox("toastIfMpOpen").click(toastChanged);
    initSelect("toastClick", bp.getTextForToastBtn);
    initSelect("toastButton1")
      .append($("#toastClick").children().clone())
      .val(bp.settings.toastButton1);
    initSelect("toastButton2")
      .append($("#toastClick").children().clone())
      .val(bp.settings.toastButton2);
    
    function setLayoutHintVisibility() {
      var panel = bp.settings.miniplayerType == "panel" || bp.settings.miniplayerType == "detached_panel";
      $("#miniplayerType").siblings(".hint").toggle(panel);
      if (!panel) $("#miniplayerType").siblings(".hint-text").hide();
      var visible = panel && bp.settings.layout == "hbar";
      $("#layout").siblings(".hint").toggle(visible);
      if (!visible) $("#layout").siblings(".hint-text").hide();
    }
    initSelect("miniplayerType").change(setLayoutHintVisibility);
    initHint("miniplayerType").find("a").text("chrome://flags").attr("tabindex", "0").click(function() { chrome.tabs.create({ url: "chrome://flags" }); });
    initSelect("layout").change(setLayoutHintVisibility);
    initHint("layout");
    setLayoutHintVisibility();
    initSelect("color");
    initColorInput("mpBgColor");
    initColorInput("mpTextColor");
    initSelect("coverClickLink", bp.getTextForQuicklink);
    initSelect("titleClickLink")
      .append($("#coverClickLink").children().clone())
      .val(bp.settings.titleClickLink);
    initCheckbox("openLinksInMiniplayer");
    initHint("openLinksInMiniplayer");
    initCheckbox("hideSearchfield");
    initCheckbox("hideRatings");
    initCheckbox("omitUnknownAlbums");
    initHint("omitUnknownAlbums");
    initCheckbox("mpAutoOpen");
    initCheckbox("mpAutoClose");
    initCheckbox("mpCloseGm");
    
    initLyrics();
    initCheckbox("openLyricsInMiniplayer");
    initHint("openLyricsInMiniplayer");
    initCheckbox("lyricsAutoReload");
    initCheckbox("lyricsInGpm").click(lyricsChanged);
    initNumberInput("lyricsFontSize", bp.localSettings);
    initNumberInput("lyricsWidth", bp.localSettings);
    
    $("#shortcutsLink").text(i18n("configShortcuts")).click(function() { chrome.tabs.create({ url: "chrome://extensions/configureCommands" }); });
    initIconStyle();
    initCheckbox("showPlayingIndicator");
    initCheckbox("showRatingIndicator");
    initCheckbox("showProgress").click(showProgressChanged);
    initColorInput("showProgressColor");
    initCheckbox("saveLastPosition");
    initHint("saveLastPosition");
    var srtd = $("#skipRatedThumbsDown");
    initSelect("skipRatedLower").change(function() { srtd.prop("checked", bp.settings.skipRatedLower > 0); });
    srtd.prop("checked", bp.settings.skipRatedLower > 0).click(function() {
       bp.settings.skipRatedLower = $(this).prop("checked") ? 2 : 0;
       $("#skipRatedLower").val(bp.settings.skipRatedLower);
    });
    setLabel("skipRatedThumbsDown");
    initSelect("iconClickAction0")
      .append($("#toastClick").children().clone())
      .val(bp.settings.iconClickAction0)
      .change(iconClickChanged);
    initSelect("iconClickAction1")
      .append($("#toastClick").children().clone())
      .val(bp.settings.iconClickAction1)
      .change(iconClickChanged);
    initSelect("iconClickAction2")
      .append($("#toastClick").children().clone())
      .val(bp.settings.iconClickAction2)
      .change(iconClickChanged);
    initSelect("iconClickAction3")
      .append($("#toastClick").children().clone())
      .val(bp.settings.iconClickAction3);
    initNumberInput("iconDoubleClickTime").change(iconClickChanged);
    initHint("iconDoubleClickTime");
    initCheckbox("iconClickConnect");
    initCheckbox("openGoogleMusicPinned");
    initNumberInput("googleAccountNo", bp.localSettings);
    initHint("googleAccountNo");
    initCheckbox("connectedIndicator");
    initCheckbox("preventCommandRatingReset");
    initHint("preventCommandRatingReset");
    initCheckbox("updateNotifier");
    initCheckbox("syncSettings", bp.localSettings);
    initCheckbox("gaEnabled");
    initHint("gaEnabled");
    
    //watch this if changed via miniplayer
    bp.settings.addListener("scrobble", scrobbleChanged, context);
    //we must watch this as the session could be expired
    bp.localSettings.watch("lastfmSessionName", lastfmUserChanged, context);
    //show/hide notification based options
    bp.localSettings.watch("notificationsEnabled", notificationsEnabledChanged, context);
    //update timer
    bp.localSettings.watch("timerEnd", timerEndChanged, context);
    //Google account dependent options
    bp.localSettings.watch("ratingMode", ratingModeChanged, context);
    bp.localSettings.watch("allinc", allincChanged, context);
    bp.localSettings.addListener("quicklinks", quicklinksChanged, context);
    
    //disable inputs if neccessary
    toastChanged();
    lyricsChanged();
    iconClickChanged();
    showProgressChanged();
    
    $("#resetSettings").click(function() {
      bp.settings.resetToDefaults();
      bp.localSettings.resetToDefaults();
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
    if (bp.localSettings.lastfmSessionName === null && (token = bp.extractUrlParam("token", location.search))) {
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
    bp.settings.removeAllListeners(context);
    bp.localSettings.removeAllListeners(context);
    bp.player.removeAllListeners(context);
    if (bp.optionsTabId == thisTabId) bp.optionsTabId = null;
  });
});
