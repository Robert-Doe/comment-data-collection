'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function getMonitorContext() {
  return storage.getStore() || null;
}

function runWithMonitorContext(context, callback) {
  const value = context && typeof context === 'object' ? context : {};
  return storage.run(value, callback);
}

function updateMonitorContext(patch) {
  const current = storage.getStore();
  if (!current || !patch || typeof patch !== 'object') {
    return current || null;
  }

  Object.assign(current, patch);
  return current;
}

module.exports = {
  getMonitorContext,
  runWithMonitorContext,
  updateMonitorContext,
};
