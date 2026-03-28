# Review Workspace And Blocked-Page Detection

Date:

- `2026-03-28`

This is the current active brainstorm note.

## Why this update matters

The candidate-labeling workflow was technically present, but it still had two practical weaknesses:

1. the web UI pushed manual review and candidate review below the row table, which made review slower as jobs grew
2. blocked-page heuristics could stop candidate extraction too early, which hid usable candidate regions on sites like LinkedIn

Both weaknesses hurt dataset growth.

## Review workspace direction

The review flow should now be treated as a single workspace inside the main job view.

The practical structure is:

1. `Rows` tab for the job table
2. `Manual` tab for extension/manual snapshot upload
3. `Candidates` tab for human labeling of detected subgraphs

This is better than placing the labeling surface lower on the page because:

- the reviewer does not need to scroll away from the selected row
- switching from a row to manual capture or candidate labeling becomes immediate
- large jobs remain workable even when the table is long

## Candidate-review UX principle

When a reviewer clicks into a row, the system should open the most useful review surface immediately.

The preferred behavior is:

- if the row already has candidates, open `Candidates`
- if the row has no candidates yet, open `Manual`

That keeps the workflow aligned with the current state of the row instead of forcing extra navigation.

## Blocked-page detection refinement

The earlier access logic could classify a page as blocked before candidate extraction completed.

That caused a false negative pattern:

1. the page visibly contained comments
2. the page also contained some access-control or challenge signal
3. the scanner returned early
4. the row ended up with `0` candidates
5. the review UI had nothing useful to label

This is not acceptable for data collection.

## Updated access-handling strategy

The better operating rule is:

- keep access/interstitial detection as metadata
- do not let it erase candidate extraction by default
- only use the access result to explain scan quality, manual-review need, or residual uncertainty

In other words:

- access detection should annotate
- candidate extraction should still run whenever the DOM contains usable content

## LinkedIn lesson

The LinkedIn example is the clearest proof point.

Observed behavior after refinement:

- the manual snapshot produced candidate regions
- the page was no longer discarded as blocked just because background reCAPTCHA infrastructure existed
- the row could be treated as a candidate-labeling problem instead of a hard access failure

This matters because large social sites often load anti-abuse infrastructure in the background even when comment content is still present.

## LinkedIn metrics worth remembering

In the verified manual snapshot, the best LinkedIn candidate was detected with:

- score `14`
- `ugc_detected = true`
- `candidate_count = 5`

Top positive signals included:

- `sig_id_count_weak`
- `sibling_homogeneity_score`
- `depth_and_variety_pass`
- `sig_id_recursive_nesting`
- `has_nearby_textarea`
- `aligned_with_content_editable`
- `submit_button_present`
- `includes_author`
- `has_relative_time`
- `substantial_text_content`

Observed penalties included:

- `high_external_link_density`
- `price_currency_in_unit`

Interpretation:

- the detector is finding real UGC-like structure
- the miss was mainly in access gating, not total feature failure
- LinkedIn still needs ranking improvements because nearby non-comment UI can compete with the true comment region

## Detection-improvement implications

The next ranking improvements should focus on suppressing non-comment but socially structured UI such as:

- messaging overlays
- sidebar recommendation modules
- feed-adjacent account panels

Candidate-level penalties should likely be added for text or attribute patterns such as:

- `messaging`
- `compose message`
- `page inbox`
- `premium`
- `profile viewers`
- recommendation or follow modules

## Research-paper relevance

This update strengthens the paper story in two ways:

1. it shows why page-level access classification is not enough
2. it reinforces the value of subgraph-level review even on partially gated pages

That supports the central premise:

- the security-sensitive task is not only deciding whether a page has UGC
- it is localizing the DOM region where risky UGC actually lives

## Immediate next implementation direction

The next app-facing steps should be:

1. keep improving ranking penalties for social-site sidebars and overlays
2. expose signal-level debugging in the review UI so ranking mistakes are easier to diagnose
3. preserve candidate extraction even when access metadata is present
4. keep growing candidate-level human labels from real sites

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
