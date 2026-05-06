# Why The Keyword-Aware Model Is Ready To Drive Candidate Classification

This note is about the current `keyword-aware` runtime bundle, not a future model shape. The question it answers is simple: is this model good enough to rank candidates and drive extension-side decision making?

The answer is yes, but only as a first-pass classifier with a review band. It is not a final oracle.

## What It Has

The artifact combines:

- 73 curated features
- 9 feature families
- logistic regression with 105 vector slots after one-hot expansion
- a 500-iteration fit with a learning rate of `0.08` and `l2 = 0.0005`
- runtime thresholds for positive and review-band decisions

The learned loss moved from `0.69314895` at iteration 1 to `0.15680005` at iteration 500, which is a strong sign that the fit actually converged instead of remaining random.

## Why It Is Good Enough

This model is good enough to drive classification because it does three things well:

- it separates obvious positive candidate roots from obvious negative containers
- it ranks the correct candidate near the top, which matters more than a binary answer in this repo
- it keeps an explicit uncertain band, so the extension can avoid overconfident mistakes

The runtime artifact is not perfect, but it is already useful enough to replace a pure heuristic ranking step.

## Evaluation Snapshot

| Split | Precision | Recall | F1 | ROC AUC | PR AUC |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 0.821 | 0.777 | 0.798 | 0.970 | 0.848 |
| Test | 0.849 | 0.681 | 0.756 | 0.948 | 0.798 |

Candidate counts:

- Train: 2462 rows
- Test: 747 rows
- Train positives: 372
- Test positives: 91

## Ranking Snapshot

The ranking numbers are what make the model operationally useful.

| Metric | Train | Test |
| --- | ---: | ---: |
| Top-1 accuracy | 0.846 | 0.824 |
| Mean reciprocal rank | 0.899 | 0.894 |
| Recall at 3 | 0.936 | 0.941 |

The test `recall_at_3` of `0.941176` is the clearest sign that the model is useful for candidate selection. In practice, the correct region is usually in the top few candidates even when the exact top 1 is not perfect.

## Page-Level Snapshot

| Metric | Train | Test |
| --- | ---: | ---: |
| Page has correct candidate rate | 0.628 | 0.647 |
| False positive page rate | 0.115 | 0.185 |
| Manual review rate | 0.269 | 0.364 |
| Overconfident false positive page rate | 0.062 | 0.037 |

This is why the model should be used as a gate, not as a blind yes/no oracle. It is already useful for triage, but the review band still matters.

## Decision Bands

The runtime bundle ships three thresholds:

- `positive: 0.5`
- `manual_review_low: 0.2`
- `manual_review_high: 0.8`

Recommended interpretation:

- `score >= 0.8` means high confidence
- `0.2 <= score < 0.8` means uncertain and should be reviewed or logged more carefully
- `score < 0.2` means low confidence

That three-way split is a better fit for extension testing than a raw binary cut.

## Current Stage

This model is at the stage where it can replace the heuristic ranking layer in the detector extension, but it should still be treated as:

- a first-pass ranking model
- a decision-support model
- a testing aid for extension behavior

It should not be treated as the last word on whether a page contains UGC.
