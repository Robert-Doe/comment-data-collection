# Runtime Contract And Detector Extension Handoff

This is the integration note. It describes the contract the browser runtime must honor and where the model fits into `detector_extension`.

## Runtime Bundle Shape

The server-side runtime bundle is the only object the browser should consume for inference. It includes:

- `artifact_id`
- `variant_id`
- `variant_title`
- `variant_description`
- `thresholds`
- `feature_catalog`
- `vectorizer`
- `model`
- `evaluation_summary`
- `reliance_summary`

The pieces required for scoring are:

- `feature_catalog`
- `vectorizer.descriptors`
- `vectorizer.numericStats`
- `vectorizer.categoricalMaps`
- `vectorizer.dimension`
- `model.weights`
- `model.bias`
- `thresholds`

## Vectorizer Contract

The browser must use the same normalization rules as training:

- numeric features are standardized with `(value - mean) / std`
- boolean features map to `1` or `0`
- categorical features are one-hot encoded
- missing categorical values normalize to `__missing__`

The runtime bundle for this artifact has:

- `feature_count: 73`
- `vectorizer.dimension: 105`

The extra width comes from one-hot categorical expansion. Do not assume feature count and vector width are the same thing.

## Scoring Contract

The runtime score is:

```text
sigmoid(bias + dot(weights, vector))
```

The detector extension should preserve the existing candidate-ranking flow and only replace the scoring implementation.

Recommended flow:

1. Generate candidate roots.
2. Extract feature values for each candidate.
3. Fill missing features with neutral defaults.
4. Vectorize with the runtime descriptors and stats.
5. Compute the logistic score.
6. Store the score in `ugcRegionMap`.
7. Use the thresholds to decide how strong the response should be.

## What To Add Or Replace In `detector_extension`

Add these pieces:

- a runtime-model loader
  - import `runtime.json` from disk, popup upload, or API fetch
  - persist it in background state and optional `chrome.storage.local`
- a runtime broadcast path
  - push the loaded bundle into the page world through `content_bridge.js`
- a runtime vectorizer helper
  - apply the shipped descriptors, numeric stats, and categorical maps
- a runtime probability helper
  - compute `sigmoid(bias + dot(weights, vector))`
- a runtime-driven threshold policy
  - use `thresholds.manual_review_low` and `thresholds.manual_review_high` for testing bands

Replace these pieces:

- the heuristic candidate scorer in `injected_wrapper.js`
  - keep it only as fallback when no runtime bundle is loaded
- hard-coded gating thresholds
  - read the runtime thresholds instead
- any candidate score path that depends on heuristic keyword sums alone
  - score from the trained model first, then use the heuristic only as backup

Also update the feature extractor so the runtime contract is complete:

- emit every feature in `runtime.feature_catalog`
- default missing numeric values to `0`
- default missing booleans to `false`
- default missing categorical values to `__missing__`

For testing support, surface:

- artifact id
- variant id
- top candidate probability
- manual review suggestion
- top positive and negative feature contributions

That gives you decision support instead of only a raw score.

## Live Probe Parity

Yes, the live probe uses the trained model.

The live probe path loads the saved artifact, extracts the candidate features collected during scanning, vectorizes them with the fitted vectorizer, and then scores them with the trained model. In the local code, that is the `scoreLiveUrlProbe()` flow feeding into `scoreRows()`, which then calls:

- `transformRow()`
- `predictProbabilityForArtifact()`
- `predictProbability()` for logistic regression

So the live probe is not just "testing features." It is testing the features through the trained artifact.

The browser extension should mirror that same pattern locally with `runtime.json`:

1. collect features
2. vectorize them with the runtime bundle
3. run the trained model
4. use the result to decide whether the candidate is high confidence, review-band, or low confidence

## Where It Fits In The Extension

The current extension already has the right architecture for this:

- `content_bridge.js` injects the wrapper into the page world
- `injected_wrapper.js` performs candidate scoring and writes confidence values
- `background.js` and `popup.js` are the natural place to load and inspect a runtime bundle

For testing, the `detector_extension_experimental` clone is the better staging target because it already accepts `SET_RUNTIME_MODEL`, `GET_RUNTIME_MODEL`, and `CLEAR_RUNTIME_MODEL`, and it can import a runtime JSON file from the popup.

## Current Feature Alignment Gap

The curated runtime bundle expects 73 exact feature keys. The current extension extractor does not yet emit all of them.

Missing from the current extractor are:

| Category | Missing Keys |
| --- | --- |
| Repeated block counts | `child_sig_id_group_count`, `child_xpath_star_group_count`, `xpath_star_group_count`, `sig_id_count_weak`, `sig_id_count_medium`, `sig_id_count_strong` |
| Lexical detail | `keyword_text_high`, `keyword_text_med`, `keyword_direct_text_high`, `keyword_attr_name_high`, `keyword_attr_value_high`, `submit_button_keyword_high` |
| Context | `json_ld_has_comment_action`, `frame_count`, `analysis_source`, `blocker_type` |

That gap matters because the runtime vectorizer does not infer missing semantics. The extension must either compute these values or intentionally default them.

Suggested live defaults:

- `analysis_source`: `automated`
- `frame_count`: the observed frame count for the page
- `blocker_type`: the observed blocker state, or `none` if not blocked
- `json_ld_has_comment_action`: boolean from page signals

## Decision Policy

Use the runtime thresholds as a three-way policy:

- high confidence: act as if the region is very likely UGC
- middle band: keep it in review and log it for inspection
- low confidence: do not promote it

That is the safest way to make the detector extension useful for both gating and testing.

## Implementation Rule

If the runtime model is loaded, the extension should use it.

If it is not loaded, the extension can fall back to the heuristic classifier, but that fallback should be treated as a temporary testing path, not the target architecture.
