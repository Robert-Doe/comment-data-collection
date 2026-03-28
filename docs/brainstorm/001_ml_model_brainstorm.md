# ML Model Brainstorm For Browser Extension

This is a living note for the ML direction behind the browser-extension/CDP phase. I will keep updating it as we refine assumptions, answer open questions, and decide what should stay heuristic versus what should become learned.

## Objective

We want a model pipeline that can help the extension decide:

1. Does this page likely contain a comment-like UGC region at all?
2. Which DOM region is the most likely comment container?
3. Is a security/access intervention needed before extraction can succeed?

The current repo already gives us most of the raw material for this.

## What We Already Have

### Existing feature extractor

`src/commentFeatures.js` already extracts a large hand-engineered feature set for each candidate DOM root.

Current shape:

- roughly `229` fields on the sample `best_candidate`
- mostly booleans, counts, ratios, and a small number of string/list fields
- signal families already include:
  - structural repetition and sibling homogeneity
  - author/avatar/timestamp/reply/reaction patterns
  - keyword and accessibility metadata
  - raw HTML and response-header hints
  - anti-patterns like `add_to_cart_present`, `table_row_structure`, and high external-link density
  - access/interstitial detection from the page scan layer

### Existing stored outputs

The scanner/store layer already persists:

- page-level outcome: `ugc_detected`
- top candidate: `best_candidate`
- full candidate list: `candidates`
- access state: `blocked_by_interstitial`, `blocker_type`, `access_reason`
- manual-review state: `manual_capture_required`, `manual_capture_reason`
- manual snapshot re-analysis: `analysis_source = manual_snapshot`

Relevant files:

- `src/shared/scanner.js`
- `src/shared/store.js`

### Existing labels and historical data

What I found in the repo:

- `fixtures/sample-sites-labeled.csv`
  - `79` rows total
  - about `20` rows with at least one positive marker in the current manual feature columns
- `output/local-dev-state.json`
  - `405` historical item rows across multiple repeated jobs
  - `92` detected positive runs
  - `246` blocked/interstitial runs
  - `182` rows flagged as needing manual capture
  - this file is useful for schema inspection, but not clean training data because it contains duplicates across reruns

## First Important Conclusion

We should not frame this as one monolithic model yet.

The repo naturally supports a three-part pipeline:

1. `security_or_access_intervention_needed`
2. `candidate_is_comment_region`
3. `page_contains_comments`

That decomposition matches the data already collected and will be easier to train, debug, and deploy in the extension.

## Recommended Label Design

### Task A: Security/Access intervention

Binary label:

- `1`: extraction is blocked or likely blocked without extra action
- `0`: page is accessible enough for normal extraction

Positive examples should include:

- Cloudflare / CAPTCHA / human verification
- login walls or membership walls if they prevent reaching comments
- pages where manual interaction is required before comments appear

This label is partly available already from:

- `blocked_by_interstitial`
- `blocker_type`
- `manual_capture_required`
- `manual_capture_reason`

### Task B: Candidate region classification

Binary label per candidate DOM root:

- `1`: this candidate is the true comment/review/reply/discussion container
- `0`: this candidate is not the right region

This is the most important model for browser inference.

Important caveat:

- the repo currently stores candidate features, but not a fully explicit human label for which candidate is correct
- we can bootstrap from `best_candidate` on obvious true positives, but real training quality improves a lot once we add reviewer confirmation for the correct candidate root

### Task C: Page-level page-has-comments decision

Binary label:

- `1`: the page contains a usable comment-like UGC area
- `0`: it does not

This is the main user-facing decision the extension will expose.

This label can be derived from:

- confirmed manual labeling
- final `ugc_detected` after manual snapshot review
- a curated truth table from the site list

## How To Aggregate The Data We Already Extract

We should create two training tables, not one.

### 1. `page_training_rows`

One row per unique normalized URL or final URL.

Suggested fields:

- page identifiers:
  - `normalized_url`
  - `final_url`
  - `domain`
  - `job_id`
  - `analysis_source`
- page labels:
  - `label_page_contains_comments`
  - `label_security_intervention_needed`
