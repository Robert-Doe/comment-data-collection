# How Reviewed Candidates Become Dataset Rows

Date: `2026-04-01`

## 1. Why dataset rows exist

Training code wants a clean table of examples.

That table is created from reviewed candidates.

The main logic lives in:

- `src/modeling/common/dataset.js`

## 2. The main function

The key entry point is:

- `extractCandidateDataset(items, options = {})`

It returns:

- `featureCatalog`
- `rows`
- `summary`

Here, `rows` is the important part for training.

## 3. One page can produce many rows

This repo does not treat one page as one example.

Instead:

- one item
- many candidates
- many rows

That is because the model is learning candidate ranking.

## 4. The row builder

Each row is built by:

- `buildCandidateRow(item, candidate, featureCatalog, itemLabelCounts, reviewCoverage)`

The row includes both metadata and learning fields.

## 5. Important row fields

Examples:

- `dataset_row_id`
- `job_id`
- `item_id`
- `candidate_key`
- `candidate_rank`
- `hostname`
- `analysis_source`
- `human_label`
- `binary_label`
- `feature_values`

If you are focused on ML, the two most important are:

- `binary_label`
- `feature_values`

## 6. How `binary_label` is derived

The helper:

- `toBinaryLabel(label)`

does this mapping:

- `comment_region -> 1`
- `not_comment_region -> 0`
- `uncertain -> null`
- unlabeled -> null

So the machine-learning target is numeric even though the human review started
as a text label.

## 7. What `feature_values` means

`feature_values` is the structured feature object attached to that row.

It is the row's machine-learning input before vectorization.

So the row basically says:

- here is the candidate
- here are its measured signals
- here is whether it was truly the comment region

## 8. Why metadata stays on the row

Rows keep helpful context such as:

- `final_url`
- `frame_url`
- `analysis_source`
- `item_status`
- `score`
- `confidence`
- `ugc_type`

That makes the dataset easier to audit and debug.

## 9. Summary counts

The dataset summary tracks things like:

- `candidate_count`
- `labeled_candidate_count`
- `positive_candidate_count`
- `negative_candidate_count`
- `uncertain_candidate_count`

These counts tell you whether you have enough training material.

## 10. What to remember

The dataset builder is where reviewed candidates become clean supervised rows.

The key mental picture is:

- one item -> many candidate rows
- each row has `feature_values` and `binary_label`
