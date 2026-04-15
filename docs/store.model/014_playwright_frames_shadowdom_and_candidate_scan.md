# Playwright Frames And Shadow DOM In Candidate Scanning

Date: `2026-04-14`

This note explains how Playwright "sees" the page in this project and how the
scanner walks that structure.

Companion diagram:

- [014_playwright_frames_shadowdom_and_candidate_scan.dot](./014_playwright_frames_shadowdom_and_candidate_scan.dot)
- [014_playwright_frames_shadowdom_and_candidate_scan.svg](./014_playwright_frames_shadowdom_and_candidate_scan.svg)

## 1. The Object Tree

Think of Playwright like this:

```text
Page
|-- mainFrame()
|   `-- top-level document
|      |-- regular DOM nodes
|      `-- open shadow roots
`-- child frames
    |-- iframe A
    |   `-- its own document
    `-- iframe B
        `-- its own document
```

Important distinction:

- a `frame` is a separate document, usually an `iframe`
- a `shadow root` is a subtree inside one document
- the project scans both, but in different ways

## 2. What The Scanner Actually Does

The page-level scanner lives in `src/shared/scanner.js`.

It does this:

1. ask Playwright for the main frame
2. ask Playwright for all child frames
3. run the candidate extractor inside each frame
4. merge all candidates from all frames
5. sort, dedupe, and cap the final list

That means the scanner is frame-aware, but not frame-only.

## 3. How Shadow DOM Is Seen

The feature extractor in `src/commentFeatures.js` recursively walks open shadow
roots.

It does this through helpers such as:

- `getShadowRoot(...)`
- `directChildren(...)`
- `allDescendants(...)`
- `deepQuerySelectorAll(...)`

So inside one frame, the extractor can still see:

- normal DOM children
- nested open shadow DOM children

Limitation:

- closed shadow roots are not reachable through this approach

## 4. Pseudocode

```text
function collect_candidates_from_page(page):
    frame_list = page.frames()
    all_candidates = []

    for each frame in frame_list:
        if frame is a known challenge frame:
            continue

        frame_html = frame.content()
        frame_candidates = extract_candidates_from_frame(frame, frame_html)
        all_candidates.append(frame_candidates)

    ranked = sort_by_detected_then_score(all_candidates)
    unique = dedupe_by_frame_url_xpath_css_path(ranked)
    selected = take_first_n(unique, max(maxCandidates, maxResults))

    return enrich_with_artifacts(selected)


function extract_candidates_from_frame(frame, html):
    // This code runs inside the frame context.
    roots = extractCandidateRegions(html or document.documentElement.outerHTML)

    for each root in roots:
        // The extractor can walk open shadow roots while computing features.
        features = extractAllFeatures(root)
        scoring = scoreFeatures(features)
        emit merge(features, scoring)

    return sorted_and_trimmed_candidates
```

## 5. How To Read The Diagram

The DOT graph shows three layers:

- the Playwright page
- the frame boundaries
- the DOM inside each frame, including one open shadow root example

The candidate path is:

- `Page`
- `mainFrame()` or a child frame
- the frame's document
- an element that may host shadow DOM
- the open shadow root
- the repeated candidate container
- the repeated comment/review/forum units inside it

## 6. Why This Matters

If you only think in terms of the top document, you miss:

- embedded review widgets inside `iframe`s
- third-party comment systems inside `iframe`s
- components rendered inside open shadow DOM

This project handles those cases by:

- scanning every frame
- traversing open shadow roots inside each frame
- ranking the resulting candidate roots after feature extraction

## 7. Consequences And Limits

What works well:

- iframe-based comment systems are scanned
- open shadow DOM content is scanned
- repeated candidate roots inside those areas are still ranked normally

What does not work:

- closed shadow roots are invisible
- if a site hides the relevant UI outside the accessible DOM, the scanner cannot
  recover it
- frames and shadow roots are separate; one does not automatically expose the
  other

## 8. Bottom Line

Playwright sees a page as a tree of frames, and each frame contains its own DOM.
Inside each frame, this project recursively walks open shadow roots while it
extracts candidate features.

So the actual scan target is:

- page
- frames
- open shadow DOM inside each frame
- repeated candidate subtrees inside that DOM
