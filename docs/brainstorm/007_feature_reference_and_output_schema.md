# Feature Reference And Output Schema

Date:

- `2026-03-28`

This is the current active brainstorm note.

## Why this note exists

This project now has enough moving parts that the stored outputs need a reference.

The human labels are the gold standard.

That means:

1. automated detections are useful for triage
2. candidate screenshots are useful for fast review
3. human candidate labels should be treated as the high-trust data for future training and evaluation

## Main storage levels

The system stores data at several levels.

### 1. Job level

A job is one uploaded CSV run.

Typical job fields:

- `id`: job identifier
- `source_filename`: uploaded CSV file name
- `source_column`: the URL column used
- `status`: `pending`, `queued`, `running`, `completed`, `completed_with_errors`, or `failed`
- `total_urls`
- `pending_count`
- `queued_count`
- `running_count`
- `completed_count`
- `failed_count`
- `detected_count`
- `created_at`
- `updated_at`
- `finished_at`

### 2. Item level

An item is one row/page inside a job.

Important item fields:

- `id`
- `job_id`
- `row_number`
- `input_url`
- `normalized_url`
- `status`
- `title`
- `final_url`
- `ugc_detected`
- `best_score`
- `best_confidence`
- `best_ugc_type`
- `best_xpath`
- `best_css_path`
- `best_sample_text`
- `screenshot_path`
- `screenshot_url`
- `analysis_source`
- `manual_capture_required`
- `manual_capture_reason`
- `manual_capture_mode`
- `manual_html_path`
- `manual_html_url`
- `manual_raw_html_path`
- `manual_raw_html_url`
- `manual_capture_url`
- `manual_capture_title`
- `manual_capture_notes`
- `manual_captured_at`
- `candidate_reviews`
- `best_candidate`
- `candidates`
- `scan_result`
- `error_message`

## What the major item fields mean

- `ugc_detected`: page-level decision based on the best candidate
- `best_*`: summary fields copied from the top-ranked candidate
- `analysis_source`: usually `automated` or `manual_snapshot`
- `manual_capture_required`: whether the automated scan thinks a human-assisted capture is needed
- `best_candidate`: the single top candidate object
- `candidates`: the kept candidate objects for review
- `candidate_reviews`: human labels attached to specific candidate keys
- `scan_result`: the richer raw analysis payload

## What is inside `scan_result`

`scan_result` is the main JSON payload returned by scanning.

Common fields:

- `input_url`
- `normalized_url`
- `final_url`
- `title`
- `ugc_detected`
- `best_candidate`
- `candidates`
- `error`
- `blocked_by_interstitial`
- `blocker_type`
- `access_reason`
- `page_text_sample`
- `frame_count`
- `screenshot_path`
- `screenshot_url`
- `screenshot_error`
- `analysis_source`
- `manual_capture_required`
- `manual_capture_reason`
- manual-capture artifact fields when applicable

## What is inside each candidate object

Each candidate is a flattened feature vector plus review metadata.

Important candidate groups:

- locator metadata
- structural features
- semantic keyword features
- author/time/reply/composer features
- negative-control features
- scoring outputs
- screenshot metadata
- human review metadata

### Candidate locator fields

- `xpath`
- `css_path`
- `wildcard_xpath_template`
- `node_id`
- `structural_signature`
- `sig_id`
- `sigpath`
- `frame_url`
- `frame_name`
- `frame_key`
- `frame_is_main`
- `candidate_key`
- `candidate_rank`

### Candidate content summary fields

- `unit_count`
- `sample_texts`
- `sample_text`

### Candidate scoring fields

- `score`
- `detected`
- `confidence`
- `ugc_type`
- `matched_signals`
- `penalty_signals`

### Candidate screenshot fields

- `candidate_screenshot_path`
- `candidate_screenshot_url`
- `candidate_screenshot_error`

### Candidate human-review fields

These are overlaid when the UI materializes an item:

- `human_label`
- `human_notes`
- `human_reviewed_at`
- `human_review_source`

## Human review labels

Current candidate labels are:

- `comment_region`
- `not_comment_region`
- `uncertain`

These are stored in `candidate_reviews`.

Each review record contains:

