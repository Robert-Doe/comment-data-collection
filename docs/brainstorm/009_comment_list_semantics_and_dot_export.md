# Comment List Semantics And DOT Export

## Current Terminology

- `comment list`: the container/subgraph that holds repeated user-generated units
- `comment block`: one repeated unit inside that list, usually one comment/reply/review item
- `comment block element`: the text-bearing leaf or near-leaf inside the block that holds the user's actual comment/review/reply message

## What The Candidate Screenshots Mean

The current candidate screenshots should be interpreted as `comment list` screenshots.

They are not intended to be screenshots of:

- one isolated `comment block`
- one isolated `comment block element`

The detector is scoring container roots. It then crops the resolved candidate DOM element. In practice that means the screenshot is usually:

- the whole repeated list region
- sometimes a slightly broader wrapper around the list
- sometimes a tighter list container depending on site markup

That behavior is still acceptable for manual labeling because the target is the `comment list` subgraph first.

## How The Internal Story Should Map

For the current system:

1. detect a `comment list` candidate
2. infer the repeated child family inside it as `comment blocks`
3. treat the actual text-bearing message node inside each block as the `comment block element`

This keeps the screenshot and graph workflows aligned:

- screenshot = list candidate for human review
- repeated child units in the graph = block-level structure
- the actual text leaf nodes remain available in the DOM tree but are not the primary screenshot target

## DOT Export

The review page now supports Graphviz DOT export for rows that have a stored manual HTML snapshot.

What the DOT graph shows:

- the whole DOM tree of the stored snapshot
- highlighted `LIST` nodes for detected candidate roots
- highlighted `BLOCK` nodes for the dominant repeated child family inside each list
- one cluster per candidate list subtree

What it does not require:

- the old `window.__commentFeatureScan` globals
- running `index_A`, `index_B`, and `index_C` manually in the console

Instead, it rebuilds the graph from the stored snapshot HTML plus the current extractor output.

## Relationship To The Older `index_A/B/C` Work

The old workflow still matters conceptually:

- `index_A`: feature scanning and per-node evidence
- `index_B`: wildcard-XPath grouping
- `index_C`: whole-page DOT graph and structural clustering

The app-side DOT export follows the same spirit, but it is adapted to the current codebase:

- it uses the current `extractCandidateRegions(...)` output
- it keeps wildcard-XPath style repeated-child grouping in the block inference
- it exposes the result directly from the review UI

## Important Limitation

DOT export currently depends on stored HTML snapshots.

That means:

- manual snapshot rows can export DOT now
- older automated-only rows without saved HTML cannot export DOT yet

If full automated-row graph export becomes important later, the scanner will need to persist HTML snapshots or generate DOT during scan time.
