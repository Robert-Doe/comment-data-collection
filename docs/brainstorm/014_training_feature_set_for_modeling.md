# Training Feature Set For Modeling

Date:

- `2026-03-29`

This is the current active brainstorm note.

## Why this note exists

The extractor in [src/commentFeatures.js](../../src/commentFeatures.js) already emits a large number of features.

That is useful, but it can also be confusing.

For model training, we need a clearer answer to these questions:

- which fields should become actual training features
- which fields should be labels
- which fields should only be metadata
- which fields should be treated carefully to avoid leakage or overfitting

This note is the practical training-facing companion to:

- [012_model_construction_blueprint.md](./012_model_construction_blueprint.md)
- [007_feature_reference_and_output_schema.md](./007_feature_reference_and_output_schema.md)

## First principle

The first model should be trained on candidate rows.

Each row should describe one candidate region.

That row should contain:

- feature columns used by the model
- label columns used for supervision
- metadata columns used for debugging, splitting, and traceability

Those three groups should not be mixed together carelessly.

## High-level column groups

For training, candidate-row columns should be divided into five groups:

1. labels
2. identifiers and traceability metadata
3. model input features
4. helper baseline features from the heuristic system
5. fields to exclude from training

## 1. Labels

These are the columns the model is trying to learn from.

### Primary candidate label

- `human_label`

Recommended meaning:

- `comment_region` = positive
- `not_comment_region` = negative
- `uncertain` = hold out from the first training pass or place in a separate ambiguity bucket

### Optional derived labels later

These should not be part of the first model target, but may become useful later:

- page-level `ugc_detected`
- `ugc_type`
- `manual_capture_required`

For the first model, keep the target simple.

## 2. Identifiers and traceability metadata

These fields help track examples, inspect failures, and reproduce dataset rows.

They are usually not good direct model inputs.

Recommended metadata fields:

- `job_id`
- `item_id`
- `row_number`
- `candidate_key`
- `candidate_rank`
- `normalized_url`
- `final_url`
- `frame_url`
- `frame_key`
- `analysis_source`
- `manual_captured_at`
- `candidate_screenshot_url`
- `item_screenshot_url`
- `item_manual_uploaded_screenshot_url`

Why keep them:

- they help debug model mistakes
- they help retrieve screenshots and DOM state
- they allow domain-based splitting

Why not train directly on most of them:

- many are identifiers, paths, or direct site fingerprints
- they can cause site memorization instead of real generalization

## 3. Model input features

These are the fields that should be considered for the first tabular model.

The list below is grouped by feature family.

## A. Structural identity and tree-shape features

These describe what the candidate region looks like structurally in the DOM.

Useful fields include:

- `tag_name`
- `classes_count`
- `data_attributes_count`
- `aria_attributes_count`
- `role_attribute`
- `node_depth`
- `parent_index`
- `sibling_count`
- `has_shadow_dom`
- `descendant_shadow_host_count`
- `child_tag_variety`
- `direct_child_count`

Why they matter:

- comment containers often follow repeated structural patterns
- they often live in mid-depth, repeated-content areas rather than headers or footers

Caution:

- raw `classes` strings should be handled carefully because they may overfit to specific sites
- class-count style summaries are safer than raw class names in the first model

## B. Repetition and sibling-family features

These are some of the most important features in the repo.

Useful fields include:

- `repeating_group_count`
- `repeating_group_sig_id`
- `repeating_group_xpath_star`
- `dominant_group_strategy`
- `child_sig_id_group_count`
- `child_xpath_star_group_count`
- `xpath_star_group_count`
- `min_k_threshold_pass_3`
- `min_k_threshold_pass_5`
- `min_k_threshold_pass_8`
- `min_k_threshold_pass_15`
- `internal_depth_filter_pass`
- `sig_id_count_weak`
- `sig_id_count_medium`
- `sig_id_count_strong`
- `sibling_homogeneity_score`
- `sig_id_recursive_nesting`
- `reply_nesting_depth`
- `indent_margin_pattern`
- `thread_depth_indicator`

Why they matter:

- comment sections are usually not isolated single nodes
- they are repeated sibling structures with consistent unit patterns
- reply chains often create recursive or nested repetition

These features are likely to be among the strongest predictors.

## C. Text amount and content-shape features

These describe how much text exists and what kind of text pattern the candidate contains.

Useful fields include:

- `text_word_count`
- `text_char_count`
- `text_sentence_count`
- `text_avg_word_length`
- `has_text_content`
- `text_contains_links`
- `link_density`
- `text_contains_mentions_or_hashtags`
- `text_contains_emoji`
- `text_question_mark_count`
- `no_text_content_in_units`
- `quote_block_per_unit`
- `read_more_truncation`
- `sample_text`
- `unit_count`

Why they matter:

