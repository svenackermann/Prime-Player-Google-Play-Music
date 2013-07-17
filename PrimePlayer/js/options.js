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
          status.find(".success").attr('title', chrome.i18n.getMessage('lastfmConnectSuccess')).show();
          bp.gaEvent('LastFM', 'AuthorizeOK');
          bp.getLovedInfo();
          bp.scrobbleCachedSongs();
        },
        error: function(code, message) {
          status.find(".loader").hide();
          var title = chrome.i18n.getMessage('lastfmConnectError');
          if (message) title += ": " + message;
          status.find(".failure").attr('title', title).show();
          bp.gaEvent('LastFM', 'AuthorizeError-' + code);
        }
      }
    );
  }

  function scrobbleChanged() {
    var disabled = !bp.isScrobblingEnabled();
    $("#scrobblePercent").prop('disabled', disabled);
    $("#scrobbleTime").prop('disabled', disabled);
    $("#scrobbleMaxDuration").prop('disabled', disabled);
    $("#disableScrobbleOnFf").prop('disabled', disabled);
  }

  function toastChanged() {
    $("#toastUseMpStyle").prop('disabled', !bp.settings.toast);
    $("#toastDuration").prop('disabled', !bp.settings.toast || !bp.settings.toastUseMpStyle);
  }
  
  function lastfmUserChanged(user) {
    var action;
    var actionText;
    $('#scrobble').prop('disabled', user == null);
    $("#linkRatings").prop('disabled', user == null);
    scrobbleChanged();
    var links = $('#lastfmStatus').find("a");
    var userLink = links.first();
    if (user) {
      action = bp.lastfmLogout;
      actionText = chrome.i18n.getMessage('logout');
      userLink.text(user).attr('href', "http://last.fm/user/" + user).removeClass("disconnected");
    } else {
      action = bp.lastfmLogin;
      actionText = chrome.i18n.getMessage('connect');
      userLink.text(chrome.i18n.getMessage('disconnected')).attr('href', "javascript:return false;").addClass("disconnected");
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

  function boolUpdater(prop) {
    return function() {
      bp.settings[prop] = !bp.settings[prop];
    };
  }

  /** the i18n key for the hint for property "<prop>" is "setting_<prop>Hint" */
  function initHint(prop) {
    $("#" + prop)
      .parent().find("img.hint").attr('title', chrome.i18n.getMessage("setting_" + prop + 'Hint'));
  }

  /** the i18n key for the label for property "<prop>" is "setting_<prop>" */
  function initCheckbox(prop) {
    var input = $("#" + prop);
    input
      .prop('checked', bp.settings[prop])
      .click(boolUpdater(prop))
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
  function initSelect(prop) {
    var input = $("#" + prop);
    input
      .val(bp.settings[prop])
      .change(stringUpdater(prop))
      .parent().find("label").text(chrome.i18n.getMessage("setting_" + prop));
    input.find("option").each(function() {
        $(this).text(chrome.i18n.getMessage("setting_" + prop + "_" + $(this).attr('value')));
      });
    return input;
  }

  function initSyncSettings() {
    $("#syncSettings")
      .prop('checked', bp.localSettings.syncSettings)
      .click(function() { bp.localSettings.syncSettings = !bp.localSettings.syncSettings })
      .parent().find("label").text(chrome.i18n.getMessage("setting_syncSettings"));
  }

  /** @return version from a class attribute (e.g. for an element with class "abc v-1.2.3 def" this returns "1.2.3") */
  function extractVersionFromClass(el) {
    var cl = $(el).attr("class");
    var start = cl.indexOf("v-") + 2;
    if (start < 0) return null;
    var end = cl.indexOf(" ", start);
    return cl.substring(start, end < 0 ? cl.length : end);
  }

  $(function() {
    var optionsText = chrome.i18n.getMessage('options') + ' - ' + chrome.i18n.getMessage('extTitle');
    $("head > title").first().text(optionsText);
    $("div.settings").find("h1").first().text(optionsText);
    $("#legendLastfm").text(chrome.i18n.getMessage('lastfmSettings'));
    $("#legendToasting").text(chrome.i18n.getMessage('toastingSettings'));
    $("#legendLf").text(chrome.i18n.getMessage('lfSettings'));
    $("#lastfmStatus").find("span").text(chrome.i18n.getMessage('lastfmUser'));
    var bugfeatureinfo = chrome.i18n.getMessage('bugfeatureinfo');
    bugfeatureinfo = bugfeatureinfo.replace("GitHub", "<a target='_blank' href='https://github.com/svenrecknagel/Prime-Player-Google-Play-Music/issues'>GitHub</a>");
    $("#bugfeatureinfo").html(bugfeatureinfo);
    
    initCheckbox("scrobble").click(scrobbleChanged);
    
    var percentSpan = $("#scrobblePercent").parent().find("span");
    percentSpan.text(bp.settings.scrobblePercent);
    $("#scrobblePercent")
      .val(bp.settings.scrobblePercent)
      .mouseup(numberUpdater('scrobblePercent'))
      .change(function(){ percentSpan.text($(this).val()); })
      .parent().find("label").text(chrome.i18n.getMessage('setting_scrobblePercent'));

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
    initSelect("miniplayerType");
    initHint("miniplayerType");
    initSelect("layout");
    initHint("layout")
    initSelect("color");
    initCheckbox("iconClickMiniplayer");
    initCheckbox("iconClickConnect");
    initCheckbox("openGoogleMusicPinned");
    initCheckbox("updateNotifier");
    initSyncSettings();
    initCheckbox("gaEnabled");
    initHint("gaEnabled");
    
    //we must watch this as the session could be expired
    bp.localSettings.watch("lastfmSessionName", lastfmUserChanged);
    //disable inputs if neccessary
    toastChanged();
    
    //tell the background page that we're open
    if (bp.optionsTabId == null) {
      chrome.tabs.getCurrent(function(tab) {
        thisTabId = tab.id;
        bp.optionsTabId = tab.id;
      });
    }
    
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
  });

  $(window).unload(function() {
    bp.localSettings.removeListener("lastfmSessionName", lastfmUserChanged);
    if (bp.optionsTabId == thisTabId) bp.optionsTabId = null;
  });

  if (bp.settings.gaEnabled) initGA(bp.currentVersion);

});