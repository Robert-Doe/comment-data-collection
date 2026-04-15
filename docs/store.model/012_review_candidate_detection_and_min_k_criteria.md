# Review Candidate Detection And Min-K Criteria

Date: `2026-04-14`

This note answers two questions:

- Where does the code that finds review candidates live?
- Is the logic only "repeat with a minimum number of `MIN_K`"?

Short answer:

- The main detector is in `src/commentFeatures.js`.
- The page-level scanner that calls it is in `src/shared/scanner.js`.
- `MIN_K` is not a single accept/reject switch in this repo.
- Repetition is important, but it is only one part of the final decision.

## 1. Code Locations

The main functions to read are:

- `src/commentFeatures.js:663` `feat_repeating_group_count(...)`
- `src/commentFeatures.js:677` `feat_min_k_threshold_pass(...)`
- `src/commentFeatures.js:1177` `feat_sig_id_count_graduated(...)`
- `src/commentFeatures.js:1187` `feat_internal_depth_and_tag_variety(...)`
- `src/commentFeatures.js:1242` `feat_sibling_homogeneity_score(...)`
- `src/commentFeatures.js:1715` `scoreFeatures(...)`
- `src/commentFeatures.js:1961` `looksLikeContainer(...)`
- `src/commentFeatures.js:1989` `quickCandidateScore(...)`
- `src/commentFeatures.js:2017` `discoverCandidateRoots(...)`
- `src/commentFeatures.js:2052` `extractCandidateRegions(...)`
- `src/shared/scanner.js:815` `resolveCandidateLimit(...)`
- `src/shared/scanner.js:873` `collectCandidatesFromPage(...)`
- `src/shared/scanner.js:971` `scanUrl(...)`

If you are looking for the code that decides which DOM nodes become review candidates, start with `src/commentFeatures.js:2017`.

## 2. End-To-End Flow

The path is:

1. `src/shared/scanner.js` loads a page and calls `collectCandidatesFromPage(...)`.
2. `collectCandidatesFromPage(...)` asks `extractCandidatesFromFrame(...)` for candidates in the main frame and child frames.
3. `extractCandidatesFromFrame(...)` calls `extractCandidateRegions(...)` from `src/commentFeatures.js`.
4. `extractCandidateRegions(...)` calls `discoverCandidateRoots(...)`.
5. Each root is expanded into a full feature vector with `extractAllFeatures(...)`.
6. `scoreFeatures(...)` assigns the final heuristic score and detection flags.
7. Results are sorted, deduped, and capped before they are returned to the scanner.

So there are really two stages:

- candidate discovery
- final heuristic scoring

## 3. What A "Repeated Candidate" Actually Means

The repeated-structure signal does not mean "any repeated thing on the page".

The code first finds a dominant repeated child family under a root. That is what
`feat_repeating_group_count(...)` reports.

That family is built from direct children grouped by structural similarity:

- `sigId(child)` for structural signature grouping
- `getXPathStar(child)` for wildcard XPath grouping

The chosen family is the largest repeated child group under the candidate root.

That is why `repeating_group_count` is not just "child count". It is the size of
the dominant repeated unit family.

## 4. The Min-K Metrics

`feat_min_k_threshold_pass(...)` exposes four threshold checks:

- `min_k_threshold_pass_3`
- `min_k_threshold_pass_5`
- `min_k_threshold_pass_8`
- `min_k_threshold_pass_15`

It also returns:

- `min_k_count`

The meaning is simple:

- if the dominant repeated family has at least 3 units, pass the 3 threshold
- if it has at least 5 units, pass the 5 threshold
- if it has at least 8 units, pass the 8 threshold
- if it has at least 15 units, pass the 15 threshold

Important:

- I did not find a code path where one of those booleans alone decides the final candidate result.
- They are feature outputs, not the whole acceptance rule.

## 5. The Other Repetition Metrics

The detector does not rely on `MIN_K` alone. It also uses:

- `sig_id_count_weak` for `count >= 3`
- `sig_id_count_medium` for `count >= 8`
- `sig_id_count_strong` for `count >= 15`
- `sibling_homogeneity_score`
- `depth_and_variety_pass`

Those are built from:

- `feat_sig_id_count_graduated(...)`
- `feat_sibling_homogeneity_score(...)`
- `feat_internal_depth_and_tag_variety(...)`

The most important composite flag is:

- `repeated_structure_support`

That becomes true if any of these are true:

- `sig_id_count_medium`
- `sig_id_count_strong`
- `sibling_homogeneity_score >= 0.65`
- `depth_and_variety_pass`

So the repeated-structure logic is more like a bundle of related checks than one single threshold.

## 6. How A Root Becomes A Candidate

`discoverCandidateRoots(...)` applies two layers of filtering.

### First layer: container eligibility

`looksLikeContainer(...)` keeps only elements that look like real container nodes.
It requires:

- a semantic hint in the attributes/class text, or one of the allowed container tags
- then at least one of these:
  - explicit role or microdata comment/feed markers
  - semantic text length >= 40
  - strong repeated structure with text length >= 20
  - repeated >= 3, homogeneity >= 0.5, text length >= 80
  - child count >= 4, homogeneity >= 0.75, text length >= 160

### Second layer: quick score

`quickCandidateScore(...)` adds points for signals such as:

- `role="feed"` or `role="comment"`
- `itemtype*="Comment"` or `itemtype*="Review"`
- comment/review/forum/thread/answer keywords in attributes
- repeated >= 3
- repeated >= 4 with high homogeneity
- repeated >= 8
- homogeneity >= 0.6
- nearby media, timestamps, or textareas
- text length >= 200

The node must score at least 3 to survive this pass.

That means a repeated block with no supporting structure or semantics can still be dropped.

## 7. What The Final Detector Uses

After discovery, `scoreFeatures(...)` computes the final heuristic result.

Repetition helps there too, but it is still only one signal among many.

The repetition-related score terms include:

- `sig_id_count_weak`
- `sig_id_count_medium`
- `sig_id_count_strong`
- `sibling_homogeneity_score >= 0.65`
- `depth_and_variety_pass`
- `repeating_group_count >= 4 && sibling_homogeneity_score >= 0.75`
- `text_contains_links && repeating_group_count >= 3`

Final detection is not "score >= X" by itself. The code uses:

- `baseDetected = score >= 12`
- or `score >= 8` when comment schema / comment role metadata is present
- plus `acceptanceGatePassed`

`acceptanceGatePassed` requires one of:

- strong keyword evidence
- reinforced keyword evidence
- medium keywords plus repeated-structure and interaction support
- a very strong no-keyword override with semantic, structural, and interaction evidence

So the final rule is:

- repetition supports detection
- repetition does not replace keywords, semantics, or interaction cues

## 8. Candidate Ranking And Truncation

Once candidates are collected, `src/shared/scanner.js` ranks them by:

- `detected`
- `score`
- `unit_count`
- `total_text_length`

Then it removes duplicates using:

- `frame_url`
- `xpath`
- `css_path`

The returned count is also capped by `resolveCandidateLimit(...)`, which defaults to the larger of:

- `maxCandidates`
- `maxResults`

with a minimum of 1.

## 9. Practical Answer To Your Question

If your real question is "is any repeated block with `MIN_K` enough to become a review candidate?", the answer is no.

The actual behavior is:

- repeated structure is one major feature family
- `MIN_K` is exposed as multiple thresholds, not one constant
- a node must first look like a real container
- it must pass a quick score filter
- then the full heuristic scorer still needs semantic and keyword support, unless a very strong override applies

If you want to change behavior, the places to edit are:

- `looksLikeContainer(...)` for candidate shortlist recall
- `quickCandidateScore(...)` for cheap pre-ranking
- `scoreFeatures(...)` for the final accept/reject logic
- `feat_min_k_threshold_pass(...)` and `feat_sig_id_count_graduated(...)` for repeated-family thresholds

## 10. Bottom Line

The detector is repetition-aware, but it is not repetition-only.

`MIN_K` is a family of repeated-structure thresholds, and the final decision also depends on:

- semantic markers
- text density
- repeated sibling homogeneity
- nesting depth and variety
- keyword evidence
- interaction cues

If you want, I can also turn this into a small flowchart or a table of "feature -> threshold -> where it is used".
