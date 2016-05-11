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
    var toastDisabled = !settings.toast && !settings.toastOnPlayPause;
    $("#_toastIfMpOpen, #_toastNotIfGmActive, #_toastDuration").prop("disabled", toastDisabled);
    $("#_toastIfMpMinimized").prop("disabled", toastDisabled || !settings.toastIfMpOpen);
    $("#_toastUseMpStyle").prop("disabled", toastDisabled || !localSettings.notificationsEnabled);
    $("fieldset.toast > .notif").children("input, select").prop("disabled", toastDisabled || settings.toastUseMpStyle);
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
    var statusDiv = $("#lastfmStatus");
    var links = statusDiv.find("a");
    var userLink = links.first();
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

  function pauseOnIdleChanged() {
    $("#_pauseOnIdleSec").prop("disabled", settings.pauseOnIdleSec < 0).val(Math.abs(settings.pauseOnIdleSec));
  }

  function autoActivateGmChanged() {
    setSubsEnabled("autoActivateGm", settings.autoActivateGm);
  }

  function notificationsEnabledChanged(val) {
    settingsView.toggleClass("notifDisabled", !val);
    if (!val && settings.toast && !settings.toastUseMpStyle) $("#_toastUseMpStyle").click();//use click here to change the checkbox value
    else toastChanged();//in if clause this is triggered by the click listener on #toastUseMpStyle
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
    $("#startTimer, #_timerMinutes, #_timerNotify, #_timerPreNotify, #_timerAction").prop("disabled", timerEnd !== 0);
    $("#stopTimer").prop("disabled", !timerEnd);
  }

  function ratingModeChanged() {
    var ratingMode = bp.getRatingMode();
    settingsView.removeClass("star thumbs");
    if (ratingMode) settingsView.addClass(ratingMode);
    $("#_skipRatedLower option[value='2']").text(i18n("setting_skipRatedLower_2" + (ratingMode == "star" ? "_stars" : "")));
    $("option[value='rate-1'], option[value='rate-5']").each(function() {
      $(this).text(bp.getCommandOptionText($(this).attr("value")));
    });
  }

  function quicklinksChanged() {
    var items = [];
    [""].concat(bp.getQuicklinks()).forEach(function(ql) {
      items.push({ text: bp.getTextForQuicklink(ql), value: ql, clazz: "" });
    });
    $("#coverClickLink,#titleClickLink").each(function() { this.items = items; });
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

  function setIdAndAddItWithLabel(input, prop, synced) {
    input.attr("id", "_" + prop);
    $("#" + prop).toggleClass("synced", synced).append(input);
    return addLabel(input);
  }

  /**
   * Initialize a checkbox input for an option.
   * @param prop the option name
   * @param theSettings the settings object
   * @return the checkbox input element
   */
  function initCheckbox(prop, theSettings) {
    var input = $("<input type='checkbox'>");
    input.prop("checked", theSettings[prop]).click(boolUpdater(prop, theSettings));
    setIdAndAddItWithLabel(input, prop, theSettings == settings);
    return input;
  }

  /**
   * Initialize a color input for an option.
   * @param prop the option name in settings
   * @return the color input element
   */
  function initColorInput(prop) {
    var input = $("<input type='color'>");
    input.val(settings[prop]).change(stringUpdater(prop, settings));
    setIdAndAddItWithLabel(input, prop, true);
    return input;
  }

  /** Initialize the icon style radio buttons. */
  function initIconStyle() {
    var iconStyle = $("#iconStyle");
    $("<label>").text(i18n("setting_iconStyle")).appendTo(iconStyle);
    ["default", "grey", "phones", "phones-grey", "phones-app", "phones-beta", "favicon", "play", "app"].forEach(function(value) {
      $("<input type='radio' name='iconStyle'>").attr("value", value).click(stringUpdater("iconStyle", settings)).appendTo(iconStyle);
      $("<img src='img/icon/" + value + "/connected.png'>").appendTo(iconStyle);
    });
    iconStyle.find("input[value='" + settings.iconStyle + "']").prop("checked", true);
  }

  /** Handle the optional lyrics permission. */
  function initLyricsProviders(lyrics) {
    var providers = localSettings.lyricsProviders;

    function setEnabledStates() {
      lyrics.prop("disabled", !providers.length);
      $("#_lyricsAutoNext").prop("disabled", providers.length < 2);
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
            lyrics.prop("checked", false);
            localSettings.lyrics = false;
            lyricsChanged();
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
    var timerPreNotify = $("#_timerPreNotify");
    var max = $("#_timerMinutes").val() * 60;
    timerPreNotify.attr("max", max);
    if (timerPreNotify.val() > max) timerPreNotify.val(max);
  }

  /** Setup UI and logic for the timer. */
  function initTimer() {
    var timerMinutes = $("#_timerMinutes").unbind().change(updatePreNotifyMax);
    var timerNotify = $("#_timerNotify").unbind();
    var timerPreNotify = $("#_timerPreNotify").unbind();
    var timerAction = $("#_timerAction").unbind();
    $("#startTimer").text(i18n("startTimer")).click(function() {
      var min = timerMinutes.val();
      if (min) {
        localSettings.timerMinutes = min;
        localSettings.timerAction = timerAction.val();
        localSettings.timerNotify = timerNotify.prop("checked");
        localSettings.timerPreNotify = timerPreNotify.val();
        localSettings.timerEnd = $.now() / 1000 + min * 60;
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
    $("#_optionsMode").change(optionsModeChanged);
    optionsModeChanged();

    $("#filter p").text(i18n("filterHint"));

    $("#filter .i-c").each(function() {
      var id = this.id;
      var label = $(this).children("label").removeAttr("for");
      function updateFilter() {
        settingsView.toggleClass(id, !settings[id]);
        label.html(settings[id] ? "<a href='#" + id.replace("filter", "legend") + "'>" + label.text() + "</a>" : label.text());
      }
      $("#_" + id).click(updateFilter);
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

  function initInputs() {
    function getSettings(inputContainer) {
      return inputContainer.hasClass("local") ? localSettings : settings;
    }
    $(".i-c").each(function() {
      initCheckbox(this.id, getSettings($(this)));
    });
    $(".i-co").each(function() {
      initColorInput(this.id);
    });
    $(".i-h").each(function() {
      initHint(this.id);
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
    var settingsready = new Event("settingsready");
    settingsready.settings = settings;
    settingsready.localSettings = localSettings;
    settingsready.context = CONTEXT;
    settingsready.optionsTextGetter = {
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
    $(".pp-input").each(function() {
      this.dispatchEvent(settingsready);
    });

    $("head > title").text(i18n("options") + " - " + i18n("extTitle"));
    initLegends();

    $("#lastfmStatus").find("span").text(i18n("lastfmUser"));
    $("#bugfeatureinfo").html(i18n("bugfeatureinfo", "<a target='_blank' href='https://github.com/svenackermann/Prime-Player-Google-Play-Music/issues' data-network='github' data-action='issue'>GitHub</a>"));

    initInputs();

    initTimer();

    //{ last.fm settings
    var percentSpan = $("#scrobblePercent").find("span");
    percentSpan.text(settings.scrobblePercent);
    var scrobblePercent = $("#_scrobblePercent");
    scrobblePercent
      .val(settings.scrobblePercent)
      .mouseup(numberUpdater("scrobblePercent", settings))
      .change(function() { percentSpan.text($(this).val()); });
    addLabel(scrobblePercent);
    $("#_linkRatings").click(linkRatingsChanged);
    //}

    //{ toast settings
    $("#notificationDisabledWarning").text(i18n("notificationsDisabled"));
    $("#_toast,#_toastOnPlayPause,#_toastIfMpOpen,#_toastUseMpStyle").click(toastChanged);
    //}

    //{ miniplayer settings
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
    $("#_miniplayerType")
      .change(setLayoutHintVisibility)
      .siblings(".hint-text").find("a").text("chrome://flags").attr("tabindex", "0").click(function() { chrome.tabs.create({ url: "chrome://flags/#enable-panels" }); });
    $("#_layout").change(setLayoutHintVisibility);
    setLayoutHintVisibility();
    //}

    //{ lyrics settings
    var lyrics = $("#_lyrics").click(lyricsChanged);
    initLyricsProviders(lyrics);
    $("#_lyricsInGpm").click(lyricsChanged);
    //}

    //{ look & feel settings
    $("#shortcutsLink").text(i18n("configShortcuts")).click(function() { chrome.tabs.create({ url: "chrome://extensions/configureCommands" }); });
    initIconStyle();
    $("#_showProgress").click(showProgressChanged);

    $("#iconClickActionTitle").text(i18n("iconClickActionTitle"));
    $("select[id^='_iconClickAction']")
      .change(iconClickChanged)
      .find("option[value='']").text(i18n("openPopup"));
    $("#_iconDoubleClickTime").change(iconClickChanged);

    $("#_saveLastPosition").click(saveLastPositionChanged);
    $("#_starRatingMode").click(ratingModeChanged);
    $("#_startupAction option[value='']").text(i18n("command_"));
    $("#_autoActivateGm").click(autoActivateGmChanged);
    //}

    //watch this if changed via miniplayer or context menu
    settings.al("scrobble", scrobbleChanged, CONTEXT);
    //we must watch this as the session could be expired
    localSettings.w("lastfmSessionName", lastfmUserChanged, CONTEXT);
    //show/hide notification based options
    localSettings.w("notificationsEnabled", notificationsEnabledChanged, CONTEXT);
    //update timer
    localSettings.w("timerEnd", timerEndChanged, CONTEXT);
    localSettings.al("timerAction", function(val) { $("#_timerAction").val(val); }, CONTEXT);
    localSettings.al("timerMinutes", function(val) {
      $("#_timerMinutes").val(val);
      updatePreNotifyMax();
    }, CONTEXT);
    //Google account dependent options
    localSettings.w("ratingMode", ratingModeChanged, CONTEXT);
    localSettings.w("quicklinks", quicklinksChanged, CONTEXT);
    localSettings.w("syncSettings", function(val) { $("body").toggleClass("syncenabled", val); }, CONTEXT);
    localSettings.al("syncSettings", function() { location.reload(); }, CONTEXT);

    //disable inputs if neccessary
    lyricsChanged();
    iconClickChanged();
    showProgressChanged();
    saveLastPositionChanged();
    pauseOnIdleChanged();
    autoActivateGmChanged();

    $("#resetSettings").click(function() {
      if (confirm(i18n("resetSettingsConfirm"))) {
        settings.reset();
        localSettings.reset();
        GA.event("Options", "reset");
        location.reload();
      }
    }).text(i18n("resetSettings"));

    //tell the background page that we're open
    if (bp.optionsWin) try {
      bp.optionsWin.close();
    } catch (e) {
      console.error(e);
    }
    bp.optionsWin = window;

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
    if (bp.optionsWin == window) bp.optionsWin = null;
  });
});
