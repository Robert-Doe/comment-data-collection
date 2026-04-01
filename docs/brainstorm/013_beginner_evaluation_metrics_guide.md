# Beginner Evaluation Metrics Guide

Date:

- `2026-03-29`

## Why this note exists

The phrase `evaluation metrics` can sound abstract if you are not already used to machine learning or ranking systems.

In this project, evaluation metrics simply mean:

- how we measure whether the detector is doing a good job
- how we compare one version of the system against another
- how we decide if a model is actually helping instead of just sounding smarter

This note explains the metrics from the model-construction note in plain language.

## The easiest mental model

On each page, the system does not usually make just one guess.

It first produces several possible page regions called `candidates`.

A candidate is something like:

- this `div`
- this `section`
- this list of repeated children
- this feed-like region

Then the system ranks those candidates from most likely to least likely.

So there are really two questions:

1. did it correctly identify a good comment region as a candidate at all?
2. did it rank the correct one near the top?

That is why we need more than one metric.

## Three layers of judging the system

There are three useful layers:

### 1. Candidate-level

This treats each candidate region as a separate yes or no prediction.

Question:

- when the model looks at one candidate, does it correctly say "comment region" or "not comment region"?

### 2. Ranking-level

This asks whether the model ranked the correct candidate highly.

Question:

- even if the page had several candidates, did the correct one appear near the top?

### 3. Page-level

This asks whether the whole page was handled acceptably.

Question:

- for this webpage, did the system end up giving a usable answer?

## Basic vocabulary first

Before the metrics, it helps to know four simple terms.

### True positive

The model said a candidate is a comment region, and that was correct.

Example:

- the system marks a repeated comment list as the comment region
- the human reviewer agrees

### False positive

The model said a candidate is a comment region, but it was wrong.

Example:

- the system marks a product review card grid, recommendation carousel, or forum sidebar as the comment region
- the reviewer says it is not the real comment area

### True negative

The model said a candidate is not a comment region, and that was correct.

### False negative

The model said a candidate is not a comment region, but it actually was.

This is a miss.

## Candidate-level metrics

These metrics judge single candidate predictions.

They matter because the training set for the first model is candidate-based.

## Precision

Plain meaning:

- when the model says "this is a comment region," how often is it right?

Formula idea:

- correct positive predictions divided by all positive predictions

If precision is high:

- the model is careful
- when it flags something as comments, it is usually trustworthy

If precision is low:

- the model is too trigger-happy
- it often mistakes other page regions for comments

Why precision matters here:

- false positives are expensive
- they can make the system confidently report comments where none exist
- that can waste reviewer time or create bad automated decisions

Small example:

- model says 10 candidates are comment regions
- only 7 really are
- precision = 7 / 10 = 0.70

So the model is right 70% of the time when it makes a positive claim.

## Recall

Plain meaning:

- out of all the real comment regions that existed, how many did the model successfully find?

Formula idea:

- correct positive predictions divided by all actual positive cases

If recall is high:

- the model misses fewer true comment regions

If recall is low:

- the model is too cautious
- it leaves real comment regions behind

Why recall matters here:

- if recall is too low, the system will keep missing pages that really do have comments
- that raises manual review burden and hurts detector usefulness

Small example:

- there are 20 real comment-region candidates in the labeled data
- model finds 15 of them
- recall = 15 / 20 = 0.75

So it finds 75% of the real positives.

## Precision vs recall tradeoff

These two often pull in opposite directions.

If you make the model stricter:

- precision may go up
- recall may go down

If you make the model looser:

- recall may go up
- precision may go down

That is normal.

The goal is not "maximize one number blindly."

The goal is to choose the balance that matches the product need.

For this repo, a good starting bias is:

- do not let false positives explode
- but still keep enough recall that true comment regions are not constantly missed

## F1 score

Plain meaning:

- one summary score that balances precision and recall

Why it exists:

- precision alone can hide the fact that the model misses too much
- recall alone can hide the fact that the model produces too many false alarms

