/**
 * auth.js — Client-side auth guard.
 * Load this script in every protected page, immediately after config.js.
 *
 * Behaviour:
 *  1. No token in localStorage → redirect to login.html immediately.
 *  2. Token present → monkey-patch window.fetch so every API call carries
 *     Authorization: Bearer <token> automatically.
 *  3. Any API call returns 401 → clear token + redirect to login.html.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'ugc_auth_token';
  var ROLE_KEY  = 'ugc_auth_role';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function clearAndRedirect() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY); } catch (_) {}
    if (window.location.pathname.indexOf('login') === -1 &&
        window.location.pathname.indexOf('setup') === -1) {
      window.location.replace('./login.html');
    }
  }

  var token = getToken();
  if (!token) {
    clearAndRedirect();
    return;
  }

  // Patch window.fetch to inject the auth header on every call
  var _nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    var t = getToken();
    if (t) {
      init = init ? Object.assign({}, init) : {};
      init.headers = Object.assign({}, init.headers || {}, {
        'Authorization': 'Bearer ' + t,
      });
    }
    return _nativeFetch.call(this, input, init).then(function (response) {
      if (response.status === 401) {
        clearAndRedirect();
      }
      return response;
    });
  };

  // Expose helpers for pages that need role info
  window.__AUTH__ = {
    getToken: getToken,
    getRole:  function () { try { return localStorage.getItem(ROLE_KEY) || ''; } catch (_) { return ''; } },
    logout:   function () {
      var cfg = window.__APP_CONFIG__ || {};
      var base = (cfg.apiBaseUrl || '').replace(/\/+$/, '');
      var t = getToken();
      if (t) {
        _nativeFetch(base + '/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + t },
        }).catch(function () {});
      }
      clearAndRedirect();
    },
  };
}());
