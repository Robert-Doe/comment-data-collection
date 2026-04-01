# How Human Labeling Enters The System

Date: `2026-04-01`

## 1. Why the model needs people

A model cannot learn what the true comment region is unless someone tells it.

That truth enters the repo through human candidate review.

## 2. The three legal labels

The allowed labels are:

- `comment_region`
- `not_comment_region`
- `uncertain`

These are defined in:

- `src/shared/candidateReviews.js`

They are not casual wording.
They are part of the pipeline contract.

## 3. Where labels are stored

Each scanned item can store:

- `candidate_reviews`

Each review can contain:

- `candidate_key`
- `label`
- `notes`
- `xpath`
- `css_path`
- `candidate_rank`
- `source`
- `created_at`
- `updated_at`

So a review is tied to one exact candidate.

## 4. Why `candidate_key` matters

One page may have many candidate roots.

When a person says:

- "this one is the real comment region"

the system needs a stable identity for that exact candidate.

That identity is `candidate_key`.

## 5. Applying reviews back onto candidates

The helper:

- `applyCandidateReviews(candidates, reviews)`

merges stored reviews back into the candidate list.

After that, a candidate can carry fields like:

- `human_label`
- `human_notes`
- `human_reviewed_at`
- `human_review_source`

This is how human truth gets attached to the candidate object itself.

## 6. Why `uncertain` is allowed

Forcing every case into yes/no often makes the dataset worse.

`uncertain` is useful when:

- the page is ambiguous
- the candidate crop is misleading
- comments are half-hidden
- multiple similar containers exist

That protects data quality.

## 7. Why strong negatives matter

Good training data is not just:

- true comment regions

It also needs wrong but tempting candidates, such as:

- product grids
- article recommendation lists
- nav-heavy sidebars
- tables

Those become high-value `not_comment_region` examples.

## 8. What to remember

The key chain is:

- review UI action
- `candidate_reviews`
- `applyCandidateReviews(...)`
- `human_label`

That is the bridge from human judgment to machine-learning supervision.
