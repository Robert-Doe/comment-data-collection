# Browser Runtime Model Artifact And Extension Handoff

Date:

- `2026-03-30`

## Purpose

This note clarifies what the UGC model training phase actually
produces, which part of that output is appropriate for browser-side
deployment, and how that output should connect to the future
XSS-protection extension.

This matters because there are really two different artifacts:

1. a full training artifact
2. a browser-runtime inference bundle

They are not the same thing.

## The key distinction

The current training pipeline naturally produces a rich saved artifact
that is useful for:

- research records
- debugging
- reproducibility
- offline evaluation
- server-side scoring

But that full artifact is too broad to be the ideal thing embedded in
another browser extension.

Why:

- it contains training metadata
- it contains split metadata
- it contains evaluation summaries
- it may contain information that is unnecessary for inference
- it is larger than necessary for deployment

So the correct deployment boundary is:

- training system writes the full artifact
- deployment/export step derives a smaller runtime JSON bundle
- the browser extension consumes the runtime JSON bundle

## What the current model family makes possible

The current model family is logistic regression over a hand-engineered
feature vector.

That choice is especially useful for browser deployment because the
runtime representation is simple:

- descriptor list
- numeric normalization statistics
- categorical maps
- weight vector
- bias
- thresholds

Inference is then just:

1. compute the candidate feature values
2. vectorize them with the saved schema
3. compute `sigmoid(bias + dot(weights, vector))`
4. compare the probability against thresholds

This is exactly the kind of artifact that can be embedded into a
browser extension as plain JSON.

## Full training artifact versus runtime bundle

### Full training artifact

The full training artifact should keep:

- artifact ID
- variant metadata
- creation timestamp
- feature catalog snapshot
- fitted vectorizer
- model weights and bias
- training split metadata
- train/test counts
- evaluation summaries
- reliance summaries

This artifact is for:

- research reproducibility
- internal scoring
- auditability
- paper evidence

### Runtime bundle

The runtime bundle should keep only what the extension needs for
inference and provenance:

- schema version
- artifact ID
- variant metadata
- creation timestamp
- algorithm name
- thresholds
- feature catalog snapshot
- vectorizer descriptors
- numeric normalization stats
- categorical maps
- model weights
- model bias
- compact evaluation summary
- compact reliance summary

This bundle is for:

- page-context inference
- fast model loading
- versioned deployment inside the extension

## Why the browser extension should not embed the full training artifact

The future XSS-protection extension has a different job from the
training system.

It needs:

- a stable and small inference contract
- predictable load cost
- no unnecessary training internals
- no avoidable leakage of training-time examples

So the extension should not be responsible for understanding the full
training record. It should consume a runtime-only contract.

In short:

- full artifact = lab notebook
- runtime bundle = deployable model

## Proposed runtime bundle schema

The runtime bundle can be expressed as plain JSON like this:

```json
{
  "schema_version": 1,
  "artifact_type": "ugc_candidate_runtime_model",
  "artifact_id": "keyword-aware-2026-03-30T10-58-20-803Z",
  "variant_id": "keyword-aware",
  "variant_title": "Keyword-Aware Logistic Model",
  "variant_description": "Uses the full curated feature catalog, including lexical keyword evidence.",
  "created_at": "2026-03-30T10:58:20.803Z",
  "algorithm": "logistic_regression",
  "feature_count": 73,
  "thresholds": {
    "positive": 0.5,
    "manual_review_low": 0.2,
    "manual_review_high": 0.8
  },
  "feature_catalog": [],
  "vectorizer": {
    "descriptors": [],
    "numericStats": {},
    "categoricalMaps": {},
    "dimension": 0
  },
  "model": {
    "algorithm": "logistic_regression",
    "weights": [],
    "bias": 0
  },
  "evaluation_summary": {},
  "reliance_summary": {}
}
```

The exact arrays and maps are omitted above for readability, but this
is the right shape.

## How the future extension would use it

The future extension pipeline should look like this:

1. intercept DOM construction early
2. build or update the PseudoDOM
3. propose candidate roots
4. extract feature values for each candidate
5. load the runtime JSON bundle
6. vectorize candidate features using the saved vectorizer schema
7. run logistic inference in the page context or extension context
8. assign probabilities to candidate roots
9. mark high-confidence regions in the `ugcRegionMap`
10. apply the mutation gate only inside or near those regions

This means the extension is not retraining.

It is only:

- loading the exported runtime model
- extracting the same features
- running lightweight inference

## What the extension must reproduce correctly

The training system and the browser extension must agree on:

- feature keys
- feature types
- numeric normalization
- categorical one-hot expansion
- threshold semantics

If any of those drift, the extension will score candidates
incorrectly even if the weight vector is correct.

So the true deployment contract is not just:

- `weights + bias`

It is:

- `feature schema + vectorizer + weights + thresholds`

## Page-level prediction versus candidate-level prediction

The model is candidate-level first.

That means the raw output is:

- probability per candidate subgraph

The page-level statement:

- "this page has comments"

is derived from the candidate set, for example:

- if at least one candidate exceeds the positive threshold
- or if the top candidate exceeds a calibrated acceptance threshold

So the browser extension should not think of the model as:

- one global page classifier

It should think of it as:

- a candidate scorer used to localize the risky UGC region

That matches the security story much better.

## Relation to the XSS-protection extension

For the other extension, the runtime bundle is the correct insertion
artifact because it directly supports the security pipeline:

- find likely UGC container
- concentrate security scrutiny there
- avoid inspecting every mutation on the page

This is the main architectural payoff of the learned model.

The model is not the final blocker by itself.

It is the localization layer that decides where the blocker should
care most.

## Research significance

This separation strengthens the paper story in several ways.

First, it makes the deployment claim concrete:

- the learned model is actually portable into the browser

Second, it makes the evaluation cleaner:

- server-side training artifact can stay rich and auditable
- browser-side runtime bundle can be measured for size and speed

Third, it supports a defensible systems claim:

- the same learned detector can move from offline labeling workflows
  into a live browser-defense pipeline without changing model family

## Evaluation implications

The paper should evaluate not only classifier quality, but also:

- runtime bundle size
- bundle load time in the browser
- browser-side inference latency per candidate
- parity between server-side and browser-side scores

This parity check is important.

If the extension and the training server disagree on the same
candidate features, the deployment story becomes weak.

## Current implementation direction

The current app stack now has the right direction:

- training writes the full artifact
- a runtime JSON export can be derived from it

That is the correct contract for the future XSS-protection extension.

## Recommended wording for the paper

Useful phrasing:

- "The training pipeline emits a full research artifact and a distilled browser-runtime model bundle."
- "The browser-runtime bundle contains the vectorizer schema, thresholds, and logistic parameters required for client-side inference."
- "This separation keeps the research record rich while making the deployment artifact compact and serializable."

## Bottom-line answer

If the question is:

- "What do we get from training to plug into the other extension?"

The answer is:

- a browser-runtime JSON model bundle, not the full raw training artifact

That runtime bundle should contain:

- feature schema
- vectorizer metadata
- thresholds
- logistic weights
- bias

That is the correct handoff object for the future extension.
