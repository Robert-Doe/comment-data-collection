# Review Candidate Selection Pseudocode And Repetition Risks

Date: `2026-04-14`

This note shows the real approach in pseudocode and answers the key question:

- Is "repetition of length greater than 3" enough by itself?

Short answer:

- No.
- Repetition is one important signal, but the repo also checks semantic hints, container shape, sibling homogeneity, depth, text density, interaction cues, and a final heuristic gate.

## 1. Where This Logic Lives

The main path is:

- `src/shared/scanner.js`
- `src/commentFeatures.js`

The scanner gathers candidates from each frame and then ranks them.
The feature file decides whether a DOM subtree even looks like a candidate and then scores it.

Relevant functions:

- `src/shared/scanner.js:777` `extractCandidatesFromFrame(...)`
- `src/shared/scanner.js:873` `collectCandidatesFromPage(...)`
- `src/shared/scanner.js:971` `scanUrl(...)`
- `src/commentFeatures.js:1961` `looksLikeContainer(...)`
- `src/commentFeatures.js:1989` `quickCandidateScore(...)`
- `src/commentFeatures.js:2017` `discoverCandidateRoots(...)`
- `src/commentFeatures.js:2052` `extractCandidateRegions(...)`
- `src/commentFeatures.js:1715` `scoreFeatures(...)`

## 2. Big Picture

The code does not start from "all repeated nodes are comments".
It starts from "which parts of the page look like plausible content containers?"

Then it asks:

1. Does the container have repeated child structure?
2. Does the container also look like a comment/review/forum/feed region?
3. Does the full heuristic score support that guess?
4. Is the candidate better than the other candidates on the page?

So the repeated structure is a filter and a feature, not the entire decision.

## 3. Pseudocode For The Whole Approach

```text
function scan_page(page):
    all_candidates = []

    for each frame in page.frames:
        html = get_frame_html(frame)
        frame_candidates = extract_candidates_from_frame(frame, html)
        all_candidates.append(frame_candidates)

    ranked = sort_candidates(
        all_candidates,
        priority = [detected, score, unit_count, total_text_length]
    )

    unique = dedupe_by(frame_url, xpath, css_path, ranked)
    selected = take_up_to_limit(unique, max(maxCandidates, maxResults))

    return enrich_with_artifacts(selected)


function extract_candidates_from_frame(frame, html):
    raw_nodes = all_elements_in_document(html)
    roots = []

    for each node in raw_nodes:
        if not looks_like_container(node):
            continue

        quick_score = quick_candidate_score(node)
        if quick_score < 3:
            continue

        roots.append(node)

    roots = remove_nested_overlap(roots)

    candidates = []
    for each root in roots:
        features = extract_all_features(root)
        scoring = score_features(features)

        candidate = merge(features, scoring)
        candidate.repeating_group_count = repeated_unit_count(root)
        candidate.min_k_count = repeated_unit_count(root)
        candidates.append(candidate)

    candidates = sort_by_score_then_size(candidates)
    candidates = remove_nested_overlap(candidates)
    return top_n(candidates, maxResults)


function looks_like_container(node):
    if node.tag is not one of allowed container tags:
        if node lacks comment/feed semantic hints:
            return false

    repeated = dominant_repeated_child_family_size(node)
    homogeneity = sibling_homogeneity(node)
    text_len = subtree_text_length(node)

    if node has role="feed" or role="comment" or comment/review itemtype:
        return true

    if semantic keywords exist and text_len >= 40:
        return true

    if repeated >= 4 and homogeneity >= 0.75 and text_len >= 20:
        return true

    if repeated >= 3 and homogeneity >= 0.5 and text_len >= 80:
        return true

    if child_count >= 4 and homogeneity >= 0.75 and text_len >= 160:
        return true

    return false


function quick_candidate_score(node):
    score = 0
    repeated = dominant_repeated_child_family_size(node)
    homogeneity = sibling_homogeneity(node)

    if node has role="feed" or role="comment":
        score += 5
    if node has Comment/Review microdata:
        score += 5
    if node attributes contain comment/reply/review/forum/thread/answer/feed:
        score += 3
    if repeated >= 4 and homogeneity >= 0.75:
        score += 3
    if repeated >= 3:
        score += 3
    if repeated >= 8:
        score += 2
    if homogeneity >= 0.6:
        score += 2
    if nearby media / timestamps / composer controls exist:
        score += 1 or 2
    if text is large enough:
        score += 1

    return score


function score_features(features):
    score = 0

    score += semantic markup signals
    score += keyword signals
    score += repetition signals
    score += timestamp / avatar / author / reply / permalink / textarea signals
    score -= navigation / commerce / table / empty-block signals

    repeated_structure_support =
        sig_id_count_medium OR
        sig_id_count_strong OR
        sibling_homogeneity_score >= 0.65 OR
        depth_and_variety_pass

    strong_keyword_evidence =
        explicit keyword signals OR
        multiple supporting keyword signals

    medium_keyword_assurance =
        medium keywords AND
        repeated_structure_support AND
        enough structural support AND
        enough interaction support AND
        score >= 18

    high_assurance_without_keywords =
        no strong keywords AND
        enough semantic support AND
        repeated_structure_support AND
        enough structural support AND
        enough interaction support AND
        score >= 26

    acceptance_gate_passed =
        strong_keyword_evidence OR
        medium_keyword_assurance OR
        high_assurance_without_keywords

    base_detected =
        score >= 12
        OR (comment schema or comment role exists AND score >= 8)

    detected = base_detected AND acceptance_gate_passed

    if detected:
        pseudo_label = "ugc"
    else if score is not terrible or repeated_structure_support exists:
        pseudo_label = "uncertain"
    else:
        pseudo_label = "not_ugc"

    return score, detected, pseudo_label, acceptance_gate_passed
```