- `candidate_key`
- `label`
- `notes`
- `xpath`
- `css_path`
- `candidate_rank`
- `source`
- `created_at`
- `updated_at`

## Where the outputs are visible

### Local file-backed state

The main local runtime file is:

- `output/local-dev-state.json`

That file contains:

- `jobs`
- `items`

### API JSON

The UI uses:

- `GET /api/jobs`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/results`

These JSON responses are the best place to inspect full candidate objects.

### CSV export

The downloadable CSV is a summary, not the full feature dump.

Current CSV columns:

- `row_number`
- `input_url`
- `normalized_url`
- `final_url`
- `title`
- `status`
- `ugc_detected`
- `confidence`
- `ugc_type`
- `score`
- `xpath`
- `css_path`
- `sample_text`
- `candidate_count`
- `candidate_review_count`
- `candidate_comment_region_reviews`
- `candidate_not_comment_reviews`
- `candidate_uncertain_reviews`
- `analysis_source`
- `manual_capture_required`
- `manual_capture_reason`
- `manual_capture_mode`
- `manual_html_url`
- `manual_raw_html_url`
- `manual_capture_url`
- `screenshot_url`
- `screenshot_path`
- `error_message`

## Important distinction between JSON and CSV

The CSV does not contain the full per-candidate feature vector.

The JSON does.

So:

- use CSV for quick auditing and spreadsheet summaries
- use JSON for model-training exports, feature inspection, and debugging

## Feature families in the current extractor

The extractor in `src/commentFeatures.js` is feature-family based.

Each `feat_*` function emits one or more raw fields.

Below is the current feature-family inventory and its intent.

### Structural identity and tree position

- `feat_tag_name`: root tag identity
- `feat_classes`: root class list and count
- `feat_attributes_data_aria_role`: `data-*`, `aria-*`, and `role` metadata
- `feat_depth`: DOM depth of the candidate root
- `feat_xpath`: exact XPath locator
- `feat_css_path`: CSS locator
- `feat_shadow_dom_metadata`: shadow-host presence and shadow metadata
- `feat_parent_index`: sibling position inside the parent
- `feat_structural_signature`: local structural signature and `sig_id`
- `feat_sigpath`: ancestor signature chain
- `feat_node_id`: stable-ish node identifier

### Repetition, wildcard XPath, and sibling similarity

- `feat_repeating_group_count`: dominant repeated child-group statistics
- `feat_min_k_threshold_pass`: repeated-unit threshold passes like `>=3`, `>=5`, `>=8`, `>=15`
- `feat_wildcard_xpath_template`: wildcard XPath template for dominant repeated children
- `feat_internal_depth_filter`: subtree depth suitability
- `feat_sig_id_count_graduated`: graduated repeated-signature strength
- `feat_sibling_homogeneity_score`: how uniform the sibling units are
- `feat_sig_id_recursive_nesting`: nested repeated structures, useful for threaded replies
- `feat_reply_nesting_depth`: estimated nesting depth of reply structure
- `feat_indent_margin_pattern`: indentation-like layout cues
- `feat_thread_depth_indicator`: explicit depth or level indicators

### Text and content statistics

- `feat_text_statistics`: word/char/sentence counts and average word length
- `feat_has_text_content`: whether the candidate has substantial text
- `feat_text_contains_links`: link presence
- `feat_link_density`: link-heavy versus text-heavy region
- `feat_text_contains_mentions_or_hashtags`: `@mentions` and `#hashtags`
- `feat_text_contains_emoji`: emoji signal
- `feat_text_question_mark_count`: question and exclamation counts
- `feat_no_text_content_in_units`: repeated structure with little meaningful text
- `feat_quote_block_per_unit`: quoted-text behavior inside units
- `feat_read_more_truncation`: truncated/comment-expansion style text

### Keyword and semantic cues

- `feat_comment_header_with_count`: nearby header like `34 comments`
- `feat_attributes_contain_keywords`: comment/reply/review/forum keywords in attributes, tag names, or short direct text
- `feat_keyword_in_attributes`: higher-granularity keyword signals for attribute names, values, and direct text
- `feat_comment_route_in_scripts`: comment-related script or route hints in raw HTML
- `feat_json_ld_comment`: comment/review hints in JSON-LD
- `feat_schema_org_comment`: schema.org `Comment` / `Review` signals
- `feat_microdata_comment_props`: comment-like microdata properties
- `feat_aria_role_feed`: feed/article semantics
- `feat_interaction_counter_schema`: schema fragments mentioning comment interactions

