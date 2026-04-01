# Model Construction Blueprint

Date:

- `2026-03-29`

This is the current active brainstorm note.

## Purpose

The repo already has a strong heuristic detector, candidate ranking, manual review, and candidate-level labels.

The next question is not "should we use ML?" in the abstract.

The real question is:

- what exact model should be built first
- what should its training example be
- what labels do we trust
- how should it fit into the current heuristic pipeline without breaking the system

## Current starting point

Today the system already produces most of the ingredients needed for a first practical model:

- candidate regions from [src/commentFeatures.js](../../src/commentFeatures.js)
- candidate scores, matched signals, penalties, and UGC-type guesses
- candidate screenshots for review
- human labels from [src/shared/candidateReviews.js](../../src/shared/candidateReviews.js)
- exports that can become a training dataset
- manual snapshot uploads that preserve the DOM state when a live page is hard to scan

That means the first model does not need to invent the whole pipeline.

It only needs to improve a pipeline that already exists.

## Recommended problem framing

The first trainable model should be a candidate-level classifier.

Input:

- one candidate region at a time

Output:

- probability that this candidate is the true comment or UGC region

Why this is the right first target:

- the current system already thinks in terms of candidates
- human review labels are already candidate-local
- candidate-level learning is easier to debug than page-level black-box decisions
- page-level decisions can still be produced by aggregating candidate scores

The first model should not try to solve all tasks at once.

Do not start with:

- a single end-to-end page screenshot model
- a giant multimodal model
- a direct replacement for the full rule system

## What the first model should predict

Primary label:

- `comment_region`

Negative label:

- `not_comment_region`

Deferred label:

- `uncertain`

Recommended treatment:

- use `comment_region` as positive
- use `not_comment_region` as negative
- keep `uncertain` out of the first training pass or use it only for error analysis

## Training example definition

Each training row should correspond to one candidate region and should include:

- candidate key
- item id and job id
- normalized URL and final URL
- candidate rank under the current heuristic system
- all extracted structural and semantic features
- heuristic score and matched signals
- human label when present
- whether the page came from automated scan or manual snapshot
- screenshot URLs only as references, not mandatory numeric features

This gives a clean tabular training example that can be regenerated from exports.

## Feature groups to use first

The first model should use tabular features that already exist in the extractor.

### 1. Structural features

- repeated sibling count
- dominant grouping metadata
- depth and tag variety
- XPath or wildcard grouping features
- sibling homogeneity
- recursive nesting and reply-depth indicators

### 2. Semantic and markup features

- schema.org comment and review markers
- ARIA roles such as `comment` and `feed`
- keyword presence in attributes and text
- microdata and JSON-LD signals
- comment-count headers

### 3. Interaction features

- reply button coverage
- report or flag actions
- profile link density
- textarea proximity
- like or reaction controls
- collapse and expand controls

### 4. Penalty features

- add-to-cart patterns
- table-row structure
- navigation ancestry
- very high link density
- rating-only structures with no text

### 5. Context features

- source type: `automated` vs `manual_snapshot`
- blocker metadata
- candidate rank from heuristic pipeline
- page frame count

## Recommended first model family

Start with interpretable tabular models.

Recommended order:

1. logistic regression baseline
2. gradient-boosted trees
3. only later, optional screenshot-based model

Why:

- the current data is structured and feature-rich
- tree models handle mixed scales and nonlinear interactions well
- feature importance is easier to inspect
- debugging failures is much easier than with a vision-first approach

The likely best first serious model is gradient-boosted trees.

Practical candidates:

- XGBoost
- LightGBM
- CatBoost

## How the model should interact with heuristics

The first production ML step should be hybrid, not replacement.

Recommended shape:

1. heuristics generate candidate regions
2. heuristics still act as a cheap coarse filter
3. the model reranks or rescales the surviving candidates
4. page-level detection is derived from the best reranked candidate

This avoids rebuilding the DOM-candidate discovery stage from scratch.

## How page-level decisions should be produced

After candidate scoring, page-level logic can stay simple:

- top candidate probability
- margin over second-best candidate
- minimum confidence threshold
- optional "needs review" state when margin is weak

That is better than training a separate page classifier immediately.

## Dataset construction plan

The dataset should be built in layers.

### Layer 1: trusted human-labeled candidate rows

- use reviewed candidates only
- highest quality
- likely smallest dataset

### Layer 2: heuristic pseudo-labels

- only use if strongly separated
- positive only when the heuristic confidence is high and later human review agrees often
- negative only when the candidate is clearly irrelevant

### Layer 3: disagreement bucket

- examples where heuristics and human labels disagree
- use this for analysis and future active learning

## Data splitting rule

Split by site or domain, not by candidate row alone.

Otherwise the model will leak site-specific patterns and evaluation will look much better than real generalization.

Recommended split:

- train domains
- validation domains
- held-out test domains

If enough data exists later, also maintain a "new unseen sites" benchmark.

## Evaluation metrics

Candidate-level metrics:

- precision
- recall
- F1
- ROC-AUC or PR-AUC

Ranking metrics:

- top-1 accuracy
- mean reciprocal rank
- recall@k

Page-level derived metrics:

- did the page get at least one correct comment-region candidate
- false positive page rate
- manual-review rate

Operational metrics:

- how often the model reduces human review
- how often it creates overconfident false positives

## Active learning direction

The review UI already creates the basis for active learning.

The most useful future loop is:

1. run heuristics plus model
2. find weak-margin or disagreement cases
3. prioritize those for human review
4. fold the new labels back into the training set

This is much better than randomly labeling more easy pages.

## What not to do yet

Avoid these early mistakes:

- trying to train from screenshots before the tabular baseline exists
- mixing `uncertain` labels into the positive and negative set without policy
- evaluating on random row splits that leak site templates
- replacing the heuristic candidate generator before the reranker is proven
- assuming more model complexity automatically means better generalization

## Open design questions

1. Should the first model use only tabular features, or also a small screenshot embedding?
2. Should `manual_snapshot` examples be weighted differently from automated examples?
3. Should the model learn one generic `comment_region` class, or also predict `ugc_type` as a secondary task?
4. What minimum number of positive labels per domain is needed before a site-family split becomes stable?
5. Should page-level "manual review required" be a separate classifier or derived from candidate uncertainty?

## Recommended immediate implementation path

1. Add a training export that produces one row per candidate with human labels and all numeric or categorical features already emitted by the extractor.
2. Create a small offline training script outside the scan runtime.
3. Train a logistic regression baseline first just to establish a reference.
4. Train a gradient-boosted tree model next and compare ranking performance.
5. Add model predictions back into the review UI as a separate score, not a silent replacement for heuristic score.
6. Track disagreements between heuristic top-1 and model top-1.

## Concrete repo-facing deliverables

The next code-facing outputs should probably be:

- `scripts/export-training-dataset.*`
- `scripts/train-candidate-model.*`
- `models/` for versioned trained artifacts
- one doc that defines the feature schema expected by training
- one doc that defines evaluation protocol and split rules

## Working thesis

The most defensible first model for this repo is:

- a candidate-level tabular reranker trained on human-reviewed regions and existing extracted features

That is the lowest-risk path because it:

- matches the current app structure
- uses labels we already know how to collect
- can be evaluated honestly by domain split
- improves the system without throwing away the current heuristic investment

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
