/**
 * This script is based on Felix Bruns' work.
 * Here just everything that is not needed for Prime Player has been removed.
 * We also use jQuery to save some code and store the session info and a sessionTimeoutCallback in the object.
 */
/**
 * @license Copyright (c) 2008-2010, Felix Bruns <felixbruns@web.de>
 * @author Sven Ackermann (svenrecknagel@gmail.com)
 */

/* global hex_md5 */
/* exported LastFM */

function LastFM(apiKey, apiSecret) {
  var apiUrl    = "https://ws.audioscrobbler.com/2.0/";

  this.session = {};
  this.sessionTimeoutCallback = null;
  this.unavailableMessage = null;
  var that = this;

  /* Internal call (POST, GET). */
  var internalCall = function(params, callbacks, requestMethod) {
    console.debug("last.fm call:", params.method);
    params.format = "json";
    $.ajax({
      type: requestMethod,
      url: apiUrl,
      data: params,
      timeout: 10000
    }).done(function(response) {
      if (response.error) {
        if ($.isFunction(callbacks.error)) {
          callbacks.error(response.error, response.message);
        }
        if (response.error == 9 && $.isFunction(that.sessionTimeoutCallback)) {
          that.sessionTimeoutCallback();
        }
      } else {
        callbacks.success(response);
      }
    }).fail(function(jqXHR, textStatus, errorThrown) {
      if ($.isFunction(callbacks.error)) {
        var msg = textStatus;
        if (jqXHR.status) msg += " " + jqXHR.status;
        if (errorThrown && errorThrown != textStatus) msg += " " + errorThrown;
        if (that.unavailableMessage) msg = that.unavailableMessage + " (" + msg + ")";
        callbacks.error(-1, msg);
      }
    });
  };

  /* Normal method call. */
	var call = function(method, params, callbacks, requestMethod) {
		/* Set default values. */
		params        = params        || {};
		callbacks     = callbacks     || {};
		requestMethod = requestMethod || "GET";

		/* Add parameters. */
		params.method  = method;
		params.api_key = apiKey;

		/* Call method. */
		internalCall(params, callbacks, requestMethod);
	};
  
  /* Signed method call. */
  var signedCall = function(method, params, callbacks, requestMethod) {
    /* Set default values. */
    params        = params        || {};
    callbacks     = callbacks     || {};
    requestMethod = requestMethod || "GET";

    /* Add parameters. */
    params.method  = method;
    params.api_key = apiKey;

    /* Add session key. */
    if(that.session.key) {
      params.sk = that.session.key;
    }

    /* Get API signature. */
    params.api_sig = auth.getApiSignature(params);

    /* Call method. */
    internalCall(params, callbacks, requestMethod);
  };

  /* Auth methods. */
  this.auth = {
    getSession : function(params, callbacks) {
      signedCall("auth.getSession", params, callbacks);
    }
  };

  /* Track methods. */
  this.track = {
    getInfo : function(params, callbacks) {
      call("track.getInfo", params, callbacks);
    },

    love : function(params, callbacks) {
      signedCall("track.love", params, callbacks, "POST");
    },

    scrobble : function(params, callbacks) {
      signedCall("track.scrobble", params, callbacks, "POST");
    },

    unlove : function(params, callbacks) {
      signedCall("track.unlove", params, callbacks, "POST");
    },

    updateNowPlaying : function(params, callbacks) {
      signedCall("track.updateNowPlaying", params, callbacks, "POST");
    }
  };

  /* Private auth methods. */
  var auth = {
    getApiSignature : function(params) {
      var keys   = [];
      var string = "";

      for(var param in params) {
        keys.push(param);
      }

      keys.sort();

      for(var index in keys) {
        var key = keys[index];

        string += key + params[key];
      }

      string += apiSecret;

      return hex_md5(string);
    }
  };
  
  this.getLoginUrl = function(callbackUrl) {
    return "http://www.last.fm/api/auth?api_key=" + apiKey + "&cb=" + callbackUrl;
  };
}