### Author, avatar, and profile signals

- `feat_includes_author`: author-like identity markers
- `feat_has_avatar`: avatar/profile-image evidence
- `feat_author_avatar_colocation`: author and avatar appearing together in units
- `feat_user_profile_link_per_unit`: profile-link coverage
- `feat_author_timestamp_colocated`: author and time appearing together
- `feat_verification_badge`: verified/badge indicators

### Time and chronology signals

- `feat_has_relative_time`: `5m`, `7mo`, `2 days ago`, absolute dates, and timestamp attributes
- `feat_has_edit_history`: edited/update markers
- `feat_pinned_post_indicator`: pinned or sticky content markers
- `feat_deleted_placeholder`: deleted/removed placeholder markers

### Composer, reply, and action controls

- `feat_ui_hints`: interactive element counts, forms, contenteditable usage
- `feat_has_action_buttons`: action button density
- `feat_has_more_options_button`: overflow or more-options controls
- `feat_reply_button_per_unit`: reply/replies behavior across repeated units
- `feat_textarea_tree_proximity`: nearby textarea or composer alignment
- `feat_char_counter_near_textarea`: composer counter cues
- `feat_submit_button_label`: submit/post/comment/reply button cues
- `feat_collapse_expand_control`: show more / expand / collapse patterns
- `feat_pagination_load_more`: pagination or load-more behavior

### Social interaction and engagement signals

- `feat_reaction_count_per_unit`: reactions/likes counts per unit
- `feat_edit_delete_per_unit`: edit/delete/report controls
- `feat_share_button_per_unit`: share behavior per repeated unit
- `feat_like_count_pattern`: like/upvote counters with count-shaped text
- `feat_permalink_per_unit`: stable per-unit links
- `feat_upvote_downvote_pair`: forum/Q&A vote affordances

### Raw HTML / page metadata signals

- `feat_response_csp`: response header CSP presence
- `feat_meta_charset`: HTML charset metadata
- `feat_og_type`: Open Graph type
- `feat_framework_fingerprint`: framework hints in HTML
- `feat_html_lang`: page language metadata
- `feat_preload_avatar`: avatar-like preload hints
- `feat_csrf_token_in_form`: form-token presence

### Negative controls and false-positive suppression

- `feat_price_currency_in_unit`: product/listing price signals
- `feat_nav_header_ancestor`: navigation/header ancestry
- `feat_add_to_cart_present`: commerce CTA signals
- `feat_high_external_link_density`: overly directory-like or navigation-like external linking
- `feat_external_link_density_low`: low external link density, often helpful for comments
- `feat_star_rating_no_text`: review-star blocks without real text
- `feat_table_row_structure`: tabular rows instead of comment units
- `feat_spoiler_tag`: spoiler/content-warning style signals

## Scoring interpretation

The final score is still heuristic.

That means:

- `score` is a ranking signal
- `detected` is a thresholded decision
- `matched_signals` explain why the candidate was boosted
- `penalty_signals` explain why it was suppressed

For training and later ML work:

- the raw feature fields matter more than the heuristic `score`
- the human label matters more than the heuristic `detected`

## What should be treated as training labels versus helper metadata

Gold-standard labels:

- page-level human judgments when you have them
- candidate-level `comment_region`
- candidate-level `not_comment_region`
- candidate-level `uncertain` as a holdout or ambiguity bucket

Useful metadata but not a gold label:

- `score`
- `confidence`
- `detected`
- `ugc_type`
- `matched_signals`
- `penalty_signals`
- `access_reason`

## Practical recommendation for dataset export

The strongest future dataset split is:

1. page table
2. candidate table
3. candidate review table

The candidate table should become the main ML training source because:

- it has the actual feature vector
- it has the DOM subgraph locator
- it can be paired with candidate screenshots
- it can be human-labeled directly

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
