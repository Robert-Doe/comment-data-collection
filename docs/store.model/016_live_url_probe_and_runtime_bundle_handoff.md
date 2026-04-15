# Live URL Probe and Runtime Bundle Handoff

Date: `2026-04-15`

This note explains the new experimental path for:

- probing one live URL from the modeling UI
- choosing `default` or `repetition_first` candidate mode
- downloading a runtime model bundle from the modeling server
- importing that bundle into the cloned detector extension for local testing

## What the website now does

The modeling page has a `Live URL Probe` tab. It accepts:

- a trained `modelId`
- a target URL
- a candidate mode

The API route is `POST /api/modeling/probe-url`. It:

1. normalizes the URL
2. scans the page with `scanUrl(...)`
3. preserves the chosen `candidateMode`
4. scores the resulting candidates with the selected model
5. returns a page-level summary plus per-candidate explanations

The returned data is what the UI renders as the live probe result.

## What the clone now does

The new `detector_extension_experimental` folder is a flattened, loadable copy of the detector extension. It adds a local runtime-model import path so you can bring the downloaded `runtime.json` bundle into Chrome storage without changing the production extension.

The important storage path is:

- `chrome.storage.local`
- key: `pseudodom_runtime_model`

The popup uses that stored bundle only for inspection and persistence at this stage.

## Runtime bundle contract

The imported JSON should look like the `runtime.json` produced by the modeling server. The key fields are:

- `artifact_type: "ugc_candidate_runtime_model"`
- `artifact_id`
- `variant_id`
- `algorithm`
- `thresholds`
- `feature_catalog`
- `vectorizer`
- `model`

The popup validates that the bundle has the runtime-model shape before saving it.

## Experimental usage

The point of this branch of the work is comparison, not replacement:

- `default` mode remains the existing candidate pipeline
- `repetition_first` changes the promotion priority so repetition can surface more candidates for review
- both modes keep the same downstream scoring and exported artifacts, so candidate counts can be compared cleanly

If you want to study recall effects, compare:

- candidate count
- detected candidate count
- page-level verdict
- number of nested / overlapping regions that survive

## Known limitation

The extension clone currently accepts and stores the runtime bundle, but it does not yet run the full detector model directly inside the popup or background worker. That would require one more integration step to bridge the stored runtime bundle into the page-level feature extraction pipeline.
