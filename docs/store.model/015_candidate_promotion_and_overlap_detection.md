# Candidate Promotion And Overlap Detection

Date: `2026-04-14`

This note explains the exact path from DOM extraction to candidate promotion.
It is written for two goals:

- make the current scanner easy to explain to a supervisor
- separate the current multi-signal mode from a future repetition-only research mode

The most important point is this:

- a node is not promoted by repetition alone
- the scanner first finds a plausible container, then checks repeated child structure, then scores the container, then removes overlaps, then aggregates across frames

## 1. What The Code Is Actually Deciding

There are two different outputs that people often mix together:

- `candidate root`
- `detected` candidate

A `candidate root` is a DOM subtree selected for review.

`detected` means the full heuristic score and acceptance gate said the root looks like UGC.

So a node can be:

- a candidate root but not detected
- detected and kept as the best candidate
- rejected before it ever becomes a candidate root

## 2. The Real Promotion Pipeline

### Stage 1 - Scan each frame

`collectCandidatesFromPage()` scans the main frame and then each child frame.
`extractCandidatesFromFrame()` runs the extraction inside that frame.

Important consequence:

- the candidate logic runs per frame
- frames are merged later
- an iframe can contribute its own candidate roots

### Stage 2 - Inspect each DOM node

Inside the frame, the extractor walks broad container-like tags and attribute-bearing nodes.

The scan is not "find every element that repeats".
It is "find elements that look like plausible content containers".

### Stage 3 - Build the repeated child family

For each node, the code looks at its **direct children**.

It groups those children by:

- `sigId`, which is a structural fingerprint
- `xpathStar`, which is a wildcard path shape

The biggest matching group becomes the node's dominant repeated family.

That dominant family is where `min_k`, repetition count, and homogeneity come from.

### Stage 4 - Apply the container gate

`looksLikeContainer()` is the first hard filter.

It can accept a node in several ways:

- explicit role or microdata, such as `role="feed"`, `role="comment"`, or `itemtype` mentioning `Comment` or `Review`
- semantic UGC keywords plus enough text
- strong repeated structure plus a small amount of text
- weaker repeated structure plus more text

The current repetition-based acceptance thresholds are:

- repeated family count at least 4 and homogeneity at least 0.75, with text length at least 20
- repeated family count at least 3 and homogeneity at least 0.5, with text length at least 80
- direct child count at least 4 and homogeneity at least 0.75, with text length at least 160

So the answer to "what is the minimum number of similar children?" is:

- `3` is the earliest repetition count that can matter
- `4` is the most permissive strong-repetition path without needing semantic keywords
- `1` alone is not enough unless the node has a semantic role or microdata cue

### Stage 5 - Apply the quick score

`quickCandidateScore()` gives a cheap score to the same node.

It rewards things like:

- comment/review/feed roles or itemtypes
- UGC keywords in attributes
- repeated child families
- homogeneity
- media, links, timestamps, textarea, or contenteditable presence
- long text

If the quick score is below `3`, the node is dropped.

This means the candidate root is not chosen by repetition alone.
Repetition helps the node survive the prefilter, but it is not the only gate.

### Stage 6 - Sort and remove overlaps

`discoverCandidateRoots()` sorts nodes by:

- higher quick score
- then more repeated children
- then more text

Then it removes ancestor/descendant overlaps using XPath ancestry.

This is the key overlap rule:

- if a child candidate sits inside a parent candidate, the code keeps only one of them in the selected root list
- whichever one ranks first survives
- the other is dropped as overlapping

So if a nested reply thread exists inside a larger comment wrapper, the inner thread may be removed if the outer wrapper ranks higher.

If the inner thread ranks higher, the outer wrapper can be removed instead.

The code does **not** preserve both by default.

### Stage 7 - Extract full features from the surviving roots

`extractCandidateRegions()` only computes the full feature set for the roots that survived the overlap filter.

This is where the scanner looks at:

- semantic markup
- author and avatar cues
- timestamps
- reply and thread cues
- reaction and vote cues
- link density
- negative product/navigation/table cues
- text density and structural richness

### Stage 8 - Score and decide `detected`

`scoreFeatures()` produces the final heuristic score and labels.

Then the code applies:

- `baseDetected = score >= 12`
- or `schema_org_comment_itemtype` / `aria_role_comment` with `score >= 8`
- then an acceptance gate:
  - strong keyword evidence
  - or medium keyword evidence plus repeated structure and interaction support
  - or a high-assurance override with no keywords, but only when semantic markup, structure, and interaction cues are all unusually strong

The exact gate is stricter than the root-selection step.

That final decision changes `detected`, but the root itself was already chosen earlier.

### Stage 9 - Merge candidates across frames

`collectCandidatesFromPage()` merges the frame results, sorts them again, dedupes them, and caps the final list.

That means the final output is the result of both:

- per-frame root selection
- page-level aggregation and dedupe

## 3. What "Homogeneity" Means Here

Homogeneity is the fraction of direct children that belong to the dominant repeated family.

Example:

- 10 direct children total
- 7 of them share the same structure

Then homogeneity is about `0.7`.

This is not text similarity.
It is structural concentration.

