# Keyword-Ablated Logistic Model

## What this model is

The keyword-ablated model is the structural comparison model.

It uses the same:

- candidate rows
- labels
- training flow
- vectorizer logic
- logistic regression implementation
- evaluation code

But it deliberately excludes the curated lexical keyword family.

## Main goal

This model asks:

- how far can the detector get if it cannot rely on obvious comment-style wording?

This is the key generalization test.

## What is removed

This model removes features that are primarily direct lexical shortcuts.

Examples include:

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

The goal is not to cripple the model.

The goal is to force it to rely on more durable evidence families.

## What remains

The keyword-ablated model still keeps:

- repeated structure evidence
- author plus timestamp evidence
- reply and interaction evidence
- semantic markup evidence
- negative-control evidence
- safe context fields

That means the model can still learn things like:

- this candidate has a strong repeated sibling family
- the repeated units look authored and timestamped
- the region sits near a composer
- the candidate is not a product grid or nav block

## Why this model matters

Without this model, it is impossible to know whether the first system is truly learning `comment-list structure` or simply reading explicit wording.

This model is the strongest answer to that concern.

## What success looks like

Success does not mean this model must beat the keyword-aware model everywhere.

A successful outcome would be:

- competitive top-1 ranking
- reasonable recall on held-out domains
- fewer obvious shortcut-driven false positives
- clear importance concentrated in repeated-block, author-time, interaction, and negative-control families

That would mean the core feature design is structurally meaningful.

## What failure looks like

A failure pattern would be:

- recall collapses badly
- the model misses many easy comment pages unless wording is explicit
- the remaining features are not strong enough to separate comment lists from generic repeated content

If that happens, the conclusion is not necessarily:

- keywords are required forever

It may instead mean:

- the structural feature families still need improvement
- block-level evidence needs strengthening
- negative controls need refinement

## Why this variant is especially important for future single-block detection

The long-term goal includes pages where only one visible comment block exists.

A keyword-heavy model may not transfer well to that future problem.

A model that learns from:

- authored block structure
- time markers
- reply controls
- text-bearing repeated units

is more likely to teach the project something reusable later.

So this variant is not only an ablation.

It is also the more future-facing model.

## What to inspect after training

Look closely at the top positive weights.

Healthy positive drivers here would include things like:

- `repeating_group_count`
- `sibling_homogeneity_score`
- `author_timestamp_colocated`
- `time_datetime_per_unit`
- `reply_button_unit_coverage`
- `has_nearby_textarea`
- `schema_org_comment_itemtype`

Healthy negative drivers would include:

- `table_row_structure`
- `add_to_cart_present`
- `price_currency_in_unit`
- `nav_header_ancestor`
- `high_external_link_density`

If those families dominate, the ablation is doing its job.

## Why the comparison is valuable even if this model loses

Even if the keyword-ablated model underperforms the keyword-aware model, it still gives valuable information:

- which structural features remain strong
- which ones are too weak
- where the detector still depends on lexical shortcuts

That is engineering value, not wasted effort.

## Practical interpretation of outcomes

### If this model stays competitive

Interpretation:

- the repo is already learning real comment-list structure

### If this model falls behind only slightly

Interpretation:

- keywords help, but the structural feature design is already useful

### If this model falls behind sharply

Interpretation:

- the current curated structural evidence is not yet strong enough on its own

That would justify adding:

- richer block-level features
- better semantic grouping
- later boosted-tree experiments

## Practical role in this repo

This model should be treated as:

- the anti-shortcut baseline
- the domain-generalization check
- the main structural sanity test for the current feature design

If the project later introduces a tree model, this variant should still remain in the experiment matrix.
