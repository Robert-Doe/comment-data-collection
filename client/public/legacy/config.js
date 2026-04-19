(function () {
  var storageKey = 'comment-data-collection.apiBaseUrl';
  var search = new URLSearchParams(window.location.search);
  var apiBaseUrl = search.get('apiBaseUrl') || '';

  if (!apiBaseUrl) {
    try {
      apiBaseUrl = window.localStorage.getItem(storageKey) || '';
    } catch (_) {
      apiBaseUrl = '';
    }
  } else {
    try {
      window.localStorage.setItem(storageKey, apiBaseUrl);
    } catch (_) {}
  }

  window.__APP_CONFIG__ = {
    apiBaseUrl: apiBaseUrl,
  };
}());
