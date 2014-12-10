/**
 * Utility class to make properties of an object observable.
 * This also includes the ability to sync the properties with localstorage.
 * @param defaults object with default values, every value in this object will be observable using "addListener" or "watch"
 * @param useLocalStorage whether to save values in localStorage, defaults to false
 */
/**
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 * @license BSD license
 */

/* global chrome */

function Bean(defaults, useLocalStorage) {
  var cache = {};
  var listeners = {};
  var syncLocalStorage = useLocalStorage || false;
  var equalsFn = {};
  var useSyncStorage = false;
  var saveSyncStorageTimer;
  var that = this;
  
  function notify(prop, old, val) {
    listeners[prop].forEach(function(ls) {
      ls.listener(val, old, prop);
    });
  }
  
  /**
   * Adds a listener function for the given property.
   * The function gets passed 3 parameters:
   * 1. the new value
   * 2. the previous value
   * 3. the name of the property
   * If the value has been set but did not actually change, the listeners won't be notified.
   */
  this.addListener = function(prop, listener, src) {
    var ls = listeners[prop];
    if (ls) ls.push({listener: listener, src: src || null});
  };
  
  /** Removes a listener function for the given property. */
  this.removeListener = function(prop, listener) {
    var ls = listeners[prop];
    if (ls) {
      ls.some(function(l, i) {
        if (listener == l.listener) {
          ls.splice(i, 1);
          return true;
        }
      });
    }
  };
  
  /** Removes all listeners for the given source. */
  this.removeAllListeners = function(src) {
    src = src || null;
    for (var prop in listeners) {
      var ls = listeners[prop];
      for (var i = 0; i < ls.length;) {
        if (src === ls[i].src) ls.splice(i, 1);
        else i++;
      }
    }
  };
  
  /** Same as addListener, except that the listener will be called immediately with the current value for old and new value. */
  this.watch = function(prop, listener, src) {
    listener(cache[prop], cache[prop], prop);
    that.addListener(prop, listener, src);
  };
  
  /**
   * Allows to set a function that checks equality for a given property.
   * On modification, this function will be used to check if the listeners must be notified.
   * The default is to check if old and new value are the same (===) and setting a property of type object will always notify.
   */
  this.setEqualsFn = function(prop, equals) {
    equalsFn[prop] = equals;
  };
  
  /** Load properties from synced storage, call cb when done. */
  function loadSyncStorage(cb) {
    chrome.storage.sync.get(null, function(items) {
      var error = chrome.runtime.lastError;
      if (error) {
        console.warn("Could not load settings: " + error.message);
        setTimeout(loadSyncStorage, 30000);//try again in 30s
      } else {
        for (var prop in items) {
          that[prop] = items[prop];
        }
        if (typeof(cb) == "function") cb();
      }
    });
  }
  
  /** Save current values to synced storage. */
  function saveSyncStorage() {
    clearTimeout(saveSyncStorageTimer);
    saveSyncStorageTimer = setTimeout(function() {
      chrome.storage.sync.set(cache, function() {
        var error = chrome.runtime.lastError;
        if (error) {
          console.warn("Could not store settings: " + error.message);
          saveSyncStorage();//try again in 10s
        } else console.debug("Storage successfully synced.");
      });
    }, 10000);
  }
  
  /**
   * Set if the values should be synced with Chrome sync.
   * If true, the callback will be called after loading the settings.
   */
  this.setSyncStorage = function(syncStorage, syncedCallback) {
    if (syncStorage) {
      loadSyncStorage(syncedCallback);
    } else {
      clearTimeout(saveSyncStorageTimer);
    }
    useSyncStorage = syncStorage;
  };
  
  /**
   * Resets all values of this bean to their defaults.
   * The values are also removed from localStorage/Chrome sync, if this bean uses it.
   */
  this.resetToDefaults = function() {
    for (var prop in defaults) {
      that[prop] = defaults[prop];
      if (syncLocalStorage) localStorage.removeItem(prop);
    }
    if (useSyncStorage) {
      clearTimeout(saveSyncStorageTimer);
      chrome.storage.sync.clear();
    }
  };
  
  /**
   * Adds all properties from defaultValue to value that do not yet exist there.
   * @return value
   */
  function merge(value, defaultValue) {
    for (var prop in defaultValue) {
      if (value[prop] == null) value[prop] = defaultValue[prop];// jshint ignore:line
    }
    return value;
  }
  
  /** @return value from localStorage converted to correct type */
  function parse(name, defaultValue) {
    if (!syncLocalStorage || localStorage[name] === undefined) {
      return defaultValue;
    }
    var value = localStorage[name];
    var type = value.substr(0, 1);
    value = value.substr(1);
    switch (type) {
      case "o": return merge(JSON.parse(value), defaultValue);
      case "b": return value == "true";
      case "n": return parseFloat(value);
      default: return value;
    }
  }
  
  /** @return true, if both values are the same, for objects always returns false (except for null==null) */
  function defaultEquals(val, old) {
    //setting the same object again should always trigger notify, except for setting null to null (typeof(null) is object)
    return val === old && (typeof(val) != "object" || val === null);
  }
  
  /** Setup an object property with the given name */
  function setting(name, defaultValue) {
    cache[name] = parse(name, defaultValue);
    listeners[name] = [];
    
    Object.defineProperty(that, name, {
      get: function() {
        return cache[name];
      },
      set: function(val) {
        var old = cache[name];
        var equals = equalsFn[name];
        if (typeof(equals) != "function") equals = defaultEquals;
        if (equals(val, old)) {
          return;
        }
        if (syncLocalStorage) {
          if (val == null) {// jshint ignore:line
            localStorage.removeItem(name);
          } else {
            var type = typeof(val);
            if (type == "function") throw "cannot store a function in localstorage";
            localStorage[name] = type.substr(0, 1) + ((type == "object") ? JSON.stringify(val) : val);
          }
        }
        cache[name] = val;
        if (useSyncStorage) saveSyncStorage();
        notify(name, old, val);
      },
      enumerable: true
    });
  }
  
  for (var prop in defaults) {
    setting(prop, defaults[prop]);
  }
}

/**
 * Compares 2 objects. This method has some limitations, but should work in most cases.
 * This is no deep-equals, so properties are only compared at the root level.
 * Also, if one object has a property with value "undefined" and the other does not have that property at all, false will be returned.
 * @return true, if all properties of both objects match
 */
Bean.objectEquals = function(o1, o2) {
  if (o1 === o2) return true;//same or both null
  if (!o1 || !o2) return false;//one is null, the other not
  var props = Object.getOwnPropertyNames(o1);
  if (props.length != Object.getOwnPropertyNames(o2).length) return false;//different properties
  return props.every(function(prop) {
    return o1[prop] === o2[prop];//different value for this property or o2 does not have it at all
  });
};
