/**
 * This is the script for the options page.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome, initGA, Polymer */
/* jshint jquery: true */

chrome.runtime.getBackgroundPage(function(bp) {
  var CONTEXT = "options";
  var CHANGELOG_STORAGE_KEY = "releases";
  var settingsView = $("iron-pages");
  var i18n = chrome.i18n.getMessage;
  var settings = bp.settings;
  var localSettings = bp.localSettings;

  /** Google analytics */
  var GA = initGA(settings, CONTEXT);

  chrome.runtime.onMessage.addListener(function(msg) {
    function updateStatus(id, tooltip) {
      $("#" + id).show();
      Polymer.dom($("paper-tooltip[for='" + id + "']")[0]).textContent = tooltip;
    }

    if (msg.type == "lastfmStatusChanged") {
      var statusDiv = $("#lastfmStatus");
      statusDiv.children(".status").hide();

      if (msg.status === false) statusDiv.children(".loader").show();
      else if (msg.status === true) {
        updateStatus("lastfmSuccess", i18n("lastfmConnectSuccess"));
      } else if (typeof msg.status == "string") {
        updateStatus("lastfmFailure", msg.status);
      }
    }
  });

  function setSubsEnabled(id, enabled, subclass) {
    $("#" + id).nextUntil("*:not(." + (subclass || "sub") + ")").prop("disabled", !enabled);
  }

  function scrobbleChanged() {
    var se = bp.isScrobblingEnabled();
    $("#showScrobbledIndicator").prop("disabled", !se);
    setSubsEnabled("scrobble", se);
  }

  function linkRatingsChanged() {
    setSubsEnabled("linkRatings", settings.linkRatings && localSettings.lastfmSessionName);
  }

  function toastChanged() {
    var toastDisabled = !settings.toast && !settings.toastOnPlayPause;
    $("#toastIfMpOpen,#toastNotIfGmActive,#toastDuration").prop("disabled", toastDisabled);
    $("#toastIfMpMinimized").prop("disabled", toastDisabled || !settings.toastIfMpOpen);
    $("#toastUseMpStyle").prop("disabled", toastDisabled || !localSettings.notificationsEnabled);
    setSubsEnabled("toastUseMpStyle", !toastDisabled && !settings.toastUseMpStyle, "sub2");
  }

  function setOptionDisabled(selectId, option, disabled) {
    $("pp-select#" + selectId + ",pp-select[from='#" + selectId + "']").each(function() {
      this.setDisabled(option, disabled);
    });
  }

  function lastfmSessionNameChanged(user) {
    var action;
    var actionText;
    $("#scrobble,#linkRatings,#showLovedIndicator").prop("disabled", !user);
    setOptionDisabled("toastClick", "loveUnloveSong", !user);
    scrobbleChanged();
    linkRatingsChanged();
    var statusDiv = $("#lastfmStatus");
    var userLink = statusDiv.find("a");
    if (user) {
      action = function() {
        statusDiv.find(".status").hide();
        bp.lastfmLogout();
      };
      actionText = i18n("logout");
      userLink.text(user).attr("href", "http://last.fm/user/" + user).removeClass("disconnected");
    } else {
      action = bp.lastfmLogin;
      actionText = i18n("connect");
      userLink.text(i18n("disconnected")).removeAttr("href").addClass("disconnected");
    }
    $("#lastfmlogin").text(actionText).unbind().on("tap", action);
  }

  function ratingModeChanged() {
    var ratingMode = bp.getRatingMode();
    settingsView.removeClass("star thumbs");
    if (ratingMode) settingsView.addClass(ratingMode);
    $("#skipRatedLower")[0].setText(2, i18n("setting_skipRatedLower_2" + (ratingMode == "star" ? "_stars" : "")));
    $("#toastClick,pp-select[from='#toastClick']").each(function() {
      var input = this;
      input.setText("rate-1", bp.getCommandOptionText("rate-1"));
      input.setText("rate-5", bp.getCommandOptionText("rate-5"));
    });
  }

  function notificationsEnabledChanged(val) {
    settingsView.toggleClass("notifDisabled", !val);
    toastChanged();
  }

  var countdownInterval;
  function updateTimerStatus(timerEnd) {
    var countdown = Math.floor((timerEnd || 0) - $.now() / 1000);
    if (countdown > 0) {
      $("#timerStatus").show().find(">div").text(i18n("setting_timerAction_" + localSettings.timerAction) + " in " + bp.toTimeString(countdown));
    } else {
      $("#timerStatus").hide();
      clearInterval(countdownInterval);
    }
  }

  function timerEndChanged(timerEnd) {
    clearInterval(countdownInterval);
    if (timerEnd) {
      countdownInterval = setInterval(updateTimerStatus.bind(window, timerEnd), 1000);
    }
    updateTimerStatus(timerEnd);
    $("#startTimer,#timerMinutes,#timerNotify,#timerPreNotify,#timerAction").prop("disabled", timerEnd !== 0);
    $(".stopTimer").prop("disabled", !timerEnd);
  }

  function quicklinksChanged() {
    var items = [];
    [""].concat(bp.getQuicklinks()).forEach(function(ql) {
      items.push({ text: bp.getTextForQuicklink(ql), value: ql, clazz: "" });
    });
    $("#coverClickLink,#titleClickLink").each(function() { this.setItems(items); });
  }

  function confirmDialog(content, onConfirm, onCancel) {
    var dialog = $("#confirmDialog");
    $("p", dialog).text(content);
    dialog.unbind().on("iron-overlay-closed", function(e) {
      if (e.detail.confirmed) onConfirm();
      else if ($.isFunction(onCancel)) onCancel();
    });
    dialog[0].open();
  }

  function initLyricsProviders() {
    var containerSelector = "pp-lyricsproviders";
    var providersContainer = $(containerSelector)[0];
    var providerToggleAction = {};
    var activeProviders;
    var providers = [];
    var lyricsProviders = bp.lyricsProviders;

    localSettings.w("lyricsProviders", function(val) {
      activeProviders = val;
      providersContainer.activeProviders = activeProviders;

      $("#lyrics").prop("disabled", !activeProviders.length);
      $("#lyricsAutoNext").prop("disabled", activeProviders.length < 2);

      if (!activeProviders.length && localSettings.lyrics) localSettings.lyrics = false;
    }, CONTEXT);

    lyricsProviders.available.forEach(function(providerName) {
      var provider = lyricsProviders[providerName];
      providers.push({ name: providerName, homepage: provider.getHomepage(), url: provider.getUrl() });

      function toggleProviderEnabled() {
        var index = activeProviders.indexOf(providerName);
        if (index < 0) {
          activeProviders.push(providerName);
        } else {
          activeProviders.splice(index, 1);
        }
        localSettings.lyricsProviders = activeProviders.slice();//trigger listeners
      }

      provider.checkPermission(function(hasPermission) {
        if (hasPermission) {
          providerToggleAction[providerName] = toggleProviderEnabled;
        } else {
          //just to be sure, check if it has to be reset here (e.g. switching to another Chrome channel keeps the settings, but loses the permissions)
          if (activeProviders.indexOf(providerName) >= 0) toggleProviderEnabled();
          providerToggleAction[providerName] = function() {
            confirmDialog(i18n("lyricsAlert", provider.getUrl()), function() {
              provider.requestPermission(function(granted) {
                if (granted) {
                  toggleProviderEnabled();
                  providerToggleAction[providerName] = toggleProviderEnabled;
                } else providersContainer.resetView();
              });
            }, function() {
              providersContainer.resetView();
            });
          };
        }
      });
    });
    providersContainer.providers = providers;

    $(containerSelector).on("toggled", function(e) {
      var action = providerToggleAction[e.detail.provider];
      if ($.isFunction(action)) action();
    }).on("moved", function(e) {
      var providerName = e.detail.provider;
      var index = activeProviders.indexOf(providerName);
      activeProviders.splice(index, 1);
      activeProviders.splice(e.detail.up ? index - 1 : index + 1, 0, providerName);
      localSettings.lyricsProviders = activeProviders.slice();//trigger listeners
    });
  }

  function updatePreNotifyMax() {
    var timerPreNotify = $("#timerPreNotify");
    var max = $("#timerMinutes").val() * 60;
    timerPreNotify.attr("max", max);
    if (timerPreNotify.val() > max) timerPreNotify.val(max);
  }

  /** Setup UI and logic for the timer. */
  function initTimer() {
    $("#timerStatus h2").text(i18n("timerActive"));
    var timerMinutes = $("#timerMinutes").unbind().on("value-changed", updatePreNotifyMax);
    var timerNotify = $("#timerNotify").unbind();
    var timerPreNotify = $("#timerPreNotify").unbind().on("value-changed", function(e) {
      var value = parseFloat(e.detail.value);
      if (!$.isNumeric(value) || value < this.min) this.value = this.min;
      else if (value > this.max) this.value = this.max;
    });
    var timerAction = $("#timerAction").unbind();
    $("#startTimer").text(i18n("startTimer")).click(function() {
      var min = parseFloat(timerMinutes.val());
      if (min) {
        localSettings.timerMinutes = min;
        localSettings.timerAction = timerAction.val();
        localSettings.timerNotify = timerNotify.val();
        localSettings.timerPreNotify = parseFloat(timerPreNotify.val());
        localSettings.timerEnd = $.now() / 1000 + min * 60;
        bp.startSleepTimer();
      }
    });
    $(".stopTimer").text(i18n("stopTimer")).click(bp.clearSleepTimer);
    updatePreNotifyMax();
  }

  function initInputs() {
    var changedListeners = {
      iconClickChanged: function() {
        var noClickTime = $("#iconDoubleClickTime").prop("disabled", !settings.iconClickAction0).val() == "0";
        [1, 2, 3].forEach(function(index) {
          var noPrevAction = !settings["iconClickAction" + (index - 1)];
          if (noPrevAction) settings["iconClickAction" + index] = "";
          $("#iconClickAction" + index).prop("disabled", noPrevAction || noClickTime);
        });
      },
      saveLastPosition: function(val) {
        setOptionDisabled("iconClickConnectAction", "resumeLastSong", !val);
      },
      subsEnabled: function(val, old, prop) {
        setSubsEnabled(prop, val);
      },
      starRatingMode: ratingModeChanged,
      layoutHint: function() {
        var panel = settings.miniplayerType == "panel" || settings.miniplayerType == "detached_panel";
        $("#miniplayerType .hint-trigger").toggle(panel);
        $("#layout .hint-trigger").toggle(panel && settings.layout == "hbar");
      },
      toast: toastChanged,
      scrobble: scrobbleChanged,
      linkRatings: linkRatingsChanged,
      lyrics: function() {
        setSubsEnabled("lyrics", localSettings.lyrics);
        $("#lyricsWidth").prop("disabled", !localSettings.lyrics || !settings.lyricsInGpm);
        setOptionDisabled("toastClick", "openLyrics", !localSettings.lyrics);
      },
      timerMinutes: updatePreNotifyMax,
      optionsMode: function(val) { settingsView.removeClass("f-beg f-adv f-exp").addClass("f-" + val); }
    };
    var optionsTextGetter = {
      bundle: function(val, prop) { return chrome.i18n.getMessage("setting_" + prop + "_" + val); },
      commandOptionText: bp.getCommandOptionText,
      connectActionText: function(val) {
        if (val) return i18n(val);
        return i18n("openPopup");
      },
      playlistEndActionText: function(action) {
        if (!action.indexOf("ap/")) {
          return i18n("ob_startsugg", bp.getTextForQuicklink(action));
        }
        return bp.getCommandOptionText(action);
      }
    };
    $("pp-select").each(function() {
      var config = this.from ? $(this.from)[0] : this;
      var options = config.options.split(",");
      var getOptionText = optionsTextGetter[config.getoptionstext];
      var items = [];
      var prop = this.id;
      options.forEach(function(option) {
        var optionClass = "";
        if (option.indexOf(":") >= 0) {
          var split = option.split(":");
          option = split[0];
          optionClass = split[1];
        }
        var item = { clazz: optionClass, text: getOptionText(option, prop), value: option };
        items.push(item);
      });
      this.setItems(items);
    });
    $(".pp-option").each(function() {
      var theSettings = this.local ? localSettings : settings;
      var that = this;
      theSettings.w(this.id, function(val) { that.value = val; }, CONTEXT);
      $(this).on("value-changed", function(e) {
        if (that.type == "number") {
          var value = parseFloat(e.detail.value);
          if ($.isNumeric(that.min) && value < that.min || $.isNumeric(that.max) && value > that.max) that.value = theSettings[that.id];
          else theSettings[that.id] = value;
        } else theSettings[that.id] = e.detail.value;
      });
      if (this.listened) theSettings.al(this.id, changedListeners[this.listener], CONTEXT);
      else if (this.watched) theSettings.w(this.id, changedListeners[this.listener], CONTEXT);
    });
  }

  function loadReleases(cb, fallbackReleases) {
    var releases = [];
    function loadFromUrl(url) {
      $.get(url).done(function(data, textStatus, jqXHR) {
        data.forEach(function(release) {
          // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
          var version = release.tag_name;
          if (!release.prerelease && /^(\d+\.)*\d+$/.test(version)) releases.push({ v: version, d: $.trim(release.body), p: new Date(release.published_at).getTime() });
          // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
        });
        var link = jqXHR.getResponseHeader("Link");
        if (link) {
          var next = link.match(/^.*<([^>]+)>; rel\=\"next\".*$/);
          if (next) next = next[1];
          if (next) return loadFromUrl(next);
        }

        //sort, save, callback
        releases.sort(function(r1, r2) { return bp.compareVersions(r2.v, r1.v); });
        var items = {};
        items[CHANGELOG_STORAGE_KEY] = releases;
        chrome.storage.local.set(items);
        cb(releases);
      }).fail(function(jqXHR, textStatus, errorThrown) {
        cb(fallbackReleases);
        console.error(textStatus, errorThrown);
      });
    }

    loadFromUrl("https://api.github.com/repos/svenackermann/Prime-Player-Google-Play-Music/releases");
  }

  /** @return version from a class attribute (e.g. for an element with class "abc v-1.2.3 def" this returns "1.2.3") */
  function extractVersionFromClass(el) {
    var cl = $(el).attr("class");
    var start = cl.indexOf("v-") + 2;
    if (start < 0) return null;
    var end = cl.indexOf(" ", start);
    return cl.substring(start, end < 0 ? cl.length : end);
  }

  function renderChangelog(releases) {
    var releasesUrl = "https://github.com/svenackermann/Prime-Player-Google-Play-Music/releases/";
    var changelog = $("#changelog");
    changelog.children("a").attr("href", releasesUrl);
    if (releases.length) {
      releases.forEach(function(release) {
        var container = $("<div>").addClass("v-" + release.v).appendTo(changelog);
        var header = $("<h3>").appendTo(container);
        $("<a>").attr("target", "_blank").attr("href", releasesUrl + release.v).text("Version " + release.v).appendTo(header);
        header.append(" (" + new Date(release.p).toLocaleDateString() + ")");
        var ulStarted = false;
        release.d.split("\n").forEach(function(line) {
          line = $.trim(line);
          if (line.indexOf("* ")) {
            if (ulStarted) {
              container = container.parent();
              ulStarted = false;
            }
            container.append(line + "<br/>");
          } else {
            if (!ulStarted) {
              container = $("<ul>").appendTo(container);
              ulStarted = true;
            }
            line = line.substr(2);
            var classes = line.match(/^([FIBV/]+)\:.*$/);
            if (classes) {
              classes = classes[1].replace(/\//g, " ");
              line = $.trim(line.substr(line.indexOf(":") + 1));
            }
            $("<li>").addClass(classes || "").text(line).appendTo(container);
          }
        });
      });
      changelog.show();
    }

    changelog.children("pp-cltoggle").on("toggled", function(e) {
      changelog.toggleClass(this.type, e.detail.active);
    });

    //mark new features
    if (bp.previousVersion) {
      var badges = {};
      $("[class*='v-']").each(function() {
        var version = extractVersionFromClass(this);
        if (bp.isNewerVersion(version)) {
          $(this).addClass("newFeature");
          var tabName = $(this).parents("pp-tab").attr("id");
          if (tabName && tabName != "tabInfo") badges[tabName] = badges[tabName] ? badges[tabName] + 1 : 1;
        }
      });
      var tabs = $("pp-tabs")[0];
      tabs.badges = badges;
      tabs.selectedTab = "tabInfo";
      bp.updateInfosViewed();
    }
  }

  function initChangelog() {
    chrome.storage.local.get(CHANGELOG_STORAGE_KEY, function(items) {
      var releases = items[CHANGELOG_STORAGE_KEY];
      if (!releases || !releases.length || bp.compareVersions(releases[0].v, chrome.runtime.getManifest().version) < 0) {
        loadReleases(renderChangelog, releases || []);
      } else renderChangelog(releases);
    });
  }

  $(function() {
    $("#confirmDialog [dialog-confirm]").text(i18n("dialogOk"));
    $("#confirmDialog [dialog-dismiss]").text(i18n("dialogCancel"));

    $("head > title").text(i18n("options") + " - " + i18n("extTitle"));

    $("#bugfeatureinfo").html(i18n("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenackermann/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>"));

    $("#legendIc").text(i18n("legendIc")).after(i18n("legendIcHint"));

    initInputs();

    $("#shortcutsLink").text(i18n("configShortcuts")).click(function() { chrome.tabs.create({ url: "chrome://extensions/configureCommands" }); });
    $("#iconClickActionTitle").text(i18n("iconClickActionTitle"));
    $("pp-select[id^='iconClickAction']").each(function() { this.setText("", i18n("openPopup")); });
    $("#startupAction")[0].setText("", i18n("command_"));

    $("#miniplayerType .hint-content a").text("chrome://flags").attr("tabindex", "0").click(function() { chrome.tabs.create({ url: "chrome://flags/#enable-panels" }); });

    $("#notificationDisabledWarning div").text(i18n("notificationsDisabled"));

    $("#lastfmStatus").find("span").text(i18n("lastfmUser"));

    initLyricsProviders();

    initTimer();

    localSettings.w("lastfmSessionName", lastfmSessionNameChanged, CONTEXT);
    //show/hide notification based options
    localSettings.w("notificationsEnabled", notificationsEnabledChanged, CONTEXT);
    //update timer
    localSettings.w("timerEnd", timerEndChanged, CONTEXT);
    //Google account dependent options
    localSettings.al("ratingMode", ratingModeChanged, CONTEXT);
    localSettings.w("quicklinks", quicklinksChanged, CONTEXT);
    localSettings.w("syncSettings", function(val) { $("body").toggleClass("syncenabled", val); }, CONTEXT);

    $("#resetSettings").on("tap", function() {
      confirmDialog(i18n("resetSettingsConfirm"), function() {
        settings.reset();
        localSettings.reset();
        GA.event("Options", "reset");
      });
    }).text(i18n("resetSettings"));

    initChangelog();

    $("#credits").on("click", "[data-network]", function() {
      var link = $(this);
      GA.social(link.data("network"), link.data("action") || "show", link.attr("href") || "-");
    });
  });

  $(window).unload(function() {
    settings.ral(CONTEXT);
    localSettings.ral(CONTEXT);
  });
});
