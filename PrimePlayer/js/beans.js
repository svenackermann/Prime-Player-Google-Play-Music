/**
 * Utility class to make properties of an object observable.
 * This also includes the ability to sync the properties with localstorage.
 * @author Sven Recknagel (svenrecknagel@googlemail.com)
 * Licensed under the BSD license
 */
function Bean(defaults, syncLocalStorage) {
  this.cache = {};
  this.listeners = {};
  this.syncLocalStorage = syncLocalStorage || false;
  this.equalsFn = {};
  var useSyncStorage = false;
  var saveSyncStorageTimer;
  var that = this;
  
  function notify(prop, old, val) {
    var listeners = that.listeners[prop];
    if (listeners.length > 0) {
      for (var i in listeners) {
        listeners[i](val, old, prop);
      }
    }
  }
  
  this.addListener = function(prop, listener) {
    var listeners = that.listeners[prop];
    if (listeners) listeners.push(listener);
  }
  
  this.removeListener = function(prop, listener) {
    var listeners = that.listeners[prop];
    if (listeners) {
      for (var i in listeners) {
        if (listener == listeners[i]) {
          listeners.splice(i, 1);
          return;
        }
      }
    }
  }
  
  this.watch = function(prop, listener) {
    listener(that.cache[prop], that.cache[prop], prop);
    that.addListener(prop, listener);
  }
  
  this.setEqualsFn = function(prop, equalsFn) {
    that.equalsFn[prop] = equalsFn;
  }
  
  function loadSyncStorage(doneCallback) {
    chrome.storage.sync.get(null, function(items) {
      var error = chrome.runtime.lastError;
      if (error) {
        console.warn("Could not load settings: " + error.message);
        setTimeout(that.loadSyncStorage, 30000);//try again in 30s
      } else {
        for (var prop in items) {
          that[prop] = items[prop];
        }
        if (typeof(doneCallback) == "function") doneCallback();
      }
    });
  }
  
  function saveSyncStorage() {
    clearTimeout(saveSyncStorageTimer);
    saveSyncStorageTimer = setTimeout(function() {
      chrome.storage.sync.set(that.cache, function() {
        var error = chrome.runtime.lastError;
        if (error) {
          console.warn("Could not store settings: " + error.message);
          saveSyncStorage();//try again in 10s
        } else console.debug("Storage successfully synced.");
      });
    }, 10000);
  }
  
  this.setSyncStorage = function(syncStorage, syncedCallback) {
    if (syncStorage) {
      loadSyncStorage(syncedCallback);
    } else {
      clearTimeout(saveSyncStorageTimer);
    }
    useSyncStorage = syncStorage;
  }
  
  /**
   * Adds all properties from defaultValue to value that do not yet exist there.
   */
  function merge(value, defaultValue) {
    for (var prop in defaultValue) {
      if (value[prop] == null) value[prop] = defaultValue[prop];
    }
    return value;
  }
  
  /**
   * Convert string value to correct type.
   */
  function parse(name, defaultValue) {
    if (!that.syncLocalStorage || localStorage[name] == undefined) {
      return defaultValue;
    }
    var value = localStorage[name];
    var type = value.substr(0, 1);
    value = value.substring(1, value.length);
    switch (type) {
      case "o": return merge(JSON.parse(value), defaultValue);
      case "b": return value == "true";
      case "n": return parseFloat(value);
      default: return value;
    }
  }
  
  function defaultEquals(val, old) {
    return typeof(val) != "object" && val === old;
  }
  
  function setting(name, defaultValue) {
    that.cache[name] = parse(name, defaultValue);
    that.listeners[name] = [];
    
    that.__defineGetter__(name, function() {
      return that.cache[name];
    });
    
    that.__defineSetter__(name, function(val) {
      var old = that.cache[name];
      var equals = that.equalsFn[name];
      if (equals == null) equals = defaultEquals;
      if (equals(val, old)) {
        return;
      }
      if (that.syncLocalStorage) {
        if (val == null) {
          localStorage.removeItem(name);
        } else {
          var type = typeof(val);
          if (type == "function") throw "cannot store a function in localstorage";
          localStorage[name] = type.substr(0, 1) + ((type == 'object') ? JSON.stringify(val) : val);
        }
      }
      that.cache[name] = val;
      if (useSyncStorage) saveSyncStorage();
      notify(name, old, val);
    });
  }
  
  for (var prop in defaults) {
    setting(prop, defaults[prop]);
  }
}