- true comment regions usually contain substantial human-written text
- many false positives either have too little text or very navigation-heavy text

Caution:

- `sample_text` itself should usually not be fed raw into the first tabular model
- it is better as debugging metadata unless you intentionally build a text model

## D. Keyword and semantic features

These capture explicit hints that a region is comment-like.

Useful fields include:

- `comment_header_with_count`
- `attributes_contain_keywords`
- `keyword_container_high`
- `keyword_container_med`
- `keyword_text_high`
- `keyword_text_med`
- `keyword_direct_text_high`
- `keyword_attr_name_high`
- `keyword_attr_value_high`
- `keyword_unit_high`
- `keyword_unit_high_coverage`
- `keyword_tag_name_high`
- `submit_button_keyword_high`
- `submit_button_keyword_med`
- `schema_org_comment_itemtype`
- `aria_role_comment`
- `aria_role_feed_with_articles`
- `microdata_itemprop_author`
- `microdata_itemprop_date_published`
- `microdata_itemprop_text`
- `json_ld_has_comment_type`
- `json_ld_has_comment_action`
- `comment_route_in_scripts`
- `interaction_counter_schema`

Why they matter:

- many real comment regions carry explicit semantic or lexical hints
- these are often high-signal features when present

Caution:

- keyword-heavy features can overfit if a model learns only obvious words like `comment`
- they should be used, but not treated as the only evidence family

## E. Author, avatar, and profile features

Useful fields include:

- `includes_author`
- `has_avatar`
- `author_avatar_coverage`
- `author_avatar_colocated`
- `profile_link_coverage`
- `user_profile_link_per_unit`
- `author_timestamp_colocated`
- `verification_badge`

Why they matter:

- comments and forum posts often cluster author identity, avatar, and timestamp in repeated units

These features are helpful because they are more structural than pure keywords.

## F. Time and chronology features

Useful fields include:

- `has_relative_time`
- `time_datetime_per_unit`
- `has_edit_history`
- `pinned_post_indicator`
- `deleted_placeholder_present`
- `deleted_placeholder`

Why they matter:

- real comment units often show timestamps
- forum and thread systems often contain edited or deleted markers

## G. Composer, reply, and action-control features

Useful fields include:

- `ui_interactive_element_count`
- `ui_form_count`
- `ui_contenteditable_count`
- `has_action_buttons`
- `has_more_options_button`
- `reply_button_unit_coverage`
- `textarea_tree_proximity`
- `has_nearby_textarea`
- `aligned_with_textarea`
- `aligned_with_content_editable`
- `char_counter_near_textarea`
- `submit_button_present`
- `submit_button_label`
- `collapse_expand_control`
- `pagination_load_more_adjacent`

Why they matter:

- comment regions often live near reply composers or submission controls
- many interactive discussion systems expose reply, expand, or load-more patterns

## H. Social engagement and thread features

Useful fields include:

- `reaction_coverage`
- `reaction_count_per_unit`
- `edit_delete_coverage`
- `edit_delete_per_unit`
- `share_button_per_unit`
- `like_count_pattern`
- `permalink_per_unit`
- `upvote_downvote_pair`

Why they matter:

- discussion systems often include engagement mechanics that product grids and nav panels do not

## I. Page and environment context features

Useful fields include:

- `frame_count`
- `blocked_by_interstitial`
- `blocker_type`
- `access_reason`
- `analysis_source`
- `frame_is_main`
- `frame_url` only as derived safe aggregates, not raw string

Why they matter:

- manual snapshots and blocked pages behave differently
- frame-heavy environments may affect candidate reliability

Caution:

- raw URLs should not usually be tokenized into the first model
- domain should be used for splitting and analysis, not naive training input

## J. Negative-control features

These are critical because they suppress common false positives.

Useful fields include:

- `table_row_structure`
- `add_to_cart_present`
- `nav_header_ancestor`
- `high_external_link_density`
- `external_link_density_low`
- `star_rating_no_text`
- `price_currency_in_unit`
- `spoiler_tag`

Why they matter:

- many wrong regions look repeated and structured
- these features help distinguish comments from product listings, nav menus, and review summaries without real text

## 4. Helper baseline features from the heuristic system

These are fields produced by the current rule-based scoring system.

They can be useful in a first hybrid model, but they must be interpreted carefully.

Examples:

- `score`
- `detected`
- `confidence`
- `ugc_type`
- `matched_signals`
- `penalty_signals`
- `base_detected`
- `acceptance_gate_passed`
- `keyword_gate_tier`
- `keyword_evidence_strength`
- `semantic_support_count`
- `structural_support_count`
- `interaction_support_count`
- `repeated_structure_support`

How to think about them:

- some are useful summary inputs
- some are almost mini-outputs from the heuristic itself
- they may help a first model as baseline or comparison features

Recommended rule:

- keep them in the export
- experiment with two model variants:
  - one using only raw extracted features
  - one using raw features plus heuristic summary features

That lets you measure whether the model is genuinely learning beyond the current score pipeline.

## 5. Fields to exclude from the first training model

These fields are valuable for debugging or UI review, but should not be direct model inputs at first.

### Direct labels or near-labels

- `human_label`
- `human_notes`
- `human_reviewed_at`

### High-leakage locators

- raw `xpath`
- raw `css_path`
- raw `wildcard_xpath_template`
- `node_id`
- `sigpath`

Why:

- these are useful for traceability, but they can become brittle site fingerprints

### Raw text blobs

- `sample_text`
- `sample_texts`
- long raw HTML fields

Why:

- these pull the problem toward text modeling
- that is a different modeling step from the first tabular baseline

### Artifact paths and URLs

- `candidate_screenshot_path`
- `candidate_screenshot_url`
- `item_screenshot_url`
- `item_manual_uploaded_screenshot_url`

Why:

- they are references, not meaningful numeric evidence by themselves

### Job identifiers

- `job_id`
- `item_id`

Why:

- they identify data, but do not generalize

## Recommended first export schema

The first training export should contain:

### Label columns

- `human_label`
- optional derived `binary_label`

### Metadata columns

- `job_id`
- `item_id`
- `row_number`
- `candidate_key`
- `candidate_rank`
- `normalized_url`
- `final_url`
- `analysis_source`
- `frame_url`
- `candidate_screenshot_url`

### Model feature columns

- the numerical, boolean, and categorical fields listed in sections A through J above

### Heuristic comparison columns

- `score`
- `detected`
- `confidence`
- `ugc_type`
- `matched_signals`
- `penalty_signals`

## Recommended feature typing

When training a tabular model, each field should be treated according to type.

### Boolean features

Examples:

- `schema_org_comment_itemtype`
- `aria_role_comment`
- `table_row_structure`
- `add_to_cart_present`

These can usually stay as `0` or `1`.

### Numeric features

Examples:

- `text_word_count`
- `repeating_group_count`
- `reply_nesting_depth`
- `link_density`
- `frame_count`

These should be kept as numbers.

### Short categorical features

Examples:

- `tag_name`
- `role_attribute`
- `analysis_source`
- `confidence`
- `ugc_type`
- `keyword_gate_tier`
- `blocker_type`

These can be encoded as categories.

### List-valued fields

Examples:

- `matched_signals`
- `penalty_signals`

These should not be passed raw as arrays into a simple tabular export.

Safer early options:

- convert them into one-hot indicator columns
- or keep them only for analysis and not the first baseline

## Feature selection strategy for the first model

Do not try to hand-prune too aggressively at the beginning.

A better first strategy is:

1. export a broad but sane feature set
2. remove obvious leakage fields
3. train a baseline
4. inspect feature importance and failure cases
5. prune or regroup later

This is less risky than guessing too early which features matter.

## Likely strongest early features

If forced to guess before training, the strongest early feature families are probably:

- repeated sibling and homogeneity features
- author plus timestamp colocation
- reply and interaction coverage
- keyword and schema signals
- negative controls like commerce and nav suppression

That matches the structure of the current heuristic system.

## Likely fragile features

These should be watched carefully:

- raw class names
- raw locator strings
- raw URL fragments
- framework-specific attributes
- very rare schema or metadata markers

These can make validation look strong on familiar domains while generalization stays weak.

## Handling manual-snapshot rows

Manual-snapshot rows are valuable because:

- they preserve difficult pages
- they often expose the true comment region when live scanning struggled

But they may also differ from ordinary automated rows.

Recommended approach:

- keep `analysis_source` in the dataset
- evaluate separately on `automated` and `manual_snapshot` subsets
- do not assume performance transfers equally across both without measuring

## Suggested first dataset variants

Build at least three versions of the candidate dataset.

### Variant A: raw extracted features only

Purpose:

- measure whether the model can learn from the underlying evidence directly

### Variant B: raw features plus heuristic summary fields

Purpose:

- measure whether the current heuristic score still adds value as a compact signal

### Variant C: high-trust human-labeled subset only

Purpose:

- establish the cleanest baseline before adding pseudo-labels or weaker supervision

## Practical recommendation

If the goal is to get to a useful first model quickly:

1. export most boolean and numeric raw features
2. keep short categorical fields
3. exclude raw locators, long text, and artifact paths from the first model
4. keep heuristic summary fields as a separate experiment, not the only input set
5. evaluate by domain split

## Working conclusion

The best first training feature set for this repo is:

- candidate-level structural, semantic, interaction, and negative-control features
- plus a small number of safe context fields
- with heuristic summary features kept as optional comparison inputs

That gives a strong tabular baseline without overcommitting to brittle site-specific signals.

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
