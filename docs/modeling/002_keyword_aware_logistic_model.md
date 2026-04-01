# Keyword-Aware Logistic Model

## What this model is

The keyword-aware model is the full first-pass baseline.

It uses:

- structural features
- repeated-block features
- text-body features
- semantic markup features
- author and timestamp features
- interaction-control features
- negative-control features
- context features
- lexical keyword features

This is the most permissive variant.

## Main goal

This model asks:

- how strong can the first tabular baseline become when the full curated feature set is available?

It is expected to do well on easier pages where:

- labels like `comments`, `replies`, `reviews`, or `forum` appear explicitly
- markup or DOM attributes clearly expose comment semantics

## Why keep this model

Even though keywords can overfit, it would be a mistake to remove them from the first modeling pass entirely.

Reasons:

- many real websites do expose useful lexical hints
- keywords can materially improve recall on pages that are otherwise structurally noisy
- the repo needs a real comparison point against the ablated model

Without this model, there is no honest way to measure whether keyword removal helps or hurts.

## Feature families used

The keyword-aware model includes the lexical family from the catalog.

Examples:

- `comment_header_with_count`
- `attributes_contain_keywords`
- `keyword_container_high`
- `keyword_text_high`
- `keyword_text_med`
- `keyword_direct_text_high`
- `keyword_attr_name_high`
- `keyword_attr_value_high`
- `keyword_unit_high_coverage`
- `submit_button_keyword_high`

It also keeps the non-lexical families, because the goal is not keyword-only learning.

## What the model is supposed to learn

At its best, the model should learn a combination like this:

- a list has repeated block structure
- those blocks contain authored text
- the blocks have author, time, and interaction signals
- explicit lexical hints reinforce the prediction

That is the healthy version of keyword use.

The unhealthy version would be:

- seeing the word `comment`
- ignoring everything else
- predicting positive too easily

The comparison against the keyword-ablated model is what tells us whether the learned behavior is healthy or shortcut-driven.

## What overfitting would look like

This model is at higher risk of:

- memorizing obvious site wording
- leaning too hard on `comment`, `review`, `reply`, `forum`, or `answer`
- performing well on familiar domains but weakening on held-out ones

That is why evaluation should not be judged only on overall accuracy.

The more important questions are:

- does it still behave well on domain holdouts
- does it still behave well when lexical cues are weak
- does it create high-confidence false positives on structured non-comment lists

## What to inspect after training

After this model trains, inspect:

### Feature-family importance

If the lexical family dominates almost everything, that is a warning sign.

### Positive coefficients

Look for whether strong positive weights cluster mostly around:

- keyword features
- or a healthier spread across repeated-block, author-time, interaction, and semantic families

### Negative coefficients

Look for whether strong negatives include:

- `table_row_structure`
- `add_to_cart_present`
- `price_currency_in_unit`
- `nav_header_ancestor`

That indicates the model is learning useful suppression logic.

## When this model is likely to help

This model is likely to help on:

- forum pages with explicit reply wording
- product review pages that say `reviews`
- comment feeds with `view all comments` or `x comments`
- Q&A pages with strong answer/question wording

## When this model is likely to be fragile

This model is more likely to struggle when:

- the site hides comments behind generic wording
- the site uses novel or non-English UI wording not covered by the current patterns
- the site has structured repeated cards that mention comment-like words outside the true comment list

## Why logistic regression is still useful here

Even with the full keyword family included, logistic regression is useful because:

- each coefficient is inspectable
- family-level influence is easy to summarize
- disagreements with the keyword-ablated model are interpretable

This matters more right now than squeezing out a slightly better opaque score.

## Expected interpretation of results

There are three main outcomes to look for:

### Outcome 1

The keyword-aware model wins clearly on held-out domains too.

Interpretation:

- keywords are genuinely useful and not merely memorized shortcuts

### Outcome 2

The keyword-aware model wins mostly on familiar domains but not on held-out ones.

Interpretation:

- the lexical family is probably carrying too much of the model

### Outcome 3

The keyword-aware model only slightly beats the ablated model.

Interpretation:

- keywords help, but the more general structure families may be doing most of the real work

## Practical role in this repo

This model should be treated as:

- the strongest first-pass baseline
- the reference point for the keyword-ablation comparison
- a tool for discovering whether obvious lexical cues are still worth keeping in later models
