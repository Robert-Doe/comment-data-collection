# Model Artifacts And Detector Extension Integration

Date: `2026-04-01`

## 1. Purpose

This note explains the end-to-end contract between:

- the training pipeline in `comment-data-collection`
- the saved model artifacts written by the Model Lab
- the browser-runtime JSON handoff bundle
- the separate `detector_extension` that will eventually consume the trained model

The goal is practical alignment, not just model theory.

After reading this note, the expected answer to "what file do we ship into
the detector extension, and how should it be used?" should be unambiguous.

## 2. Short Answer

Training currently produces two related JSON artifacts:

1. The full saved training artifact:
   - path: `output/models/<variant-id>/<artifact-id>.json`
   - extension: `.json`
   - purpose: research record, training metadata, evaluation, vectorizer, weights

2. The browser-runtime handoff bundle:
   - endpoint: `GET /api/modeling/models/:artifactId/runtime.json`
   - download filename: `<artifact-id>-runtime.json`
   - extension: `.json`
   - purpose: the deployable model bundle intended for browser-side inference

The `detector_extension` should consume the runtime JSON, not the full saved
artifact.

## 3. What The Detector Extension Is Actually Trying To Predict

The current model target is:

> among the candidate DOM subtrees proposed on the page, which candidate is
> most likely to be the root of the repeated user-authored content region?

This matters because the detector extension is not supposed to ask:

- "is this random leaf node a comment?"
- "is this exact text node a comment?"
- "is this arbitrary DOM element comment-like in isolation?"

Instead, the extension should:

1. generate candidate container roots
2. compute features for each candidate root
3. score each candidate with the trained model
4. rank candidates by probability
5. treat the highest-scoring candidates as likely UGC regions

That is the intended replacement for the current heuristic classifier in
`detector_extension/injected_wrapper.js`.

## 4. End-To-End Flow

The model generation and deployment flow is:

1. The scanner and manual-review flow collect candidate regions and human labels.
2. The Model Lab builds a candidate-level dataset from reviewed candidates.
3. A chosen variant is trained as logistic regression.
4. The server writes the full artifact to `output/models/.../*.json`.
5. The API can distill that artifact into a smaller `runtime.json` bundle.
6. The detector extension loads that runtime bundle.
7. The detector extension extracts the same feature keys for each candidate root.
8. The detector extension applies the runtime vectorizer and logistic-regression weights.
9. The detector extension writes the resulting probabilities into its UGC region map.
10. The mutation gate uses those probabilities to decide which regions receive scrutiny.

## 5. Model Variants

Two variants are currently trainable:

- `keyword-aware`
  - uses the full feature catalog, including lexical keyword features
- `keyword-ablated`
  - excludes lexical keyword features to measure how far structure and interaction signals carry detection

For deployment, the practical default should usually be the best held-out
performer, which will often be `keyword-aware` unless evaluation shows that it
overfits lexical shortcuts.

The runtime JSON includes `variant_id`, `variant_title`, and
`variant_description` so the consuming extension can know which family of model
it loaded.

## 6. Training Pipeline And Artifact Generation

### 6.1 Data source

Training uses reviewed candidate rows already stored on job items.

Positive label:

- `comment_region`

Negative label:

- `not_comment_region`

Excluded from the primary fit:

- `uncertain`

### 6.2 Dataset build

The dataset builder:

1. loads items with candidates
2. applies candidate reviews
3. builds normalized feature rows from the curated feature catalog
4. attaches metadata such as hostname, item id, row number, analysis source, and blocker type

The training target is binary at the candidate level:

- `1` for the true comment-region candidate
- `0` for a non-comment candidate

### 6.3 Feature catalog

The authoritative training feature schema lives in:

- `src/modeling/common/featureCatalog.js`

This file defines:

- the allowed feature keys
- type for each feature: `number`, `boolean`, or `categorical`
- family membership
- whether the feature is part of the lexical-keyword family

The runtime vectorizer and the browser extension must follow this schema.

### 6.4 Vectorizer fit

The vectorizer logic lives in:

- `src/modeling/common/vectorizer.js`

It performs:

- numeric standardization: `(raw - mean) / std`
- boolean mapping: `true -> 1`, falsy -> `0`
- categorical one-hot encoding using category lists observed during training

Important normalization rule:

- missing categorical values normalize to `__missing__`

This exact rule must also be used in the detector extension.

### 6.5 Model fit

The logistic-regression trainer lives in:

- `src/modeling/common/logisticRegression.js`

Current training behavior:

- binary logistic regression
- class weighting based on positive/negative imbalance
- learned `weights` vector and scalar `bias`
- probabilities produced by `sigmoid(bias + dot(weights, vector))`