- page status:
  - `blocked_by_interstitial`
  - `blocker_type`
  - `manual_capture_required`
  - `manual_capture_reason`
- page-level aggregates over candidates:
  - `candidate_count`
  - `max_candidate_score`
  - `max_candidate_probability` later
  - `mean_top3_score`
  - `top1_ugc_type`
  - `top1_confidence`
  - count of candidates over score thresholds
- top candidate features copied in with a prefix:
  - `top1_reply_button_per_unit`
  - `top1_author_timestamp_colocated`
  - `top1_has_relative_time`
  - etc.

This table supports the final page decision model.

### 2. `candidate_training_rows`

One row per candidate DOM root.

Suggested fields:

- identifiers:
  - `normalized_url`
  - `domain`
  - `candidate_rank`
  - `xpath`
  - `css_path`
  - `analysis_source`
- labels:
  - `label_candidate_is_comment_region`
  - inherited page label if needed for weak supervision
- features:
  - most boolean/count/ratio features from `candidates[*]`

This table supports the region classifier.

### Deduplication rule

For modeling, do not treat every rerun as a new independent example.

Recommended policy:

- dedupe by `normalized_url` or canonicalized `final_url`
- keep the most reliable record in this order:
  1. `manual_snapshot`
  2. automated run with clear non-blocked result
  3. blocked/interstitial run

Otherwise we will overfit to whichever sites were scanned many times.

## Feature Strategy

### Features to keep first

These are good initial ML inputs:

- booleans
- counts
- ratios
- small categorical values

Examples:

- `repeating_group_count`
- `sibling_homogeneity_score`
- `comment_header_with_count`
- `reply_button_unit_coverage`
- `author_avatar_coverage`
- `profile_link_coverage`
- `time_datetime_per_unit`
- `reply_nesting_depth`
- `aria_role_feed`
- `schema_org_comment_itemtype`
- `blocked_by_interstitial`
- `blocker_type`

### Features to transform carefully

These can still be useful, but not as raw one-hot explosions:

- `tag_name`
- `role_attribute`
- `og_type`
- `html_lang`
- `meta_charset`
- class and attribute token lists
- structural signatures

For those, the safest first pass is:

- token hashing
- curated keyword buckets
- or dropping the raw value and keeping only derived booleans/counts

### Features to avoid in the first model

These are high-leakage or too site-specific:

- `xpath`
- `css_path`
- `node_id`
- `sigpath`
- raw avatar URLs
- raw sample text

Those features will overfit to individual sites or leak too much template-specific information.

## Which Model Is Most Suitable Right Now

### Current recommendation

Start with:

1. Rules or a tiny linear model for `security_or_access_intervention_needed`
2. A regularized logistic regression for `candidate_is_comment_region`
3. A simple page-level aggregator using:
   - `max(candidate_probability)`
   - candidate count
   - access/interstitial flags
   - a second logistic regression or a threshold rule

### Why logistic regression first

This is the best fit for the current stage because:

- the current feature set is already hand-engineered and semantically meaningful
- we do not yet have a large, clean labeled dataset
- the model needs to run cheaply inside a browser extension
- it is easy to serialize as plain JSON weights
- it is easy to explain why a decision was made
- it will likely generalize better than a tree ensemble on a tiny, noisy dataset

### When to move to a tree model

Once we have a larger reviewed dataset, try:

- LightGBM
- XGBoost
- CatBoost

I would only switch after we have at least several hundred, and preferably more than `1000`, domain-diverse labeled pages and explicit candidate-region labels.

Why tree models may win later:

- mixed boolean/count features
- nonlinear interactions like:
  - reply buttons + repeated structure + timestamps
  - review stars + no text + add-to-cart penalties
  - blocked page + weak candidate structure

### Why I do not recommend a deep model first

Not yet:

- too little clean supervision
- higher browser deployment cost
- harder to debug
- not clearly necessary because the current features are already strong and structured

## Security Intervention Decision

This is probably the least ML-heavy part of the system.

Right now, a rules-first approach is justified because the scanner already exposes very high-signal blockers:

- `blocker_type = cloudflare`
- `blocker_type = captcha`
- `blocker_type = login_wall`
- `manual_capture_required = true`

So the likely policy is:

- keep deterministic intervention rules first
- add a small classifier later only for borderline cases where the page is not explicitly blocked but the extraction still systematically fails

In other words: security/access intervention should probably remain mostly heuristic until we see a real false-negative pattern that rules cannot cover.

## Browser Extension Runtime Shape

The extension/CDP flow can be split into two phases.

### Phase 1: Raw response / pre-parse signals

Available if CDP captures response body and headers:

- response headers
- raw HTML
- framework fingerprints
- metadata hints
- obvious challenge text

This phase is best for:

- early intervention detection
- cheap page prefiltering

### Phase 2: DOM/candidate signals

After `DOMContentLoaded` or a short settle delay:

- discover candidate roots
- extract current comment features
- score each candidate
- aggregate to page-level decision

This phase is best for:

- comment-region classification
- final page-positive decision

## Proposed Decision Policy In The Extension

Short version:

1. Run intervention checks first.
2. If blocked strongly, return `needs_intervention`.
3. Otherwise extract top `K` candidate roots.
4. Score each candidate with the candidate model.
5. Aggregate candidate probabilities to a page-level probability.
6. Return:
   - `comment_likely`
   - `comment_unlikely`
   - `needs_intervention`
   - optionally `uncertain`

Recommended first thresholds:

- high precision threshold for automatic positive
- lower threshold for manual review / uncertain
- explicit override when access blockers are present

## Evaluation Plan

We should evaluate by site/domain group, not by random row split.

Required split rule:

- group split by domain or eTLD+1

Otherwise we will leak site template structure from train to test.

Metrics to track:

- page-level precision / recall / F1
- candidate top-1 accuracy
- PR-AUC for page decision
- false-positive rate on non-comment pages
- recall on blocked pages after intervention
- recall by content family:
  - article comments
  - product reviews
  - forums
  - social threads
  - Q&A answers

## Minimum Viable Training Plan

Phase 0:

- export clean page-level and candidate-level datasets from stored scan results
- dedupe reruns
- define final labels clearly

Phase 1:

- train logistic regression on boolean/count features only
- exclude site-specific paths and raw text
- compare against the current hand-scored heuristic

Phase 2:

- add reviewer-confirmed candidate labels
- calibrate thresholds for extension behavior
- decide if the page-level aggregator needs its own learned model

Phase 3:

- once label volume is high enough, benchmark LightGBM against logistic regression

## What I Think The Repo Is Missing For Good Training

These are the biggest gaps:

1. A clean exported dataset builder.
2. Explicit labels for the correct candidate DOM root.
3. A final truth label for `page_contains_comments` that is not just the model output itself.
4. A precise definition of what counts as a positive page.
5. A precise definition of when something is a security intervention versus a general access obstacle.

## Questions To Resolve Next

1. Does `positive` mean any UGC region, or specifically a comment/reply section attached to primary content?
2. Should product reviews, forum threads, Q&A answers, and social post replies all map to the same positive class, or do we want separate classes?
3. Should login walls count as `security intervention needed`, or do you want that label reserved for CAPTCHA / anti-bot style blockers only?
4. Do we want the extension decision to optimize for high precision or high recall?
5. Are we comfortable using text-derived statistics only, or do we want to include limited lexical token features too?
6. Do we want purely local inference in the extension, or is a server-side fallback acceptable for uncertain cases?
7. Are we willing to add a lightweight reviewer label step for the correct DOM candidate path? That would improve the model a lot.

## Current Working Recommendation

If we started implementation now, I would do this:

- keep the current heuristic scorer as the baseline
- build a dataset export from `best_candidate`, `candidates`, and `scan_result`
- train a logistic regression candidate classifier
- use rule-based intervention detection at first
- aggregate candidate probabilities into a page decision
- only consider boosted trees after we collect a much larger, cleaner labeled set

## Update Notes

Initial notes added on `2026-03-27`.

Next useful update would be:

- locking the label definitions
- deciding whether reviews/forum/Q&A all count as the same class
- deciding whether we want candidate-level human labels
