# ML Feature Selection And Candidate Ranking

This note narrows the scope to pure data extraction.

Out of scope for this document:

- reCAPTCHA
- Cloudflare
- login walls
- any security-intervention model

In scope:

- features computed from the HTML string and the pseudo DOM / instrumented DOM
- deciding whether a page likely contains comment-like UGC
- deciding which DOM subgraph is the most likely UGC/comment container
- capturing screenshots of candidate DOM regions for human labeling

## Working Problem Definition

For now, the positive class is:

- a comment-like UGC container

That can include:

- article comment threads
- forum reply threads
- Q&A answer/comment areas
- review/comment sections
- social reply threads

If later we want a finer taxonomy, we can add subtype labels. For now, the important step is binary detection plus DOM-subgraph localization.

## What We Can Train Right Now

We should train two related models.

### 1. Candidate model

Input:

- one candidate DOM subgraph
- its extracted feature vector

Output:

- probability that this candidate is the true UGC/comment region

This is the most important model because it also gives us the region to screenshot and review.

### 2. Page model

Input:

- aggregated signals from the top candidate regions
- a small number of page-global HTML features

Output:

- probability that the page contains a comment-like UGC region somewhere

The page model should mostly sit on top of the candidate model.

## Data Units We Should Store

### Candidate row

One row per candidate region.

Recommended fields:

- `normalized_url`
- `final_url`
- `domain`
- `candidate_rank`
- `xpath`
- `css_path`
- candidate feature vector
- screenshot path for the candidate crop
- human label:
  - `is_true_ugc_region`
  - `is_comment_like`
  - optional subtype later

### Page row

One row per page.

Recommended fields:

- `normalized_url`
- `final_url`
- `domain`
- number of candidates found
- top-1 probability
- top-3 probability summary
- page-global HTML features
- human label:
  - `page_has_comment_like_ugc`

## Feature Policy

We should split the current features into four buckets:

1. use now in the candidate model
2. use now in the page model
3. keep as metadata for screenshots/review, but not as model input
4. exclude for now

## 1. Candidate Model Features To Use Now

These are the strongest current features for locating a UGC/comment container inside the DOM.

Rule:

- prefer candidate-local or near-candidate features
- avoid page-global signals that are identical for every candidate on the same page

### A. Structural repetition and container shape

Use:

- `classes_count`
- `data_attributes_count`
- `aria_attributes_count`
- `child_tag_variety`
- `direct_child_count`
- `node_depth`
- `parent_index`
- `sibling_count`
- `repeating_group_count`
- `child_sig_id_group_count`
- `min_k_threshold_pass_3`
- `min_k_threshold_pass_5`
- `min_k_threshold_pass_8`
- `min_k_threshold_pass_15`
- `min_k_count`
- `internal_depth`
- `internal_depth_filter_pass`
- `sig_id_count`
- `sig_id_count_weak`
- `sig_id_count_medium`
- `sig_id_count_strong`
- `internal_max_depth`
- `internal_tag_variety`
- `avg_unit_depth`
- `depth_and_variety_pass`
- `sibling_homogeneity_score`
- `dominant_sig_proportion`
- `sig_id_recursive_nesting`
- `recursive_nesting_depth`
- `reply_nesting_depth`
- `has_reply_nesting`
- `indent_margin_pattern`
- `indented_unit_count`
- `thread_depth_indicator`
- `depth_indicator_unit_count`

Why:

- comment and reply regions are usually repeated, internally similar, and nested more deeply than ordinary content blocks

### B. Comment/UGC semantic signals

Use:

- `comment_header_with_count`
- `comment_header_count_value`
- `attributes_contain_keywords`
- `schema_org_comment_itemtype`
- `schema_org_comment_count`
- `aria_role_comment`
- `aria_role_comment_count`
- `aria_role_feed`
- `aria_role_feed_with_articles`
- `aria_role_feed_count`
- `microdata_itemprop_author`
- `microdata_itemprop_author_count`
- `microdata_itemprop_date_published`
- `microdata_itemprop_date_published_count`
- `microdata_itemprop_text`
- `microdata_itemprop_text_count`
- `keyword_container_high`
- `keyword_container_med`
- `keyword_container_low`
- `keyword_unit_high`
- `keyword_unit_high_coverage`

Why:

- these are direct semantic hints that the subtree is intended to hold comments, replies, discussions, or reviews

### C. Text and density signals

Use:

- `text_word_count`
- `text_char_count`
- `text_sentence_count`
- `text_avg_word_length`
- `has_text_content`
- `total_text_length`
- `text_contains_links`
- `link_count`
- `link_density`
- `link_text_length`
- `text_contains_mentions`
- `mention_count`
- `text_contains_hashtags`
- `hashtag_count`
- `text_contains_emoji`
- `emoji_count`
- `text_question_mark_count`
- `text_exclamation_count`
- `has_time_datetime_element`
- `time_datetime_element_count`
- `has_relative_time_text`
- `relative_time_text_count`
- `has_relative_time`
- `units_with_relative_time`
- `time_datetime_per_unit`