F1 becomes useful when:

- you want one quick comparison number
- you still care about both precision and recall

How to interpret it:

- higher is better
- it is only strong if both precision and recall are reasonably strong

Important caution:

- F1 is convenient, but it should not replace looking at precision and recall separately

## ROC-AUC

This is more advanced.

Plain meaning:

- if you vary the decision threshold from strict to loose, how well does the model separate positive cases from negative ones overall?

What it tells you:

- whether the model tends to score good candidates above bad candidates

Why it can be useful:

- it is threshold-independent
- you can compare models even before choosing the final operating threshold

Why it can be confusing:

- it is not very intuitive for day-to-day product decisions
- it can look good even when the practical threshold behavior is not great

Beginner recommendation:

- keep it as a supporting metric, not the main one you rely on first

## PR-AUC

This is also advanced, but often more relevant than ROC-AUC when positives are rare.

Plain meaning:

- how well does the model trade off precision and recall across thresholds?

Why it matters here:

- true comment-region candidates may be much rarer than non-comment candidates
- that means class imbalance is real

Why many people prefer it in imbalanced problems:

- it pays more attention to precision and recall behavior directly

Beginner recommendation:

- if you keep only one advanced curve-based metric, `PR-AUC` is often more useful here than `ROC-AUC`

## Ranking metrics

These matter because the model does not only classify candidates.

It also ranks them.

The page may have:

- the real comment list
- a related-posts section
- a product review widget
- a feed-like recommendation block

Even if the system produces the correct candidate somewhere, it is still much better if that candidate is ranked first or near first.

## Top-1 accuracy

Plain meaning:

- was the model's number 1 candidate the correct one?

This is one of the easiest metrics to understand.

If top-1 accuracy is high:

- the first thing the model points at is usually the right region

Why it matters:

- if the best candidate is usually correct, the page-level workflow becomes simpler
- the UI becomes easier to trust
- automated decisions become more viable

Small example:

- test set has 100 pages
- on 68 of them, the top-ranked candidate is correct
- top-1 accuracy = 68%

## Mean reciprocal rank

This sounds technical, but the idea is simple.

Plain meaning:

- how high is the first correct candidate, on average?

How it scores one page:

- if the first correct candidate is rank 1, score = `1`
- if it is rank 2, score = `1/2`
- if it is rank 3, score = `1/3`
- if there is no correct candidate, score = `0`

Then you average that across pages.

Why it is useful:

- it rewards getting the correct answer near the top
- it punishes letting the correct answer sink too far down the list

Why it is nicer than it sounds:

- it reflects reviewer experience well
- rank 1 is much better than rank 3
- the scoring captures that naturally

## Recall@k

Plain meaning:

- was the correct candidate somewhere in the top `k` candidates?

Examples:

- `recall@1` is almost the same idea as top-1 success
- `recall@3` asks whether the correct answer appeared in the top 3
- `recall@5` asks whether it appeared in the top 5

Why it matters:

- if the correct candidate is in the top 3, the review UI can still be useful even if rank 1 was wrong
- this is especially important when human review is part of the workflow

Example:

- on 100 pages, the correct region appears somewhere in the top 3 on 90 pages
- then `recall@3 = 90%`

This means the system is good at surfacing the right answer near the top, even if it does not always make it first.

## Page-level derived metrics

These move from candidate rows back to the real user question:

- did the system handle the whole page well?

## Did the page get at least one correct comment-region candidate?

Plain meaning:

- for this page, did the system manage to include at least one true comment region in its candidate list?

Why this matters:

- if the answer is no, the page is basically unrecoverable without a fresh scan or manual snapshot
- if the answer is yes, the review UI still has something useful to work with

This is a very practical metric.

It tells you whether candidate discovery is working at all.

## False positive page rate

Plain meaning:

- how often does the system claim a page has comments when it really does not?

Why it matters:

- page-level false positives are more visible than candidate-level ones
- they can make the overall system look unreliable

