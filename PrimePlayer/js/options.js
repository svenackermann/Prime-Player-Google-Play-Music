/**
 * This is the script for the options page.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
var bp = chrome.extension.getBackgroundPage();
var thisTab;

function extractToken() {
  var matched = RegExp('token=(.+?)(&|$)').exec(location.search);
  if (matched == null || matched.length < 2) return null;
  return matched[1];
}

function getLastfmSession(token) {
  var status = $("#lastfmStatus");
  status.find(".loader").show();
  bp.lastfm.auth.getSession({token: token},
    {
      success: function(response) {
        status.find(".loader").hide();
        bp.settings.lastfmSessionKey = response.session.key;
        bp.settings.lastfmSessionName = response.session.name;
        bp.lastfm.session = response.session;
        status.find(".success").attr('title', chrome.i18n.getMessage('lastfmConnectSuccess')).show();
        bp.gaEvent('LastFM', 'AuthorizeOK');
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
  $("#toastDuration").prop('disabled', !bp.settings.toast);
  $("#hideToastPlaycontrols").prop('disabled', !bp.settings.toast);
}

function lastfmUserChanged(user) {
  var action;
  var actionText;
  $('#scrobbling').prop('disabled', user == null);
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

function initHint(prop) {
  $("#" + prop)
    .parent().find("img.hint").attr('title', chrome.i18n.getMessage("setting_" + prop + 'Hint'));
}

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

function extractVersionFromClass(el) {
  var cl = $(el).attr("class");
  var start = cl.indexOf("v-") + 2;
  var end = cl.indexOf(" ", start);
  return cl.substring(start, end < 0 ? cl.length : end);
}

$(function() {
  var optionsText = chrome.i18n.getMessage('options') + ' - ' + chrome.i18n.getMessage('extTitle');
  $("head > title").first().text(optionsText);
  $("h1").first().text(optionsText);
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
  initCheckbox("toast").click(toastChanged);
  initHint("toast");
  initNumberInput("toastDuration");
  initCheckbox("hideToastPlaycontrols");
  initSelect("miniplayerType");
  initHint("miniplayerType");
  initSelect("layout");
  initHint("layout")
  initSelect("color");
  initCheckbox("iconClickMiniplayer");
  initCheckbox("iconClickConnect");
  initCheckbox("openGoogleMusicPinned");
  initCheckbox("updateNotifier");
  initCheckbox("gaEnabled");
  initHint("gaEnabled");
  
  bp.settings.watch("lastfmSessionName", lastfmUserChanged);
  scrobbleChanged();
  toastChanged();
  
  if (bp.optionsTab == null) {
    chrome.tabs.getCurrent(function(tab) {
      thisTabId = tab.id;
      bp.optionsTabId = tab.id;
    });
  }
  var token;
  if (bp.settings.lastfmSessionName == null && (token = extractToken())) {
    getLastfmSession(token);
  }
  
  if (bp.previousVersion) {//mark new features
    $("div[class*='v-']").each(function() {
      var version = extractVersionFromClass(this);
      if (bp.isNewerVersion(version)) $(this).addClass("newFeature");
    });
    bp.previousVersion = null;
    bp.updateNotifierDone();
  }
  
  $("#changelog > div[class*='v-']").each(function() {
    var version = extractVersionFromClass(this);
    $(this).prepend("<h3>Version " + version + "</h3>");
  });
});

$(window).unload(function() {
  bp.settings.removeListener("lastfmSessionName", lastfmUserChanged);
  if (bp.optionsTabId == thisTabId) bp.optionsTabId = null;
});

if (bp.settings.gaEnabled) initGA(bp.currentVersion);
