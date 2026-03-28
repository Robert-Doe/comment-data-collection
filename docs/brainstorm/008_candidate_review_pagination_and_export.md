# Candidate Review Pagination And Export

Date:

- `2026-03-28`

This is the current active brainstorm note.

## Why this update matters

The candidate screenshots are useful only if the reviewer can move through them efficiently and export what the detector actually saw.

That means the candidate-review surface needs:

1. direct access from each row
2. pagination when the candidate list is long
3. easy export of the candidate feature payload

## Updated review workflow

The row table should now support review even when the algorithm already marked the page as `ugc_detected = true`.

That is important because:

- automated `yes` is not the final truth
- human labels remain the gold standard
- positive pages still need candidate-level confirmation

The intended workflow is:

1. scan page
2. keep candidate subgraphs
3. show candidate screenshots
4. let the reviewer label each candidate
5. export the stored candidate features if needed

## Candidate pagination

The candidate tab should not assume all candidate cards should be visible at once.

Pagination is now the right default because:

- candidate screenshots can be visually large
- long candidate sets become noisy
- reviewers need a controlled sequence through the candidate list

The candidate panel should show:

- current visible slice
- total candidate count
- current page
- previous / next navigation

## Candidate export direction

The selected row should support direct export of its candidate payload.

Useful exports are:

- candidate JSON
- candidate CSV

The JSON export should preserve the richer structure.

The CSV export should make quick analysis easier in spreadsheets or notebooks.

## Why this helps training

This is directly useful for the model-building loop.

The exported candidate payload gives you:

- the raw feature vector
- the candidate locator data
- the screenshot linkage
- the human label overlay

That makes candidate-level data much easier to:

- inspect
- debug
- label
- archive
- train on later

## Relationship to the feature-reference note

The detailed schema explanation is in:

- `007_feature_reference_and_output_schema.md`

This note focuses on the UI and workflow implications of that schema.

## Gold-standard principle

The operating principle remains:

- human candidate labels are the gold standard

So the UI should continue optimizing for:

- fast review
- low friction
- easy export
- easy reuse of candidate-level labeled data

## Immediate next implications

The next useful improvements after this should likely be:

1. candidate-level filtering by `detected`, `human_label`, or `confidence`
2. job-level export of all labeled candidates across rows
3. dedicated training-dataset export built from candidate reviews

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
