# PseudoDOM Guard Experimental Clone

This folder is a loadable clone of the detector extension with a runtime-model import path added for local experiments.

## What changed

- `manifest.json`
  - flattened to use the files in this folder directly
  - removed missing icon references so Chrome can load the unpacked extension
- `background.js`
  - stores and retrieves an imported runtime model bundle
  - accepts `SET_RUNTIME_MODEL`, `GET_RUNTIME_MODEL`, and `CLEAR_RUNTIME_MODEL`
- `store.js`
  - persists the runtime bundle in `chrome.storage.local`
  - exports the runtime bundle with the rest of the stored data
- `popup.html`
  - adds a `Runtime Model` tab
  - provides a file picker and import / refresh / clear actions
- `popup.js`
  - loads the runtime bundle into the popup view
  - saves it locally after JSON validation

## Expected runtime JSON

The imported file should be the runtime bundle returned by the modeling server, not the raw training dataset export. The bundle should include:

- `artifact_type: "ugc_candidate_runtime_model"`
- `artifact_id`
- `feature_catalog`
- `vectorizer`
- `model`
- `thresholds`

## Local test flow

1. Load `detector_extension_experimental` as an unpacked extension in Chrome.
2. Open the popup and switch to `Runtime Model`.
3. Import the `runtime.json` downloaded from the modeling page.
4. Refresh the tab to confirm the bundle is stored.
5. Clear it if you want to reset the local state.

## Important limitation

This clone currently stores and surfaces the runtime bundle. It does not yet perform full in-extension candidate scoring on its own. That is still a separate integration step if you want the extension popup or content scripts to classify pages directly.
