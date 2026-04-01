# The Heuristic Phase Before ML

Date: `2026-04-01`

## 1. Why heuristics come first

Before a trained model exists, the repo still needs a way to:

- rank candidates
- show useful review results
- drive early extension behavior

So the system starts with heuristics.

These are hand-written rules, not learned weights.

## 2. Scanner-side heuristic scoring

In `src/commentFeatures.js`, the key function is:

- `scoreFeatures(features)`

This function manually adds and subtracts evidence.

Examples of positive evidence:

- `schema_org_comment_itemtype`
- `aria_role_comment`
- `comment_header_with_count`
- `author_timestamp_colocated`
- `reply_button_unit_coverage`

Examples of negative evidence:

- `table_row_structure`
- `add_to_cart_present`
- `nav_header_ancestor`
- `high_external_link_density`

## 3. What the heuristic returns

The heuristic returns more than a single score.

It can produce:

- `score`
- `detected`
- `confidence`
- `ugc_type`
- `matched_signals`
- `penalty_signals`
- `acceptance_gate_passed`

This is useful because it explains why a candidate was liked or disliked.

## 4. Extension-side heuristic

In `detector_extension/injected_wrapper.js`, the extension currently uses:

- `HeuristicClassifier`

This is the placeholder that will eventually be replaced by the trained
logistic-regression model.

Its output is already a confidence-style score in the `[0, 1]` range.

## 5. Why the `[0, 1]` scale matters

That score format matches the eventual learned probability style.

So the extension can later swap:

- heuristic score

for:

- model probability

without redesigning the whole scoring pipeline.

## 6. Thresholds in the extension

The extension currently uses:

- `UGC_HIGH_THRESHOLD = 0.65`
- `UGC_LOW_THRESHOLD = 0.35`

These help it decide:

- strong UGC region
- uncertain region
- weak region

That threshold-based behavior will later map nicely to runtime model thresholds.

## 7. Why heuristics are still useful after ML

Even once the model exists, heuristics still matter because they:

- created the first useful review pipeline
- provide a fallback
- give a baseline for comparison
- help debug unexpected model behavior

## 8. What to remember

The heuristic phase is the working pre-ML version of the ranking logic.
It helps collect better labels and keeps the extension useful before runtime
model loading is finished.
