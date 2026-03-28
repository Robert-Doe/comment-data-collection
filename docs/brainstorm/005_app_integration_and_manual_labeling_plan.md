# App Integration And Manual Labeling Plan

Date:

- `2026-03-28`

This is the current active brainstorm note.

## Current direction

The stronger feature-detection ideas from the older reference detectors should now be treated as inputs to the actual app strategy, not just side notes.

The app direction is:

1. strengthen the current feature extractor
2. run candidate detection on real sites
3. if a site yields multiple plausible candidate subgraphs, keep them
4. capture candidate-local screenshots
5. let a human label the correct region when necessary
6. feed those labels back into the training dataset

This is a better path than assuming a single candidate per page is always enough.

## What should be incorporated into the app strategy

### 1. Broader keyword detection

Strengthen keyword features by checking:

- tag names
- `class`
- `id`
- all attribute names
- all attribute values
- short direct text

This is especially useful for:

- custom framework attributes
- non-standard comment widgets
- sites that hide semantics in `data-*` names and values

### 2. Richer time and date detection

Strengthen time signals by supporting:

- `seconds/minutes/hours/days/weeks/months/years ago`
- shorthand forms like `5h`, `2d`, `7mo`
- `today`
- `yesterday`
- absolute numeric dates
- month-name dates
- timestamp-like attributes

### 3. Hybrid sibling similarity

The stronger approach is now:

- wildcard `xpath[*]` for sibling-family grouping
- structural similarity as support, not as the only grouping rule
- optional median-reference support scoring for repeated substructure

This should make repeated-unit detection more stable on messy real pages.

### 4. Direct-text-local features

Use direct-text signals separately from subtree-text signals so that:

- a local label like `Comments`
- does not get drowned inside a large content subtree

### 5. Multi-candidate manual labeling

When the top score is not clearly dominant, do not collapse too early.

Instead:

- keep the top `3` to `5` candidates
- capture each candidate region
- let the reviewer choose:
  - correct comment/UGC region
  - not correct
  - uncertain

This creates better candidate-level labels than page-only labels.

## App-level workflow

### Automated path

1. feature extraction runs on the site
2. repeated sibling families are detected
3. candidate regions are scored
4. page-level decision is produced from candidate aggregates

### Human-assisted path

1. multiple plausible candidates are kept
2. candidate-local screenshots are captured
3. the reviewer labels the region on the site
4. the correct region is stored with its feature vector and locator metadata
5. the dataset is updated

This means the system becomes better over time without requiring the model to be perfect at the start.

## Current implementation status

The app now supports the first version of this flow:

- candidate arrays are preserved on each item
- candidate screenshots are generated for reviewable candidates
- candidate keys are persisted with scan results
- the web UI exposes a candidate-review panel
- candidate-level human labels are stored with the item for later dataset export

This is enough to start building a training set while more sites and pages are added.

## Why this helps the app

It gives the app:

- better candidate discrimination
- cleaner training data
- a path for site-specific ambiguity
- a practical fallback when multiple DOM subgraphs look comment-like

## Why this helps the research story

This workflow supports a stronger paper narrative:

- the system is not only trying to detect pages with comments
- it is trying to localize the actual DOM subgraph where risky user-generated content lives
- manual labeling focuses on the real subgraph instead of vague page-level labels
- the dataset can improve iteratively through realistic review workflows

## Immediate next implementation direction

The next code-facing work should likely be:

1. integrate the stronger keyword and time/date features into the app extractor
2. add better sibling-family metadata derived from wildcard `xpath`
3. strengthen hybrid similarity beyond the current signature-heavy approach
4. refine dataset export for candidate-level training rows
5. add reviewer workflows for page-level labels where needed

## Current operating principle

The project should focus on:

- finding the actual site regions and DOM subgraphs where risky UGC begins

That is the most defensible foundation for both:

- practical security instrumentation
- a future research paper

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
