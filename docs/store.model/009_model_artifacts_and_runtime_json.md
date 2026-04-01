# Model Artifacts And Runtime JSON

Date: `2026-04-01`

## 1. What training writes to disk

When the Model Lab trains a model, it saves a JSON artifact.

The full saved artifact path is:

- `output/models/<variant-id>/<artifact-id>.json`

So the trained model is stored as a `.json` file.

## 2. Why there are two JSON forms

There are two related outputs.

### Full saved artifact

This is the complete training record.

It includes:

- model identity
- feature catalog
- vectorizer
- `weights`
- `bias`
- split metadata
- evaluation
- reliance summaries

### Runtime JSON

This is the browser handoff bundle.

It is available from:

- `GET /api/modeling/models/:artifactId/runtime.json`

This is the JSON the `detector_extension` should consume.

## 3. The function that builds the runtime bundle

The runtime bundle is created by:

- `buildRuntimeModelBundle(artifact, options = {})`

That function keeps the browser-relevant parts of the full artifact and drops
more research-oriented baggage.

## 4. The most important runtime fields

The runtime JSON includes fields such as:

- `schema_version`
- `artifact_id`
- `variant_id`
- `thresholds`
- `feature_catalog`
- `vectorizer`
- `model`

The fields most important for prediction are:

- `vectorizer.descriptors`
- `vectorizer.numericStats`
- `vectorizer.categoricalMaps`
- `vectorizer.dimension`
- `model.weights`
- `model.bias`

## 5. Why thresholds travel with the model

The runtime bundle includes:

- `thresholds.positive`
- `thresholds.manual_review_low`
- `thresholds.manual_review_high`

These matter because the browser needs not only a score, but also guidance for
interpreting that score.

## 6. Variants

The repo currently supports:

- `keyword-aware`
- `keyword-ablated`

That is why the runtime bundle also includes:

- `variant_id`
- `variant_title`
- `variant_description`

## 7. Why the vectorizer must ship too

The model is not just `weights`.

The browser also needs:

- the feature schema
- numeric normalization
- categorical maps
- vector-slot definitions

That is why `runtime.json` includes the vectorizer.

## 8. What to remember

If someone asks:

> what artifact should go into the detector extension?

the answer is:

- the browser `runtime.json`

not the raw full training artifact.
