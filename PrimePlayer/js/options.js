/**
 * This is the script for the options page.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
chrome.runtime.getBackgroundPage(function(bp) {

  var thisTabId;

  /** request and store last.fm session info */
  function getLastfmSession(token) {
    var status = $("#lastfmStatus");
    status.find(".loader").show();
    bp.lastfm.auth.getSession({token: token},
      {
        success: function(response) {
          status.find(".loader").hide();
          bp.localSettings.lastfmSessionKey = response.session.key;
          bp.localSettings.lastfmSessionName = response.session.name;
          bp.lastfm.session = response.session;
          status.find(".success").attr("title", chrome.i18n.getMessage("lastfmConnectSuccess")).show();
          bp.gaEvent("LastFM", "AuthorizeOK");
          bp.getLovedInfo();
          bp.scrobbleCachedSongs();
        },
        error: function(code, message) {
          status.find(".loader").hide();
          var title = chrome.i18n.getMessage("lastfmConnectError");
          if (message) title += ": " + message;
          status.find(".failure").attr("title", title).show();
          bp.gaEvent("LastFM", "AuthorizeError-" + code);
        }
      }
    );
  }

  function scrobbleChanged() {
    $("#scrobblePercent, #scrobbleTime, #scrobbleMaxDuration, #disableScrobbleOnFf").prop("disabled", !bp.isScrobblingEnabled());
  }

  function toastChanged() {
    $("#toastUseMpStyle, #toastIfMpOpen").prop("disabled", !bp.settings.toast);
    $("#toastDuration").prop("disabled", !bp.settings.toast || !bp.settings.toastUseMpStyle);
    $("#toastClick, #toastButton1, #toastButton2").prop("disabled", !bp.settings.toast || bp.settings.toastUseMpStyle);
  }
  
  function lastfmUserChanged(user) {
    var action;
    var actionText;
    $("#scrobble, #linkRatings").prop("disabled", user == null);
    scrobbleChanged();
    var links = $("#lastfmStatus").find("a");
    var userLink = links.first();
    if (user) {
      action = bp.lastfmLogout;
      actionText = chrome.i18n.getMessage("logout");
      userLink.text(user).attr("href", "http://last.fm/user/" + user).removeClass("disconnected");
    } else {
      action = bp.lastfmLogin;
      actionText = chrome.i18n.getMessage("connect");
      userLink.text(chrome.i18n.getMessage("disconnected")).attr("href", "javascript:return false;").addClass("disconnected");
    }
    links.last().text(actionText).unbind().click(action);
  }

  function stringUpdater(prop) {
    return function() {
      bp.settings[prop] = $(this).val();
    };
  }

  function numberUpdater(prop) {
    return function() {
      bp.settings[prop] = parseFloat($(this).val());
    };
  }

  function boolUpdater(prop, settings) {
    return function() {
      settings[prop] = !settings[prop];
    };
  }

  /** the i18n key for the hint for property "<prop>" is "setting_<prop>Hint" */
  function initHint(prop) {
    $("#" + prop)
      .parent().find("img.hint").attr("title", chrome.i18n.getMessage("setting_" + prop + "Hint"));
  }

  /** the i18n key for the label for property "<prop>" is "setting_<prop>" */
  function initCheckbox(prop, settings) {
    if (!settings) settings = bp.settings;
    var input = $("#" + prop);
    input
      .prop("checked", settings[prop])
      .click(boolUpdater(prop, settings))
      .parent().find("label").text(chrome.i18n.getMessage("setting_" + prop));
    return input;
  }

  function initNumberInput(prop) {
    var input = $("#" + prop);
    input
      .val(bp.settings[prop])
      .blur(numberUpdater(prop))
      .parent().find("label").text(chrome.i18n.getMessage("setting_" + prop));
    return input;
  }

  /** the i18n key for option "<opt>" for property "<prop>" is "setting_<prop>_<opt>" */
  function initSelect(prop, getOptionText) {
    if (typeof(getOptionText) != "function") {
      getOptionText = function(val) {return chrome.i18n.getMessage("setting_" + prop + "_" + val);};
    }
    var input = $("#" + prop);
    input
      .val(bp.settings[prop])
      .change(stringUpdater(prop))
      .parent().find("label").text(chrome.i18n.getMessage("setting_" + prop));
    input.find("option").each(function() {
        $(this).text(getOptionText($(this).attr("value")));
      });
    return input;
  }
  
  function initIconStyle() {
    $("#iconStyle").find("label").text(chrome.i18n.getMessage("setting_iconStyle"));
    $("#iconStyle").find("input[value='" + bp.settings.iconStyle + "']").prop("checked", true);
    $("#iconStyle").find("input").click(stringUpdater("iconStyle"));
  }

  /** @return version from a class attribute (e.g. for an element with class "abc v-1.2.3 def" this returns "1.2.3") */
  function extractVersionFromClass(el) {
    var cl = $(el).attr("class");
    var start = cl.indexOf("v-") + 2;
    if (start < 0) return null;
    var end = cl.indexOf(" ", start);
    return cl.substring(start, end < 0 ? cl.length : end);
  }

  if (bp.settings.gaEnabled) initGA(bp.currentVersion);

  $(function() {
    if (location.hash == "#welcome") {
      $("body").children().toggle();
      $("#welcome").children("div").text(chrome.i18n.getMessage("welcomeMessage"));
      $("#welcome .close").text(chrome.i18n.getMessage("close")).click(function() {
        chrome.tabs.remove(thisTabId);
        bp.gaEvent("Settings-Action", "welcome-close");
      });
      $("#welcome .toOptions").text(chrome.i18n.getMessage("toOptions")).click(function() {
        $("body").children().toggle();
        location.hash = "";
        bp.gaEvent("Settings-Action", "welcome-toOptions");
      });
    }
    
    $("head > title").text(chrome.i18n.getMessage("options") + " - " + chrome.i18n.getMessage("extTitle"));
    $("#legendLastfm").text(chrome.i18n.getMessage("lastfmSettings"));
    $("#legendToasting").text(chrome.i18n.getMessage("toastingSettings"));
    $("#legendMp").text(chrome.i18n.getMessage("mpSettings"));
    $("#legendLf").text(chrome.i18n.getMessage("lfSettings"));
    $("#lastfmStatus").find("span").text(chrome.i18n.getMessage("lastfmUser"));
    var bugfeatureinfo = chrome.i18n.getMessage("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenrecknagel/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>");
    $("#bugfeatureinfo").html(bugfeatureinfo);
    
    initCheckbox("scrobble").click(scrobbleChanged);
    var percentSpan = $("#scrobblePercent").parent().find("span");
    percentSpan.text(bp.settings.scrobblePercent);
    $("#scrobblePercent")
      .val(bp.settings.scrobblePercent)
      .mouseup(numberUpdater("scrobblePercent"))
      .change(function(){ percentSpan.text($(this).val()); })
      .parent().find("label").text(chrome.i18n.getMessage("setting_scrobblePercent"));
    initNumberInput("scrobbleTime");
    initNumberInput("scrobbleMaxDuration");
    initCheckbox("disableScrobbleOnFf");
    initHint("disableScrobbleOnFf");
    initCheckbox("linkRatings");
    initHint("linkRatings");
    
    initCheckbox("toast").click(toastChanged);
    initHint("toast");
    initCheckbox("toastUseMpStyle").click(toastChanged);
    initHint("toastUseMpStyle");
    initNumberInput("toastDuration");
    initCheckbox("toastIfMpOpen");
    initSelect("toastClick", bp.getTextForToastBtn);
    initSelect("toastButton1")
      .append($("#toastClick").children().clone())
      .val(bp.settings.toastButton1);
    initSelect("toastButton2")
      .append($("#toastClick").children().clone())
      .val(bp.settings.toastButton2);
    
    initSelect("miniplayerType");
    initHint("miniplayerType");
    initSelect("layout");
    initHint("layout");
    initSelect("color");
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
    
    initIconStyle();
    initCheckbox("iconClickMiniplayer").click(function() {
      if (bp.settings.iconClickMiniplayer) {
        bp.settings.iconClickPlayPause = false;
        $("#iconClickPlayPause").prop("checked", false);
      }
    });
    initCheckbox("iconClickPlayPause").click(function() {
      if (bp.settings.iconClickPlayPause) {
        bp.settings.iconClickMiniplayer = false;
        $("#iconClickMiniplayer").prop("checked", false);
      }
    });
    initCheckbox("iconClickConnect");
    initCheckbox("openGoogleMusicPinned");
    initCheckbox("connectedIndicator");
    initCheckbox("preventCommandRatingReset");
    initHint("preventCommandRatingReset");
    initCheckbox("updateNotifier");
    initCheckbox("syncSettings", bp.localSettings);
    initCheckbox("gaEnabled");
    initHint("gaEnabled");
    
    //we must watch this as the session could be expired
    bp.localSettings.watch("lastfmSessionName", lastfmUserChanged);
    //disable inputs if neccessary
    toastChanged();
    
    $("#resetSettings").click(function() {
      bp.settings.resetToDefaults();
      bp.localSettings.resetToDefaults();
      bp.gaEvent("Settings-Action", "reset");
      location.reload();
    }).text(chrome.i18n.getMessage("resetSettings"));
    
    //tell the background page that we're open
    chrome.tabs.getCurrent(function(tab) {
      thisTabId = tab.id;
      if (bp.optionsTabId == null) bp.optionsTabId = tab.id;
    });
    
    //get last.fm session if we are the callback page (query param "token" exists)
    var token;
    if (bp.localSettings.lastfmSessionName == null && (token = bp.extractUrlParam("token", location.search))) {
      getLastfmSession(token);
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
      if (bp.settings.gaEnabled && _gaq) _gaq.push(["_trackSocial", $(this).data("network"), $(this).data("action") || "show"]);
    });
  });

  $(window).unload(function() {
    bp.localSettings.removeListener("lastfmSessionName", lastfmUserChanged);
    if (bp.optionsTabId == thisTabId) bp.optionsTabId = null;
  });

});