### 6.6 Split and evaluation

The training service first tries a domain-holdout split.

If that split does not leave both classes represented in training, it falls
back to a deterministic candidate-level split.

Evaluation summaries include:

- candidate metrics
- ranking metrics
- page-level metrics derived from candidate scores

### 6.7 Save full artifact

The full artifact is written by `saveModelArtifact()` to:

- `output/models/<variant-id>/<artifact-id>.json`

This is the complete saved record of the training run.

### 6.8 Build runtime bundle

The API route:

- `GET /api/modeling/models/:artifactId/runtime.json`

distills the full artifact into the browser-runtime bundle using
`buildRuntimeModelBundle()`.

That runtime bundle is what should be copied into, or loaded by, the
`detector_extension`.

## 7. Full Saved Artifact Versus Runtime JSON

### 7.1 Full saved artifact

The full saved artifact is the research and training record.

It includes:

- model identity
- feature catalog
- vectorizer
- logistic-regression weights and bias
- train/test split metadata, summarized only
- training counts
- dataset summary
- evaluation
- feature-reliance summaries
- file path

This is useful for:

- inspection
- auditing
- reproducibility
- comparison across training runs

It is not the preferred direct browser payload.
The raw train/test row arrays stay in memory during training and are intentionally omitted from the saved artifact.

### 7.2 Runtime JSON

The runtime JSON is the stripped deployment bundle for browser-side inference.

It keeps:

- artifact metadata
- thresholds
- feature catalog snapshot
- vectorizer descriptors
- numeric normalization stats
- categorical maps
- logistic-regression weights
- bias
- compact evaluation summary
- compact reliance summary

It intentionally drops broader training-only context that the extension does
not need.

## 8. Runtime JSON Contract

The current runtime JSON has this shape:

```json
{
  "schema_version": 1,
  "artifact_type": "ugc_candidate_runtime_model",
  "artifact_id": "keyword-aware-2026-04-01T00-00-00-000Z",
  "variant_id": "keyword-aware",
  "variant_title": "Keyword-Aware Logistic Model",
  "variant_description": "...",
  "created_at": "2026-04-01T00:00:00.000Z",
  "algorithm": "logistic_regression",
  "feature_count": 123,
  "thresholds": {
    "positive": 0.5,
    "manual_review_low": 0.2,
    "manual_review_high": 0.8
  },
  "feature_catalog": [...],
  "vectorizer": {
    "descriptors": [...],
    "numericStats": {...},
    "categoricalMaps": {...},
    "dimension": 123
  },
  "model": {
    "algorithm": "logistic_regression",
    "weights": [...],
    "bias": -0.123
  },
  "evaluation_summary": {...},
  "reliance_summary": {...}
}
```

### 8.1 Fields the detector extension must actually use

Required at inference time:

- `thresholds`
- `feature_catalog`
- `vectorizer.descriptors`
- `vectorizer.numericStats`
- `vectorizer.categoricalMaps`
- `vectorizer.dimension`
- `model.weights`
- `model.bias`

Useful but not required for inference:

- `artifact_id`
- `variant_id`
- `created_at`
- `evaluation_summary`
- `reliance_summary`

### 8.2 Threshold meaning

The runtime bundle exposes three thresholds:

- `thresholds.positive`
  - page or candidate acceptance threshold used by scoring/reporting paths
- `thresholds.manual_review_low`
  - lower bound of the uncertain band
- `thresholds.manual_review_high`
  - upper bound of the uncertain band

For detector-extension gating, the cleanest mapping is:

- `UGC_LOW_THRESHOLD <- thresholds.manual_review_low`
- `UGC_HIGH_THRESHOLD <- thresholds.manual_review_high`

If the extension wants different gate thresholds than the default runtime
export, download the runtime JSON with explicit query overrides, for example:

```text
/api/modeling/models/<artifactId>/runtime.json?manualReviewLow=0.35&manualReviewHigh=0.65&positiveThreshold=0.5
```

That keeps the shipped runtime JSON aligned with the detector extension's
actual gating policy.

## 9. How The Detector Extension Should Integrate The Model

### 9.1 Current state of the extension

The current `detector_extension` already has the intended insertion point for
the model:

- `detector_extension/injected_wrapper.js` contains `HeuristicClassifier`
- comments there state that this is the pre-ML placeholder
- the output score already uses the same `[0, 1]` scale the trained model will use
- `ugcRegionMap` already stores candidate confidence scores

This means the trained model should replace the heuristic scorer inline rather
than forcing a redesign of the surrounding architecture.

### 9.2 Recommended integration path

Recommended deployment pattern:

1. Load the runtime JSON in the background/service-worker context.
2. Cache it in memory and optionally in `chrome.storage.local`.
3. Push the runtime model into the MAIN world through the existing
   `content_bridge.js -> window.postMessage` mechanism.
4. In `injected_wrapper.js`, store the runtime bundle in closure scope.
5. If a runtime model exists, score candidates with the model.
6. If no runtime model exists, fall back to `HeuristicClassifier`.

This preserves:

- early injection timing
- MAIN-world prototype wrapping
- current background/message architecture
- graceful fallback during development

### 9.3 Runtime inference steps in the extension

For each candidate root:

1. Identify the candidate DOM node and candidate metadata.
2. Extract feature values using the extension's feature extractor.
3. Reduce the feature object to the keys expected by `runtime.feature_catalog`.
4. Fill any missing keys with neutral defaults.
5. Transform the feature object into a numeric vector using the runtime vectorizer.
6. Compute `logit = bias + dot(weights, vector)`.
7. Compute `probability = sigmoid(logit)`.
8. Write that probability into `ugcRegionMap`.
9. Rank candidates by probability.

### 9.4 Reference inference pseudocode

```js
function normalizeCategoryValue(value) {
  const text = String(value || '').trim();
  return text || '__missing__';
}

function vectorizeFeatureValues(featureValues, runtime) {
  const vector = new Array(runtime.vectorizer.dimension).fill(0);

  for (const descriptor of runtime.vectorizer.descriptors) {
    const raw = featureValues[descriptor.feature_key];

    if (descriptor.type === 'number') {
      const stats = runtime.vectorizer.numericStats[descriptor.feature_key] || { mean: 0, std: 1 };
      const value = Number(raw) || 0;
      vector[descriptor.index] = (value - stats.mean) / (stats.std || 1);
      continue;
    }

    if (descriptor.type === 'boolean') {
      vector[descriptor.index] = raw ? 1 : 0;
      continue;
    }

    if (descriptor.type === 'categorical') {
      const normalized = normalizeCategoryValue(raw);
      vector[descriptor.index] = normalized === descriptor.category ? 1 : 0;
    }
  }

  return vector;
}

function predictProbability(runtime, featureValues) {
  const vector = vectorizeFeatureValues(featureValues, runtime);
  let logit = Number(runtime.model.bias) || 0;

  for (let i = 0; i < vector.length; i += 1) {
    logit += (vector[i] || 0) * ((runtime.model.weights || [])[i] || 0);
  }

  return 1 / (1 + Math.exp(-logit));
}
```

### 9.5 Page-level decision in the extension

The current v1 model is still candidate-centric.

The extension should derive page-level behavior from candidate scores rather
than expecting a separate page classifier inside the runtime bundle.

Recommended page-level derivation:

- sort all candidate probabilities descending
- top candidate score = page's strongest UGC confidence
- if top candidate score >= `thresholds.manual_review_high`, treat the region as high-confidence UGC
- if top candidate score is between low and high thresholds, treat the page as uncertain and apply lighter scrutiny
- if top candidate score < `thresholds.manual_review_low`, treat the page as low-confidence or no-UGC

## 10. Compatibility Contract Between Training And Detector Extension

Proper prediction depends on five alignment rules.

### 10.1 Candidate-generation contract

The model only works as intended if the extension proposes the same kind of
candidates the training data represented.

That means candidate roots should continue to be:

- repeated sibling-family containers
- semantic-anchor ancestors
- composer-adjacent list containers
- related repeated DOM subgraphs

If the detector extension changes candidate generation substantially, the model
may become miscalibrated even if the feature extractor is perfect.

### 10.2 Feature-key contract

Feature names are part of the model contract.

The detector extension must emit values keyed by the same feature names used in:

- `runtime.feature_catalog`

The runtime vectorizer does not guess.

If a key name differs, that signal is effectively lost.

### 10.3 Type contract

Each feature must preserve its training-time type:

- `number`
- `boolean`
- `categorical`

Examples:

- numeric features must remain numeric and use `0` as the missing default
- boolean features must map to `1` or `0`
- categorical features must use the exact trained category names or `__missing__`

### 10.4 Missing-value contract

When the detector extension cannot compute a feature:

- numeric default: `0`
- boolean default: `0`
- categorical default: `__missing__`

This is important because the vectorizer was trained with those assumptions.

### 10.5 Threshold contract

The detector extension should not hardcode unrelated thresholds once runtime
JSON is available.

Instead, it should read threshold values from the shipped runtime bundle so:

- the exported model
- the detector-extension gate
- the evaluation assumptions

all stay synchronized.

## 11. Current Compatibility Status In This Repo

### 11.1 What already aligns

These pieces already line up well:

