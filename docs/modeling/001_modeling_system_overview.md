# Modeling System Overview

## Purpose

The modeling system is the first supervised layer on top of the existing rule-based detector.

The current detector already:

- finds list-level comment candidates
- extracts structured features for each candidate
- stores candidate screenshots
- stores human review labels

The modeling layer does not replace that system immediately.

Instead, it adds a trainable reranker on top of the candidate rows the detector already produces.

## What the first model predicts

The first model target is still list-level.

That means each training row answers this question:

- is this candidate the correct `comment list` region for the page?

It does not try to predict:

- the exact comment block
- the exact text-bearing element
- the exact text leaf

Those are later steps.

## Why the first target stays list-level

This repo is already organized around list-level candidate review:

- candidate screenshots are list/container crops
- candidate review labels are list-level labels
- repeated child evidence is already extracted under the list

That makes the first training target stable and practical.

## Two model variants

The first implementation deliberately creates two parallel variants:

1. `keyword-aware`
2. `keyword-ablated`

Both use the same training rows, the same algorithm family, and the same evaluation flow.

The intended difference is only the lexical keyword feature family.

This is important because it lets the project answer a real question:

- are keywords genuinely helping
- or are they acting as shortcuts that create overfitting

## Current algorithm choice

The first implemented algorithm is logistic regression.

This was chosen for practical reasons:

- it can be implemented cleanly in the current Node codebase without adding a large ML dependency
- it is fast enough for the current dataset size
- its learned coefficients are inspectable
- it gives a good baseline before introducing a more complex tree model later

This is not a claim that logistic regression is the final best model.

It is the correct first model because it gives visibility into feature reliance while staying easy to maintain.

## Directory layout

The modeling code is split on purpose.

### Shared modeling infrastructure

- `src/modeling/common/featureCatalog.js`
- `src/modeling/common/dataset.js`
- `src/modeling/common/vectorizer.js`
- `src/modeling/common/logisticRegression.js`
- `src/modeling/common/metrics.js`
- `src/modeling/common/artifacts.js`
- `src/modeling/common/service.js`
- `src/modeling/common/routes.js`

### Variant definitions

- `src/modeling/variants/keywordAware/index.js`
- `src/modeling/variants/keywordAblated/index.js`

### Website entry points

- `web/modeling.html`
- `web/modeling.js`
- `web/feature-docs.html`
- `web/feature-docs.js`

### Output artifacts

- `output/models/`

This directory split matters because:

- shared code should not be duplicated across model variants
- variant-specific behavior should stay small and explicit
- the website should read from the same source of truth as the training code

## Source of truth for features

The curated feature catalog in `src/modeling/common/featureCatalog.js` is the source of truth for:

- which raw extracted features are used in training
- which features are excluded for the keyword-ablated model
- how the website documentation page describes each feature

This avoids the common problem where:

- training uses one feature list
- docs describe another feature list
- the UI shows a third list

## Data source

The modeling layer trains from the existing job items already stored by the scanner.

For each job item:

- the scanner stores `candidates`
- the reviewer stores `candidate_reviews`
- the modeling dataset builder merges those into candidate rows

The positive and negative training labels come from:

- `comment_region` -> positive
- `not_comment_region` -> negative

The `uncertain` label is kept in exports but excluded from the first training pass.

## Training flow

The training flow is:

1. load job items that contain candidates
2. merge candidate rows with human review labels
3. build candidate-level dataset rows
4. keep only binary labeled rows for training
5. split by domain
6. fit the vectorizer on the training split
7. train logistic regression
8. evaluate on held-out domains
9. save the model artifact under `output/models`

If the label set is still too small for a usable domain split, the implementation falls back to a deterministic candidate-level split so early experiments can still run. Domain holdout remains the preferred mode once label coverage improves.

## Vectorization

The first model uses tabular features.

The vectorizer handles three feature types:

- numeric features
- boolean features
- categorical features

### Numeric

Numeric features are standardized on the training split.

Examples:

- `repeating_group_count`
- `text_word_count`
- `reply_button_unit_coverage`

### Boolean

Boolean features stay as `0` or `1`.

Examples:

- `schema_org_comment_itemtype`
- `table_row_structure`
- `has_nearby_textarea`

### Categorical

Categorical features become one-hot columns.

Examples:

- `tag_name`
- `role_attribute`
- `analysis_source`
- `blocker_type`

## Evaluation

The training system computes:

- candidate-level metrics
- ranking metrics
- page-level metrics

The current implementation keeps these practical:

- precision
- recall
- F1
- ROC-AUC when possible
- PR-AUC when possible
- top-1 accuracy
- mean reciprocal rank
- recall@3
- page hit rate
- false positive page rate
- manual review rate
- overconfident false positive page rate

## Model artifact contents

Each saved model artifact includes:

- model ID
- variant ID and title
- creation timestamp
- feature catalog snapshot
- fitted vectorizer
- logistic model weights and bias
- train/test counts
- evaluation summary
- feature reliance summaries

This matters because a model artifact must be self-contained enough to:

- score future jobs
- explain its own feature space
- preserve the exact training-time schema

Important distinction:

- the full saved artifact is a training and research record
- it is not the best thing to embed directly into another browser extension

The full artifact currently keeps extra material such as:

- split metadata
- train/test counts
- evaluation summaries
- feature reliance summaries

For browser-side inference, the system now also exposes a distilled
runtime bundle:

- `GET /api/modeling/models/:artifactId/runtime.json`

That smaller runtime JSON keeps only the parts needed for browser
inference and model provenance:

- artifact metadata
- thresholds
- feature catalog snapshot
- vectorizer descriptors and normalization maps
- logistic regression weights and bias
- compact evaluation and reliance summaries

## Website usage

The website now exposes two dedicated pages:

### Model Lab

Use it to:

- inspect current labeled-data coverage
- train either variant
- list saved model artifacts
- score an existing completed job
- upload site groups for hostname-based probing

### Feature Docs

Use it to:

- review the list/block/element terminology
- compare the two model variants
- read the meaning of each curated feature

## Important constraint

The first model can only be as good as the reviewed candidate data already available.

If there are too few positive and negative labeled candidates, training will refuse to proceed.

That is intentional.

The system should not silently pretend a model is meaningful when the label base is not yet real.

## Practical outcome

The first modeling implementation gives the repo an end-to-end supervised loop:

- review candidate regions
- train two variants
- compare their feature reliance
- score existing jobs
- probe site families

That is the correct first step before trying more complex algorithms.
