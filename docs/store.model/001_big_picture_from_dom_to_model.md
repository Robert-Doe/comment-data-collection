# Big Picture From DOM To Model

Date: `2026-04-01`

## 1. The shortest explanation

This repo is trying to answer:

> which DOM subtree on a page is most likely to be the repeated
> user-generated-content region?

The system does not want to inspect every DOM node one by one.
So it works in stages.

## 2. The full chain

1. The scanner or extension looks at the DOM.
2. It proposes likely container roots called `candidates`.
3. It computes many `features` for each candidate.
4. Humans review those candidates.
5. The review becomes `candidate_reviews`.
6. The dataset builder turns those reviewed candidates into rows.
7. The vectorizer turns `feature_values` into numeric vectors.
8. Logistic regression learns `weights` and `bias`.
9. The server saves a JSON artifact.
10. The browser uses `runtime.json` to score new candidates later.

## 3. Why candidates exist

The model is not trying to decide whether every tiny DOM node is a comment.

Instead, it asks:

- which candidate container looks like the true comment or review list?

This is why the repo keeps talking about `candidates`.

## 4. Why features exist

A model cannot directly learn from raw HTML in this codebase.

So the code turns one candidate into measurable facts like:

- `tag_name`
- `comment_header_with_count`
- `author_avatar_coverage`
- `reply_button_unit_coverage`
- `table_row_structure`

These become the candidate's `feature_values`.

## 5. Why human labels exist

The system needs examples of:

- correct candidates
- incorrect candidates

That is where labels like these come in:

- `comment_region`
- `not_comment_region`
- `uncertain`

Those human labels later become:

- `binary_label = 1`
- `binary_label = 0`
- or `null`

## 6. Why logistic regression is the first model

This repo starts with logistic regression because it is:

- fast
- browser-friendly
- easy to serialize into JSON
- easier to understand than a larger black-box model

## 7. The deployable output

At the end, the important browser handoff artifact is:

- `runtime.json`

That file contains:

- the feature schema
- vectorizer settings
- `weights`
- `bias`
- thresholds

That is the object the `detector_extension` is meant to consume.

## 8. What to remember

The simplest memory chain is:

- DOM -> candidates -> features -> labels -> dataset rows -> vectors ->
  logistic regression -> runtime JSON -> detector extension