- the detector extension uses a candidate-ranking architecture
- the current heuristic score uses the same probability-like `[0, 1]` scale
- `ugcRegionMap` already stores model-compatible confidence scores
- the extension already has a feature extractor intended for the ML slot
- the training system already exports a browser-runtime JSON bundle

### 11.2 What is not implemented yet

The detector extension does not yet:

- load `runtime.json`
- vectorize candidate features from the runtime bundle
- compute logistic-regression probabilities from runtime weights
- switch the gate thresholds over to runtime-driven values

### 11.3 Current feature-alignment gap

The extension currently emits many feature keys, but it does not yet emit every
feature expected by the training catalog.

At the time of writing, the trained runtime contract expects these feature keys
that are not currently produced by `detector_extension/feature_extractor.js`:

- context defaults
  - `analysis_source`
  - `blocker_type`
  - `frame_count`
- repeated-structure features
  - `child_sig_id_group_count`
  - `child_xpath_star_group_count`
  - `xpath_star_group_count`
  - `sig_id_count_weak`
  - `sig_id_count_medium`
  - `sig_id_count_strong`
- lexical-keyword features
  - `keyword_attr_name_high`
  - `keyword_attr_value_high`
  - `keyword_direct_text_high`
  - `keyword_text_high`
  - `keyword_text_med`
  - `submit_button_keyword_high`
- semantic context feature
  - `json_ld_has_comment_action`

This means that browser inference will not exactly match server-side scoring
until those keys are either:

- implemented in the detector extension, or
- explicitly defaulted in a deliberate and documented way

### 11.4 Extra extension features are not harmful

The extension already computes many features that are not part of the current
training catalog.

Those extra features are not a problem by themselves.

They will simply be ignored by the runtime vectorizer unless:

- they are added to the training feature catalog
- the model is retrained
- a new runtime JSON is exported

## 12. Recommended Integration Strategy

If the goal is a reliable first deployment, the safest order is:

1. Keep the current candidate generator.
2. Keep the current feature extractor.
3. Add the missing runtime feature keys listed above.
4. Load runtime JSON in the background/service worker.
5. Push runtime JSON into the MAIN world at startup.
6. Replace `HeuristicClassifier.scoreCandidate()` with runtime-based scoring.
7. Map `UGC_LOW_THRESHOLD` and `UGC_HIGH_THRESHOLD` from runtime thresholds.
8. Fall back to the heuristic only when no runtime model is loaded.

This minimizes architectural churn while replacing only the ranking engine.

## 13. Practical Deployment Options

There are two viable ways to hand the model to the detector extension.

### 13.1 Ship the runtime JSON inside the extension package

Pros:

- deterministic release artifact
- no network dependency at page-load time
- easier version pinning

Cons:

- requires rebuilding or repackaging the extension for each model update

Best fit:

- stable release builds

### 13.2 Fetch the runtime JSON from the API

Pros:

- model can be updated without repackaging the extension
- easier experiment iteration

Cons:

- extension now depends on network availability
- the fetched artifact id must be pinned or versioned carefully
- startup and caching logic become more complex

Best fit:

- research mode
- rapid iteration

## 14. Minimum Acceptance Checklist Before Depending On The Model

Before calling the integration complete, verify all of the following:

- the detector extension loads a real `runtime.json`
- the loaded `artifact_id` and `variant_id` are visible in debug output
- every feature key in `runtime.feature_catalog` is either computed or deliberately defaulted
- numeric normalization uses the runtime `mean` and `std`
- categorical encoding uses the runtime `categoricalMaps` and `__missing__`
- probability is computed with the runtime `weights` and `bias`
- runtime thresholds drive the gate thresholds
- candidate ranking results are stable across reloads
- extension-side scores are compared against server-side scores on the same pages

The last point is the most important validation step.

If the same candidate page is scored by both:

- the server-side model runtime
- the detector extension runtime

the top-candidate ranking and probabilities should be close enough to explain.

If they diverge materially, the usual cause will be one of:

- candidate-generation drift
- missing feature keys
- type mismatches
- default-value mismatches
- categorical normalization mismatch

## 15. Final Contract

The final intended contract is:

- `comment-data-collection` trains the UGC localization model
- the full model artifact is saved as JSON under `output/models`
- the browser handoff artifact is `runtime.json`
- the `detector_extension` loads that runtime JSON
- the `detector_extension` computes the same feature schema for each candidate DOM subtree
- the `detector_extension` scores those candidates with the runtime vectorizer and logistic-regression weights
- the resulting probabilities populate `ugcRegionMap`
- the mutation gate uses those region probabilities to decide where selective scrutiny should occur

That is the model handoff path this repo is building toward.