Example:

- pages with no true comments still get marked as having a comment region
- that is a page-level false positive

This is especially important if the system is ever used to trigger security scanning, moderation, or follow-up processing automatically.

## Manual-review rate

Plain meaning:

- how often does the system still need a human to step in?

Why it matters:

- the goal is not only accuracy in a lab
- the goal is also to reduce human effort without becoming reckless

High manual-review rate means:

- the system is still too uncertain too often
- the workflow is still expensive in reviewer time

Low manual-review rate can be good, but only if accuracy remains acceptable.

A low review rate with bad predictions is not an improvement.

## Operational metrics

These are product and workflow metrics.

They matter because a model can look good in offline testing and still be bad operationally.

## How often the model reduces human review

Plain meaning:

- compared with the previous system, how often does the model let us skip a manual check?

This is one of the most business-relevant metrics.

It answers:

- is the model saving real effort?
- is it making the review queue smaller?

Example:

- old system required human review on 40% of pages
- new system requires review on 25% of pages
- that is a real operational win if error rates stay controlled

## How often it creates overconfident false positives

Plain meaning:

- how often is the model very sure and still wrong?

Why this is dangerous:

- confident wrong predictions are harder for people to notice
- they create a false sense of safety
- they can be worse than uncertain predictions

This is often more important than ordinary mistakes.

An uncertain mistake can still be routed to review.

A very confident mistake may slip through.

## Which metrics matter most at the beginning

For this project, the best beginner-focused core set is probably:

1. `precision`
2. `recall`
3. `top-1 accuracy`
4. `recall@3`
5. `manual-review rate`
6. `false positive page rate`

Why this set:

- precision and recall show basic candidate quality
- top-1 accuracy shows whether the model's first guess is right
- recall@3 shows whether the review UI still has a good option near the top
- manual-review rate shows workflow cost
- false positive page rate shows safety against bad page-level claims

## A practical example

Imagine 100 test pages.

Suppose:

- 80 pages really contain a comment region
- 20 pages do not
- the model finds at least one correct candidate on 72 of the 80 positive pages
- it wrongly claims comments on 4 of the 20 negative pages
- the top candidate is correct on 60 pages
- the correct candidate is in the top 3 on 74 pages
- 22 pages still need manual review

What that suggests:

- candidate discovery is fairly strong
- ranking is decent but not yet perfect
- page-level false positives still exist and need watching
- reviewer burden is reduced, but not removed

This kind of reading is more useful than staring at a single metric in isolation.

## Why multiple metrics are necessary

No single metric tells the whole truth.

A few examples:

- high precision but low recall means "careful, but misses too much"
- high recall but low precision means "finds a lot, but makes too many bad guesses"
- good top-1 accuracy but bad false positive page rate means "first guesses look good, but safety is still weak"
- low manual-review rate but many overconfident mistakes means "automation improved the wrong way"

That is why evaluation should always be read as a set of measurements, not one magic score.

## Recommended interpretation order

When comparing two model versions, read the results in this order:

1. Did false positive page rate get worse?
2. Did precision stay acceptable?
3. Did recall improve?
4. Did top-1 accuracy improve?
5. Did recall@3 improve?
6. Did manual-review rate go down without harming the first five checks?

This order reflects the practical risk of the system.

## Simple takeaway

If you want the shortest possible summary:

- `precision` tells you how often positive predictions are correct
- `recall` tells you how many real positives were found
- `top-1 accuracy` tells you whether the best-ranked candidate was correct
- `recall@3` tells you whether the correct region appeared near the top
- `false positive page rate` tells you how often whole pages are wrongly flagged
- `manual-review rate` tells you how often a human is still needed

## Final recommendation

For early iterations on this repo:

- do not obsess over advanced metrics first
- start with a small metric set you can explain clearly
- always inspect real failure examples alongside the numbers

The numbers tell you where to look.

The reviewed pages tell you why the model behaved that way.
