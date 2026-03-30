# Model Lab And Site Group Workflow

## Why this page exists

The modeling system is only useful if it is easy to operate.

This note explains how the website pages fit together and what each one is for.

## The three website pages

The browser UI now has three top-level pages:

1. `Scanner`
2. `Model Lab`
3. `Feature Docs`

## 1. Scanner

This is the existing workflow page.

Use it to:

- upload CSVs
- run scan jobs
- inspect rows
- upload manual snapshots
- label candidates
- download exports

This page is where the supervised data comes from.

The models do not replace this page.

They depend on it.

## 2. Model Lab

This is the operational modeling page.

Use it to:

- inspect how much labeled data exists
- train the `keyword-aware` model
- train the `keyword-ablated` model
- download the candidate dataset CSV
- list previously saved models
- download a browser-runtime JSON bundle for a saved model
- score an existing job
- upload site groups for hostname-based probing

## 3. Feature Docs

This is the consulting and interpretation page.

Use it to:

- remember what `comment list`, `comment block`, and `comment block element` mean
- compare the two model variants
- read what each curated feature really means

This page is for thinking and reference, not for training.

## Training workflow

The intended training workflow is:

1. scan pages in `Scanner`
2. label the true candidate list or hard negatives
3. open `Model Lab`
4. confirm that enough positive and negative labels exist
5. train the desired variant
6. inspect feature-family reliance
7. score a completed job
8. compare behavior across site groups

When the label set is still very small, the training code will fall back from domain holdout to a deterministic candidate split so you can still test the workflow. Once label coverage grows, domain holdout becomes the more meaningful evaluation mode.

## Job filter in Model Lab

The training section accepts an optional comma-separated job filter.

Use it when you want to:

- train only on a curated subset of jobs
- exclude noisy early jobs
- compare site families

Leave it blank when you want to use all currently stored labeled candidates.

## What training produces

Each training run saves a model artifact under:

- `output/models/<variant-id>/<artifact-id>.json`

That artifact becomes selectable in the rest of the Model Lab.

The `Trained Models` table also exposes:

- `Runtime JSON`

That export is the intended handoff bundle for browser-side inference.

It is smaller and cleaner than the full training artifact because it
keeps the model, vectorizer, thresholds, and provenance metadata
without shipping the entire training record.

## What scoring a job does

The `Score Existing Job` section does not re-scan the website.

It uses the candidates already stored on that job.

The flow is:

1. choose a saved model artifact
2. enter a completed job ID
3. the server rebuilds candidate rows from the stored job items
4. the selected model scores every candidate
5. the page shows the top candidate for each item
6. the page marks whether manual review is still suggested

This is useful because it separates:

- candidate generation
- from candidate ranking

## What site-group probing does

The `Site Group Probe` section is not a live scraper either.

It is a grouping and analysis tool.

You paste or upload:

- full URLs
- or plain hostnames

The system then:

1. normalizes them to hostnames
2. matches those hostnames against job items already stored in the repo state
3. scores the matching items with the selected model
4. groups the results by hostname

This makes it easier to answer questions like:

- how does the model behave on TikTok pages already scanned
- how does it behave on forum sites vs review sites
- which hostnames still tend to need manual review

## Important limitation of the site-group probe

The probe does not fetch new live pages.

It only works on:

- pages you already scanned and stored in the system

If you want brand new sites tested end to end, the workflow is:

1. upload them in `Scanner`
2. let the job finish
3. then score that completed job in `Model Lab`

## Why this is the right first workflow

This design keeps responsibilities separate:

- `Scanner` creates data
- `Model Lab` trains and evaluates
- `Feature Docs` explains

That avoids mixing too many different modes into one page.

## Dataset export

The Model Lab also lets you download a candidate dataset CSV.

That is useful for:

- offline inspection
- spreadsheet review
- future experiment notebooks
- verifying that the training rows look correct

The export uses the same candidate-row builder as the training code, so the CSV is aligned with the model inputs.

## What manual review rate means in the Model Lab

A scored job still marks some items as needing manual review.

In the current baseline, that means:

- the top predicted probability is not confidently high enough for auto-accept
- but it is not clearly low enough for an easy reject either

This is intentional.

The first model should reduce human review where it is safe, not pretend certainty where it does not have it.

## What to do after training the first few models

After a few training runs:

1. compare keyword-aware vs keyword-ablated
2. inspect which feature families dominate each
3. score several completed jobs
4. probe site groups by hostname
5. identify domains that still need more labels
6. return to `Scanner` and improve label coverage there

This creates the correct feedback loop between labeling and model improvement.