Why:

- genuine UGC blocks typically have text bodies, per-item timestamps, and moderate text density

### D. User identity and per-item action signals

Use:

- `action_button_count`
- `units_with_action_buttons`
- `has_action_buttons`
- `has_more_options_button`
- `more_options_button_count`
- `includes_author`
- `author_element_count`
- `has_avatar`
- `avatar_img_count`
- `reply_button_per_unit`
- `reply_button_unit_coverage`
- `report_flag_button_per_unit`
- `report_flag_unit_coverage`
- `author_avatar_colocation`
- `author_avatar_colocation_unit_count`
- `author_avatar_coverage`
- `reaction_count_per_unit`
- `units_with_reaction_count`
- `reaction_coverage`
- `edit_delete_per_unit`
- `units_with_edit_delete`
- `edit_delete_coverage`
- `user_profile_link_per_unit`
- `units_with_profile_link`
- `profile_link_coverage`
- `author_timestamp_colocated`
- `author_timestamp_unit_count`
- `share_button_per_unit`
- `units_with_share`
- `share_coverage`
- `upvote_downvote_pair`
- `units_with_vote_pair`
- `permalink_per_unit`
- `units_with_permalink`
- `deleted_placeholder_present`
- `deleted_placeholder_unit_count`
- `quote_block_per_unit`
- `units_with_blockquote`
- `quote_coverage`
- `read_more_truncation`
- `units_with_read_more`
- `has_edit_history_indicator`
- `edited_unit_count`
- `pinned_post_indicator`
- `verification_badge_present`
- `verification_badge_count`
- `spoiler_tag_present`
- `like_count_pattern`
- `units_with_like_count`

Why:

- these describe the repeated per-item UI pattern common to real comments, replies, and review units

### E. Composer and interaction-neighborhood signals

Use:

- `ui_interactive_element_count`
- `ui_form_count`
- `ui_contenteditable_count`
- `textarea_tree_proximity`
- `contenteditable_tree_proximity`
- `nearest_input_distance`
- `nearest_textarea_distance`
- `has_nearby_textarea`
- `textarea_very_close`
- `textarea_close`
- `aligned_with_textarea`
- `aligned_with_content_editable`
- `pagination_load_more_adjacent`
- `char_counter_near_textarea`
- `submit_button_present`
- `collapse_expand_control`

Why:

- UGC sections often sit near a composer, reply box, or load-more control

### F. Negative-control features

Use:

- `price_currency_in_unit`
- `price_currency_unit_count`
- `price_coverage`
- `nav_header_ancestor`
- `nav_header_ancestor_depth`
- `no_text_content_in_units`
- `text_empty_unit_proportion`
- `add_to_cart_present`
- `high_external_link_density`
- `external_link_proportion`
- `external_link_count`
- `total_link_count`
- `star_rating_present`
- `star_rating_no_text`
- `table_row_structure`
- `is_table_or_tbody`
- `has_tr_children`
- `external_link_density_low`
- `external_link_proportion_low`

Why:

- these help separate real UGC from navigation, commerce modules, empty shells, or tabular content

## 2. Page Model Features To Use Now

The page model should use candidate-level aggregates plus a small set of page-global HTML features.

### Candidate aggregates

Use:

- number of candidates found
- top-1 candidate probability
- top-2 and top-3 candidate probabilities
- margin between top-1 and top-2 probabilities
- max, mean, and median of candidate probabilities
- count of candidates above thresholds like `0.5`, `0.7`, and `0.9`
- top candidate structural features
- top candidate semantic features

### Page-global HTML features

Use:

- `og_type`
- `og_type_is_article`
- `og_type_is_profile`
- `og_type_article_or_profile`
- `schema_org_in_head_json_ld`
- `json_ld_has_comment_type`
- `json_ld_has_comment_action`
- `json_ld_has_interaction_counter`
- `interaction_counter_schema`
- `framework_react`
- `framework_vue`
- `framework_angular`
- `framework_svelte`
- `framework_next`
- `framework_nuxt`
- `html_lang`
- `meta_charset`
- `preload_avatar_image`
- `preload_avatar_count`
- `csrf_token_in_form`
- `html_contains_comment_route`

Why:

- these page-global features are more useful for deciding whether the page likely has a UGC section somewhere than for ranking a specific candidate subgraph

## 3. Keep As Metadata, Not As Model Input

These should still be stored because they help screenshotting, labeling, and debugging.

Keep, but do not train on them initially:

- `xpath`
- `css_path`
- `wildcard_xpath_template`
- `sample_text`
- `sample_texts`
- `avatar_img_src_samples`
- `submit_button_labels`
- `pagination_load_more_text`
- `char_counter_text`
- `_extracted_at`

Use cases:

- candidate screenshot targeting
- reviewer context
- debugging model mistakes
- hard-negative mining

## 4. Exclude For Now

These are either out of scope, too leaky, or too template-specific for the first pass.

### A. Security and response-header features

Exclude:

- `response_has_csp_header`
- `response_csp_has_script_src`
- `response_csp_allows_unsafe_inline`
- `response_csp_allows_unsafe_eval`

Reason:

- this note is explicitly not about security/intervention detection

### B. Current heuristic output fields

Exclude:

- `score`
- `detected`
- `confidence`
- `ugc_type`
- `matched_signals`
- `penalty_signals`

Reason:

- these are outputs of the existing rules/scorer and would leak the current system into the training labels

### C. High-cardinality raw structure IDs

Exclude initially:

- `sig_id`
- `repeating_group_sig_id`
- `structural_signature`
- `sigpath`
- `node_id`

Reason:

- these are likely to overfit on site templates
- they may become useful later only if we hash or otherwise regularize them carefully

### D. Raw token list fields

Do not use raw in v1:

- `classes`
- `data_attributes`
- `aria_attributes`
- `keyword_container_raw`
- `tag_name`
- `role_attribute`
- `shadow_dom_mode`
- `_root_tag`

Reason:

- use their derived booleans and counts first
- raw tokenization can be added later as a controlled experiment

## How The Candidate Screenshot Labeling Loop Should Work

The candidate model is valuable even before it is strong, because it tells us where to look.

Recommended loop:

1. Run candidate discovery on the page.
2. Keep the top `3` to `5` candidate subgraphs.
3. For each candidate, capture:
   - bounding-box screenshot crop
   - `xpath`
   - `css_path`
   - feature vector
   - candidate rank
4. Human label each screenshot:
   - `true UGC/comment region`
   - `not the right region`
   - optional subtype later
5. Feed those labels back into the candidate training table.

This gives us:

- explicit positive regions
- strong hard negatives
- much better data for ranking models

## Which Algorithms We Should Consider

## Candidate model shortlist

### 1. Logistic regression

Best starting point.

Why:

- easy to train
- easy to run in the browser
- easy to interpret
- stable on small and medium datasets
- works well with the current hand-engineered feature space

Use case:

- first production baseline for candidate scoring

### 2. Gradient-boosted trees

Main non-linear candidate once we have more labels.

Candidates:

- LightGBM
- XGBoost
- CatBoost

Why:

- handles nonlinear interactions between DOM features
- often strong on mixed boolean/count data
- likely better than linear models once the labeled set is large enough

Use case:

- second-stage benchmark after we have a cleaner reviewed dataset

### 3. Linear SVM

Good benchmark against logistic regression.

Why:

- often strong on sparse engineered features
- simple

Tradeoff:

- less convenient for calibrated probabilities unless we add calibration

### 4. Random forest

Useful as a benchmark, probably not the final model.

Why:

- simple to try
- can reveal nonlinear gains quickly

Tradeoff:

- heavier
- less compact for browser deployment
- often less strong than boosted trees

### 5. Learning-to-rank model

This becomes very attractive once we have explicit candidate labels.

Candidates:

- LambdaMART
- XGBoost ranker
- pairwise ranking on candidate pairs from the same page

Why:

- the subgraph problem is naturally a ranking problem
- we care about the correct region being near the top of the candidate list

Use case:

- after enough screenshot-labeled candidate data exists

## Page model shortlist

### 1. Threshold over top candidate probability

Simplest baseline.

Use:

- if `max(candidate_probability)` is high enough, page is positive

### 2. Logistic regression over candidate aggregates

Best first learned page model.

Input:

- top candidate probabilities
- candidate count
- page-global HTML signals

### 3. Gradient-boosted trees over candidate aggregates

Try later if page-level errors show nonlinear interactions.

## Algorithms I Would Not Prioritize Yet

Do not start with:

- deep neural nets over raw DOM
- graph neural networks over the DOM tree
- LLM-style models over serialized HTML

Reason:

- more complexity than we need
- harder to deploy inside the extension
- not justified while the dataset is still small and the current feature extractor is already rich

## Evaluation

We should evaluate both tasks separately.

### Candidate-model metrics

Use:

- top-1 accuracy
- recall@3
- precision / recall / F1
- PR-AUC

### Page-model metrics

Use:

- precision / recall / F1
- PR-AUC
- false-positive rate on clearly non-UGC pages

### Split rule

Always split by domain or eTLD+1, not random rows.

Reason:

- otherwise the model learns site templates instead of transferable structure

## Immediate Practical Recommendation

If we started implementation from this note, the path should be:

1. Build the candidate-level dataset first.
2. Train logistic regression on the selected candidate features.
3. Rank candidates by probability.
4. Screenshot the top candidate regions.
5. Human-label those screenshots.
6. Feed the reviewed labels back into the candidate dataset.
7. Build the page model on top of candidate probabilities and page-global HTML features.
8. Benchmark gradient-boosted trees later.

## Current Decision Summary

For now:

- ignore reCAPTCHA/security entirely
- use only extraction-time features from HTML and pseudo DOM
- focus first on candidate-region ranking, because that gives us both detection and screenshot-based labeling
- start with logistic regression
- keep boosted trees and ranking models as the next serious experiments

## Update Notes

Initial version added on `2026-03-27`.
