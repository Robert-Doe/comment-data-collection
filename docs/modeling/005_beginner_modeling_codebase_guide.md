# Beginner Modeling Codebase Guide

## Why this note exists

The modeling work adds new directories, new pages, and new saved artifacts.

If you are new to the repo, it helps to know which part does what before changing anything.

## High-level mental model

Think of the modeling system as four connected layers:

1. data collection
2. label storage
3. model training and scoring
4. website visibility

## 1. Data collection

This is still the scanning side of the repo.

Main places:

- `src/shared/scanner.js`
- `src/commentFeatures.js`
- `src/worker/worker.js`
- `src/api/server.js`

What happens here:

- Playwright loads a page
- the detector finds candidate list regions
- features are extracted
- candidates and screenshots are stored

## 2. Label storage

This is where human review becomes structured training data.

Main places:

- `src/shared/candidateReviews.js`
- `src/shared/store.js`
- `web/index.html`
- `web/app.js`

What happens here:

- the UI reviewer marks a candidate as positive, negative, or uncertain
- the candidate review is stored on the job item
- the modeling layer later reads those stored labels back out

## 3. Model training and scoring

This is the new layer.

### Shared infrastructure

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

### What each shared file does

#### `featureCatalog.js`

Defines the curated feature list used by the first models and the website docs page.

#### `dataset.js`

Turns stored job items plus candidate reviews into trainable candidate rows.

#### `vectorizer.js`

Converts candidate rows into numeric arrays the logistic model can learn from.

#### `logisticRegression.js`

Contains the actual logistic regression training and prediction code.

#### `metrics.js`

Computes precision, recall, F1, ranking metrics, page metrics, and operational metrics.

#### `artifacts.js`

Saves trained models to disk and loads them back again later.

#### `service.js`

Acts as the orchestration layer.

It ties together:

- dataset building
- vectorization
- training
- evaluation
- scoring
- site-group probing

#### `routes.js`

Exposes all of the above through HTTP endpoints used by the website.

## 4. Website visibility

This is how the user interacts with the models.

Main places:

- `web/modeling.html`
- `web/modeling.js`
- `web/feature-docs.html`
- `web/feature-docs.js`

### `modeling.html`

The operating page for:

- training
- listing models
- scoring jobs
- probing site groups

### `feature-docs.html`

The consulting page for:

- model terminology
- variant differences
- feature explanations

## Why the code is split this way

There are three main reasons.

### Reason 1: reuse

The same modeling code must work with:

- the real API plus Postgres
- the local single-process runtime

So the core logic cannot live only inside one server file.

### Reason 2: clarity

Variant-specific decisions should stay small.

That is why:

- shared logic lives in `common`
- variant differences live in `variants`

### Reason 3: documentation alignment

The feature catalog is used by:

- training
- scoring
- website documentation

That keeps the feature meanings and the real model inputs aligned.

## Where model files are saved

Trained model artifacts are written to:

- `output/models/`

That means:

- the code lives in `src/modeling/`
- the outputs live in `output/models/`

This is a normal separation:

- source code in `src`
- generated runtime artifacts in `output`

## How branches relate to modeling work

A branch is just a named version of the code.

For modeling work, this matters because:

- the model code should be committed like any other source code
- the trained model artifacts are runtime outputs and usually should not be committed unless explicitly desired

That means the usual workflow is:

1. change code on a branch
2. commit the code
3. train models locally or on the server
4. let artifacts live under `output/models`

## Why trained artifacts are not the same as source code

The source code tells the repo:

- how to build a model
- how to load a model
- how to score candidates

The artifact tells the runtime:

- the exact learned weights from one training run

Those are different things.

That is why they are stored separately.

## What to edit when changing model behavior

If you want to change:

### which features are in the model

Edit:

- `src/modeling/common/featureCatalog.js`

### how candidate rows are assembled

Edit:

- `src/modeling/common/dataset.js`

### how the feature matrix is built

Edit:

- `src/modeling/common/vectorizer.js`

### how the learning algorithm works

Edit:

- `src/modeling/common/logisticRegression.js`

### how the website exposes training or scoring

Edit:

- `web/modeling.html`
- `web/modeling.js`

### how feature descriptions read to humans

Edit:

- `src/modeling/common/featureCatalog.js`
- `web/feature-docs.html`
- `web/feature-docs.js`
- the markdown docs in `docs/modeling/`

## Safe beginner rule

If you are unsure where a behavior comes from, trace it in this order:

1. website page
2. API route
3. service layer
4. dataset and vectorizer
5. feature catalog

That usually gets you to the right file quickly.

## Working conclusion

The new modeling system is not a separate product outside the repo.

It is a structured extension of the existing review pipeline:

- scan
- label
- train
- score
- inspect
- refine

That is the right way to read the new directories.
