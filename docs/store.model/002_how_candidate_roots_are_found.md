# How Candidate Roots Are Found

Date: `2026-04-01`

## 1. What a candidate root is

A candidate root is a DOM element that might be the top container for:

- comments
- replies
- reviews
- discussion threads

It is usually a container like:

- `div`
- `section`
- `article`
- `ul`
- `ol`

with repeated child blocks underneath it.

## 2. The main discovery function

In `src/commentFeatures.js`, the main function is:

- `discoverCandidateRoots(options = {})`

It scans likely container elements such as:

- `main`
- `section`
- `article`
- `div`
- `ul`
- `ol`
- `aside`
- `[role]`
- `[itemtype]`

## 3. The first filter

The helper:

- `looksLikeContainer(node)`

tries to answer:

> is this node even worth considering?

It uses:

- semantic hints
- repeated children
- text length
- role and microdata signals

## 4. The second filter

The helper:

- `quickCandidateScore(node)`

gives a rough early score.

It looks for evidence such as:

- `role="feed"`
- `role="comment"`
- `itemtype*="Comment"`
- repeated children
- nearby textareas
- enough text

This is not the trained model yet.
It is a cheap first-pass ranker.

## 5. Why repeated children matter

Real comment areas often look like:

- one repeated comment card
- another repeated comment card
- another repeated comment card

So the parent container tends to have repeated child structure.

The code measures that with helpers such as:

- `directChildren(root)`
- `dominantChildGroup(root)`
- `dominantXPathChildGroup(root)`
- `dominantUnitGroup(root)`

## 6. `sigId` and `xpathStar`

Two code words matter here.

`sigId`

- a compact structural identity based on `structuralSignature(el)`

`xpathStar`

- a wildcard XPath-style grouping from `getXPathStar(el)`

These help the code detect repeated child families without hardcoding site
templates.

## 7. Candidate metadata

A candidate can carry metadata such as:

- `element`
- `score`
- `repeated`
- `textLength`
- `xpath`

So a candidate is not just "some node".
It is a node plus evidence about why it was selected.

## 8. Overlap removal

The code avoids returning many nested versions of the same region.

It uses path comparisons such as:

- `pathIsAncestor(ancestorPath, descendantPath)`

so it does not keep:

- the comment list
- its parent
- its grandparent

all as separate top results.

## 9. Extension-side parallel

Inside `detector_extension/injected_wrapper.js`, the extension has a similar
idea through:

- `PseudoDOM.getCandidateRoots()`
- `HeuristicClassifier.classify()`

Different code, same mission:

- find likely UGC container roots
- rank them

## 10. What to remember

The model does not start with all DOM nodes.
It starts with a filtered shortlist of likely container roots.
That shortlist is the set of `candidates`.