## 4. How The Code Decides "This Looks Like A Comment"

It does not use repetition alone.

The strongest comment indicators are:

- `role="comment"`
- `role="feed"` with article-like children
- `schema.org` Comment microdata
- comment/review/forum/reply/answer keywords in attributes or text
- comment-relevant per-item structure such as:
  - author markers
  - avatars
  - timestamps
  - reply buttons
  - permalinks
  - reaction or vote controls
  - textareas or compose boxes nearby

Repetition then strengthens the guess.

In practice, the detector treats repetition as evidence that the region is a list of similar units, but it still needs context to decide whether those units are comments, reviews, forum posts, or just a generic card grid.

## 5. Is `repeating structures of length > 3` enough?

No.

In this repo, repeated-structure thresholds such as:

- `min_k_threshold_pass_3`
- `min_k_threshold_pass_5`
- `min_k_threshold_pass_8`
- `min_k_threshold_pass_15`

are feature outputs.

They are not the final decision by themselves.

The actual candidate path still checks:

- whether the element looks like a container
- whether it passes the quick score filter
- whether the full heuristic score is high enough
- whether semantic and interaction evidence support the repetition
- whether the candidate is better than overlapping parent/child candidates

So "more than 3 repeated children" is closer to "worth considering" than "must be sent to human review."

## 6. What Happens If You Use Only Repetition

If repetition becomes the only criterion, you will get many false positives.

Examples:

- product tiles
- news cards
- image galleries
- playlist rows
- navigation menus
- search result lists
- FAQ accordions
- related-article blocks
- ad grids
- table rows

These all repeat, but they are not comments or reviews.

You will also get false negatives.

Examples:

- comment sections with only a few comments
- single-thread discussions with low visible repetition
- lazy-loaded threads where only one or two items are present in the viewport
- forum replies that are visually diverse
- reviews rendered as mixed templates

## 7. Consequences For Human Review

If you select review candidates using repetition only:

- reviewers will waste time on generic repeated layouts
- the true comment region may be buried below non-comment lists
- the top-ranked candidate may not be the real target
- the system will look better on obvious list pages and worse on messy real pages
- the model or reviewer will learn the wrong shortcut, namely "anything repeated is UGC"

That shortcut is fragile.
It usually fails as soon as the site changes its template or the page contains another repeated layout.

## 8. Practical Meaning

The right interpretation of this repo is:

- repetition is a strong clue
- repetition is not a complete answer
- comment/review/forum detection is a multi-signal judgment
- human review is used to confirm the best-ranked candidates, not every repeated block on the page

## 9. Bottom Line

The project does not conclude "repeated structure length > 3 equals comment".

It concludes something closer to:

- this root looks like a real content container
- it has repeated children
- it has enough semantic, structural, and interaction evidence
- it scores well enough to be worth showing to a human

If you want, I can next turn this into a simple flowchart or a side-by-side table of:

- repetition-only logic
- the repo's actual logic
- the false positives you should expect from each
