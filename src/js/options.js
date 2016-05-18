/**
 * This is the script for the options page.
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome, initGA */
/* jshint jquery: true */

chrome.runtime.getBackgroundPage(function(bp) {
  var CONTEXT = "options";
  var CHANGELOG_STORAGE_KEY = "releases";
  var settingsView = $("#settings");
  var i18n = chrome.i18n.getMessage;
  var settings = bp.settings;
  var localSettings = bp.localSettings;

  /** Google analytics */
  var GA = initGA(settings, CONTEXT);

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type == "lastfmStatusChanged") {
      var statusDiv = $("#lastfmStatus");
      statusDiv.find("img").hide();

      if (msg.status === false) statusDiv.find(".loader").show();
      else if (msg.status === true) statusDiv.find(".success").attr("title", i18n("lastfmConnectSuccess")).show();
      else if (typeof msg.status == "string") statusDiv.find(".failure").attr("title", status).show();
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

  function lyricsChanged() {
    setSubsEnabled("lyrics", localSettings.lyrics);
    $("#lyricsWidth").prop("disabled", !localSettings.lyrics || !settings.lyricsInGpm);
    $("paper-item.lyrics").prop("disabled", !localSettings.lyrics);
  }

  function lastfmUserChanged(user) {
    var action;
    var actionText;
    $("#scrobble, #linkRatings, #showLovedIndicator, paper-item.lastfm").prop("disabled", !user);
    scrobbleChanged();
    linkRatingsChanged();
    var statusDiv = $("#lastfmStatus");
    var userLink = statusDiv.find("a");
    if (user) {
      action = function() {
        statusDiv.find("img").hide();
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

  function iconClickChanged() {
    var noClickTime = $("#iconDoubleClickTime").prop("disabled", !settings.iconClickAction0).val() == "0";
    [1, 2, 3].forEach(function(index) {
      var noPrevAction = !settings["iconClickAction" + (index - 1)];
      if (noPrevAction) settings["iconClickAction" + index] = "";
      $("#iconClickAction" + index).prop("disabled", noPrevAction || noClickTime);
    });
  }

  function showProgressChanged(val) {
    setSubsEnabled("showProgress", val);
  }

  function saveLastPositionChanged(val) {
    $("paper-item.resumeLastSong").prop("disabled", !val);
  }

  function pauseOnIdleChanged(val) {
    setSubsEnabled("pauseOnIdle", val);
  }

  function autoActivateGmChanged(val) {
    setSubsEnabled("autoActivateGm", val);
  }

  function notificationsEnabledChanged(val) {
    settingsView.toggleClass("notifDisabled", !val);
    toastChanged();
  }

  var countdownInterval;
  function updateTimerStatus(timerEnd) {
    var countdown = Math.floor((timerEnd || 0) - $.now() / 1000);
    if (countdown > 0) {
      $("#timerStatus").text(i18n("setting_timerAction_" + localSettings.timerAction) + " in " + bp.toTimeString(countdown));
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
    $("#startTimer, #timerMinutes, #timerNotify, #timerPreNotify, #timerAction").prop("disabled", timerEnd !== 0);
    $("#stopTimer").prop("disabled", !timerEnd);
  }

  function ratingModeChanged() {
    var ratingMode = bp.getRatingMode();
    settingsView.removeClass("star thumbs");
    if (ratingMode) settingsView.addClass(ratingMode);
    $("#skipRatedLower")[0].setText(2, i18n("setting_skipRatedLower_2" + (ratingMode == "star" ? "_stars" : "")));
    $("#toastClick,pp-select[from='#toastClick']").each(function() {
      var input = this;
      input.items.forEach(function(item, index) {
        if (item.value == "rate-1" || item.value == "rate-5") input.setText(index, bp.getCommandOptionText(item.value));
      });
    });
  }

  function quicklinksChanged() {
    var items = [];
    [""].concat(bp.getQuicklinks()).forEach(function(ql) {
      items.push({ text: bp.getTextForQuicklink(ql), value: ql, clazz: "" });
    });
    $("#coverClickLink,#titleClickLink").each(function() { this.setItems(items); });
  }

  /** the i18n key for the label is "setting_" + prop */
  function addLabel(input) {
    return $("<label>").attr("for", input.attr("id")).text(i18n("setting_" + input.parent().attr("id"))).insertAfter(input);
  }

  function setIdAndAddItWithLabel(input, prop, synced) {
    input.attr("id", "_" + prop);
    $("#" + prop).toggleClass("synced", synced).append(input);
    return addLabel(input);
  }

  function confirmDialog(content, onConfirm) {
    var dialog = $("#confirmDialog");
    $("p", dialog).text(content);
    dialog.unbind().on("iron-overlay-closed", function(e) {
      if (e.detail.confirmed) onConfirm();
    });
    dialog[0].open();
  }

  /** Handle the optional lyrics permission. */
  function initLyricsProviders() {
    var providers = localSettings.lyricsProviders;

    function setEnabledStates() {
      $("#lyrics").prop("disabled", !providers.length);
      $("#lyricsAutoNext").prop("disabled", providers.length < 2);
    }
    setEnabledStates();

    var draggableSelector = "fieldset.lyrics.sortable>[draggable='true']";
    var droppableSelector = draggableSelector + "," + draggableSelector + "+div";
    $("#settings")
      .on("dragover", droppableSelector, function(ev) {
        var types = ev.originalEvent.dataTransfer.types;
        var providerName = $(this).data("provider");
        var validTarget = providerName ? types.indexOf("srcprovider/" + providerName) < 0 && types.indexOf("srcprovider/next/" + providerName) < 0 : types.indexOf("srcprovider/" + providers[providers.length - 1]) < 0;
        var dropAllowed = types.indexOf("srcprovider") >= 0 && validTarget;
        $(this).toggleClass("dragging", dropAllowed);
        return !dropAllowed;
      }).on("dragleave", droppableSelector, function() {
        $(this).removeClass("dragging");
      }).on("drop", droppableSelector, function(ev) {
        $(this).removeClass("dragging");
        var src = ev.originalEvent.dataTransfer.getData("srcprovider");
        if (!src) return false;//just to be sure (in this cases the dragover handler should not allow dropping)
        providers.splice(providers.indexOf(src), 1);
        var providerName = $(this).data("provider");
        if (providerName) providers.splice(providers.indexOf(providerName), 0, src);
        else providers.push(src);
        localSettings.lyricsProviders = providers;//trigger listeners
        sortProviders();
        return false;
      }).on("dragstart", draggableSelector, function(ev) {
        var dt = ev.originalEvent.dataTransfer;
        var providerName = $(this).data("provider");
        dt.setData("srcprovider", providerName);
        dt.setData("srcprovider/" + providerName, "");
        var nextProvider = providers[providers.indexOf(providerName) + 1];
        dt.setData("srcprovider/next/" + nextProvider, "");
      });

    function sortProviders() {
      var prev = $(".lyrics-providers").first().prev();
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
      div.data("provider", providerName);

      var checkbox = $("<input type='checkbox'>");
      var label = setIdAndAddItWithLabel(checkbox, id, false);
      var link = $("<a target='_blank'>").attr("href", provider.getHomepage()).text(provider.getUrl());
      label.html(link);

      function setDraggable(draggable) {
        div.attr("draggable", draggable);
        div.parent().toggleClass("sortable", providers.length > 1);
      }

      function setProviderEnabled(enabled) {
        if (enabled) {
          providers.push(providerName);
        } else {
          var index = providers.indexOf(providerName);
          providers.splice(index, 1);
          if (!providers.length && localSettings.lyrics) {
            localSettings.lyrics = false;
          }
        }
        localSettings.lyricsProviders = providers;//trigger listeners
        setDraggable(enabled);
        sortProviders();
        setEnabledStates();
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
            checkbox.prop("checked", false);
            confirmDialog(i18n("lyricsAlert", provider.getUrl()), function() {
              provider.requestPermission(function(granted) {
                if (granted) {
                  setProviderEnabled(true);
                  enableCheckBox();
                }
              });
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
    var max = $("#timerMinutes").val() * 60;
    timerPreNotify.attr("max", max);
    if (timerPreNotify.val() > max) timerPreNotify.val(max);
  }

  /** Setup UI and logic for the timer. */
  function initTimer() {
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
    $("#stopTimer").text(i18n("stopTimer")).click(bp.clearSleepTimer);
    updatePreNotifyMax();
  }

  /** Setup UI and logic for the options filter. */
  function initFilter() {
    settings.w("optionsMode", function(val) { settingsView.removeClass("f-beg f-adv f-exp").addClass("f-" + val); }, CONTEXT);

    $("#filter p").text(i18n("filterHint"));

    $("#filter pp-toggle").each(function() {
      settings.w(this.id, function(val, old, prop) { settingsView.toggleClass(prop, !val); }, CONTEXT);
    });
  }

  /** Set labels and hints for the legends. */
  function initLegends() {
    $("#settings legend").each(function() {
      $(this).text(i18n(this.id));
      var hint = $("<p class='hint-text'></p>").text(i18n(this.id + "Hint")).insertAfter(this);
      $("<img src='img/hint.png' class='hint'/>").click(function() { hint.slideToggle("fast"); }).appendTo(this);
    });
  }

  function initInputs() {
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

    //mark new features
    if (bp.previousVersion) {
      $("div[class*='v-']").each(function() {
        var version = extractVersionFromClass(this);
        if (bp.isNewerVersion(version)) $(this).addClass("newFeature");
      });
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
    $("#confirmDialog [dialog-dismiss]").text(i18n("dialogCancel"));

    $("head > title").text(i18n("options") + " - " + i18n("extTitle"));
    initLegends();

    $("#lastfmStatus").find("span").text(i18n("lastfmUser"));
    $("#bugfeatureinfo").html(i18n("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenackermann/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>"));

    initInputs();

    initTimer();

    //{ last.fm settings
    settings.al("linkRatings", linkRatingsChanged, CONTEXT);
    //}

    //{ toast settings
    $("#notificationDisabledWarning div").text(i18n("notificationsDisabled"));

    settings.al("toast toastOnPlayPause toastIfMpOpen toastUseMpStyle", toastChanged, CONTEXT);
    //}

    //{ miniplayer settings
    $("#miniplayerType .hint-content a").text("chrome://flags").attr("tabindex", "0").click(function() { chrome.tabs.create({ url: "chrome://flags/#enable-panels" }); });
    function setLayoutHintVisibility() {
      var panel = settings.miniplayerType == "panel" || settings.miniplayerType == "detached_panel";
      $("#miniplayerType .hint-trigger").toggle(panel);
      $("#layout .hint-trigger").toggle(panel && settings.layout == "hbar");
    }

    settings.w("miniplayerType layout", setLayoutHintVisibility, CONTEXT);
    //}

    //{ lyrics settings
    localSettings.w("lyrics", lyricsChanged, CONTEXT);
    settings.al("lyricsInGpm", lyricsChanged, CONTEXT);
    initLyricsProviders();
    //}

    //{ look & feel settings
    $("#shortcutsLink").text(i18n("configShortcuts")).click(function() { chrome.tabs.create({ url: "chrome://extensions/configureCommands" }); });
    $("#iconClickActionTitle").text(i18n("iconClickActionTitle"));
    $("pp-select[id^='iconClickAction']").each(function() { this.setText(0, i18n("openPopup")); });
    $("#startupAction")[0].setText(0, i18n("command_"));

    settings.w("showProgress", showProgressChanged, CONTEXT);
    settings.w("iconClickAction0 iconClickAction1 iconClickAction2 iconClickAction3 iconDoubleClickTime", iconClickChanged, CONTEXT);
    settings.w("saveLastPosition", saveLastPositionChanged, CONTEXT);
    settings.w("pauseOnIdle", pauseOnIdleChanged, CONTEXT);
    settings.w("starRatingMode", ratingModeChanged, CONTEXT);
    settings.w("autoActivateGm", autoActivateGmChanged, CONTEXT);
    //}

    //watch this if changed via miniplayer or context menu
    settings.al("scrobble", scrobbleChanged, CONTEXT);
    //we must watch this as the session could be expired
    localSettings.w("lastfmSessionName", lastfmUserChanged, CONTEXT);
    //show/hide notification based options
    localSettings.w("notificationsEnabled", notificationsEnabledChanged, CONTEXT);
    //update timer
    localSettings.w("timerEnd", timerEndChanged, CONTEXT);
    localSettings.al("timerMinutes", updatePreNotifyMax, CONTEXT);
    //Google account dependent options
    localSettings.al("ratingMode", ratingModeChanged, CONTEXT);
    localSettings.w("quicklinks", quicklinksChanged, CONTEXT);
    localSettings.w("syncSettings", function(val) { $("body").toggleClass("syncenabled", val); }, CONTEXT);

    $("#resetSettings").on("tap", function() {
      confirmDialog(i18n("resetSettingsConfirm"), function() {
        settings.reset();
        localSettings.reset();
        GA.event("Options", "reset");
        location.reload();
      });
    }).text(i18n("resetSettings"));

    initChangelog();

    $("#changelog").on("click", "input[type='checkbox']", function() {
      $("#changelog").toggleClass(this.id.substr(3,1));
    });

    $("#credits").on("click", "[data-network]", function() {
      var link = $(this);
      GA.social(link.data("network"), link.data("action") || "show", link.attr("href") || "-");
    });

    initFilter();
  });

  $(window).unload(function() {
    settings.ral(CONTEXT);
    localSettings.ral(CONTEXT);
  });
});