## 4. Minimum Repetition Rules In Plain English

If you want the shortest accurate answer, it is this:

- one item by itself is not enough for repetition-based promotion
- three similar direct children is the earliest useful repetition count
- four similar direct children with high homogeneity is the strongest low-text path
- the node still needs to survive the quick score and overlap pruning

So `MIN_K` is not a single universal cutoff.
It is part of a larger container-selection process.

The extractor also exposes these repetition flags:

- `min_k_threshold_pass_3`
- `min_k_threshold_pass_5`
- `min_k_threshold_pass_8`
- `min_k_threshold_pass_15`

Those are feature flags, not the final candidate decision by themselves.

## 5. What Happens To Nested Reply Threads

This is the overlap problem you mentioned.

If a reply thread is nested inside a larger thread or comment wrapper:

- the inner reply block can be found
- the outer wrapper can also be found
- but the final selected root list will usually keep only one of them

That is intentional duplicate suppression.

It is good for avoiding repeated review items.
It is bad if your study wants both the parent wrapper and the nested reply block as separate review targets.

If your research requires both, overlap removal has to become a configurable policy, not a hard rule.

## 6. What A Single Item Without Keywords Means

A single item without keyword cues is usually not enough.

It can still be selected if it has explicit semantic cues like:

- `role="comment"`
- `role="feed"`
- `itemtype` containing `Comment` or `Review`

But if it has:

- no semantic role
- no microdata
- no meaningful repeated siblings

then it does not become a candidate root.

## 7. Why A Repetition-Only Mode Matters

If you add a second scanner mode for research, the clean distinction is:

- Mode A: current multi-signal scanner
- Mode B: repetition-first scanner

For a fair comparison, do not only change the final score.
You need to change the prefilter that decides candidate roots.

Otherwise, the final candidate count may stay close to the current count even if the score changes.

For research reporting, it is useful to measure all of these separately:

- roots before overlap pruning
- roots after overlap pruning
- roots with `detected = true`
- final page-level candidates

## 8. Signals Used By The Current Full Score

These are the feature families currently read by `scoreFeatures()`:

- semantic and markup cues
  - `schema_org_comment_itemtype`
  - `aria_role_comment`
  - `aria_role_feed_with_articles`
  - `microdata_itemprop_author`
  - `microdata_itemprop_date_published`
  - `microdata_itemprop_text`
  - `json_ld_has_comment_type`
  - `json_ld_has_comment_action`
  - `comment_header_with_count`
  - `attributes_contain_keywords`
  - `keyword_container_high`
  - `keyword_text_high`
  - `submit_button_keyword_high`
  - `keyword_unit_high_coverage`

- structural repetition and shape
  - `repeating_group_count`
  - `sig_id_count_weak`
  - `sig_id_count_medium`
  - `sig_id_count_strong`
  - `sibling_homogeneity_score`
  - `depth_and_variety_pass`
  - `sig_id_recursive_nesting`
  - `reply_nesting_depth`
  - `repeating_link_collection`

- author, time, and interaction cues
  - `time_datetime_per_unit`
  - `author_avatar_coverage`
  - `author_timestamp_colocated`
  - `reply_button_unit_coverage`
  - `report_flag_unit_coverage`
  - `profile_link_coverage`
  - `reaction_coverage`
  - `edit_delete_coverage`
  - `permalink_per_unit`
  - `deleted_placeholder_present`
  - `quote_block_per_unit`
  - `upvote_downvote_pair`
  - `pinned_post_indicator`
  - `collapse_expand_control`
  - `pagination_load_more_adjacent`
  - `has_nearby_textarea`
  - `aligned_with_textarea`
  - `aligned_with_content_editable`
  - `submit_button_present`
  - `char_counter_near_textarea`
  - `has_avatar`
  - `includes_author`
  - `has_relative_time`
  - `external_link_density_low`
  - `has_text_content`
  - `text_contains_links`

- negative signals
  - `table_row_structure`
  - `no_text_content_in_units`
  - `add_to_cart_present`
  - `nav_header_ancestor`
  - `high_external_link_density`
  - `star_rating_no_text`
  - `price_currency_in_unit`
  - `link_density`

- gate-only derived checks
  - `keyword_unit_high`
  - `keyword_tag_name_high`
  - `keyword_text_med`
  - `submit_button_keyword_med`
  - `keyword_container_med`
  - `semanticSupportCount`
  - `structuralSupportCount`
  - `interactionSupportCount`
  - `strongKeywordEvidence`
  - `mediumKeywordAssurance`
  - `highAssuranceWithoutKeywords`
  - `repeatedStructureSupport`

One important gap for your emoji question:

- `feat_text_contains_emoji()` exists
- but the current `scoreFeatures()` logic does not read it

So emoji-heavy comment areas can be underweighted if they have little plain text and no stronger semantic or structural cues.

## 9. Bottom Line

If you need one sentence:

- the scanner promotes a node when it looks like a container, has enough repeated direct-child structure, survives the quick score, survives overlap pruning, and then survives the full heuristic gate

If you need the research version:

- repetition-only mode should change the candidate-root prefilter, not only the final score
