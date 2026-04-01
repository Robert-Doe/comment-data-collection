# How The Detector Extension Will Use The Model

Date: `2026-04-01`

## 1. The current state

Today, the `detector_extension` still uses:

- `HeuristicClassifier`

inside:

- `detector_extension/injected_wrapper.js`

That heuristic is the placeholder for the trained model.

## 2. The main runtime object in the extension

The extension stores candidate confidence scores in:

- `ugcRegionMap`

So when the trained model is integrated, its probabilities should end up in
`ugcRegionMap`.

## 3. The future scoring loop

The intended runtime flow is:

1. Generate candidate roots.
2. Extract features for each candidate.
3. Load `runtime.json`.
4. Vectorize the candidate's `feature_values`.
5. Compute `probability = sigmoid(bias + dot(weights, vector))`.
6. Store that probability in `ugcRegionMap`.
7. Use thresholds to decide low, uncertain, or high-confidence UGC regions.

## 4. Where feature extraction already exists

The extension already has:

- `detector_extension/feature_extractor.js`

with the function:

```js
extractFeatures(el, pseudoNode, candidateMeta, pageSignals)
```

So the browser side already knows how to gather many signals.
What it still needs is the runtime model scorer.

## 5. Where model loading should happen

The cleanest place to load and cache the runtime bundle is usually:

- the background service worker

Why?

- easy caching
- easy storage in `chrome.storage.local`
- easy forwarding through the existing message bridge

The repo already has:

- `background.js`
- `content_bridge.js`
- `window.postMessage(...)`

so the model can travel through the same architecture.

## 6. How the MAIN world should use it

Once the runtime JSON reaches `injected_wrapper.js`, the MAIN-world code can:

1. keep the runtime bundle in closure scope
2. compute feature values for each candidate
3. default missing feature keys
4. vectorize those values
5. compute the probability
6. write the result into `ugcRegionMap`

If no runtime model is available, the extension can fall back to
`HeuristicClassifier`.

## 7. Why exact feature names and defaults matter

For browser scoring to match server scoring, the extension must respect the
runtime contract.

That means:

- numeric missing values -> `0`
- boolean missing values -> `0`
- categorical missing values -> `__missing__`

And feature names must exactly match what the trained `feature_catalog`
expects.

## 8. Threshold mapping

Once `runtime.json` is loaded, the extension should use runtime thresholds
rather than treating hardcoded thresholds as the final source of truth.

A natural mapping is:

- `UGC_LOW_THRESHOLD <- runtime.thresholds.manual_review_low`
- `UGC_HIGH_THRESHOLD <- runtime.thresholds.manual_review_high`

## 9. What success looks like

The integration is working well when:

1. the extension loads a known `artifact_id`
2. runtime `weights` and `bias` are used for candidate scoring
3. `ugcRegionMap` contains those model probabilities
4. extension-side ranking roughly matches server-side scoring on the same page
5. fallback still works when the model is missing

## 10. What to remember

The end goal is simple:

- train on reviewed candidates
- export `runtime.json`
- load that runtime model into `detector_extension`
- score candidates
- populate `ugcRegionMap`
- let the rest of the extension focus on the most likely UGC regions
