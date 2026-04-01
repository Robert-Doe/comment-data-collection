# UGC Detection Model

Date: `2026-03-30`

---

## 1. Purpose

The UGC model answers a ranking question:

> Among the DOM subgraphs proposed by the candidate generator, which
> ones are most likely to be the root of a repeated user-authored
> content region?

This ranking drives selective enforcement. Without it, the system
would either inspect too much of the page or miss the regions where
attacker-controlled content is most likely to appear.

---

## 2. Problem Formulation

The model has two related tasks:

### Candidate ranking

For each candidate root:

- label `1` if it is the true UGC container
- label `0` if it is not

Inference is page-relative: the important question is which candidate
is best on the current page, not whether a node looks comment-like in
isolation.

### Page-level UGC presence

At the page level, the system also predicts whether the page contains
a usable UGC region at all. This prevents over-eager gating on pages
that simply do not contain comments, reviews, or reply structures.

---

## 3. Positive Class Definition

Positive candidates are DOM subgraphs that act as the container for
repeated user-authored units shown to other users, including:

- article comment threads
- forum replies
- Q and A answer and comment areas
- product review sections
- social discussion panels

Not positive:

- the composer box alone
- navigation or content lists without user-authored units
- editorial feeds
- product grids and catalog pages

---

## 4. Candidate Generation

Candidate generation must be explicit because it determines the upper
bound on recall.

### Candidate sources

Candidates are proposed from:

- repeated sibling families with minimum cardinality thresholds
- ancestors of semantic anchors such as `comment`, `reply`, `review`,
  `discussion`, `author`, and `timestamp` markers
- containers aligned with composers or reply-entry widgets
- repeated structures that emerge after SPA route transitions

### Pruning

Candidates are pruned by:

- removing nodes under obvious navigation, header, or footer regions
- suppressing nodes with commerce-dominant or table-dominant patterns
- collapsing near-duplicate ancestors when their feature vectors are
  nearly identical
- capping the number of scored candidates per page

The paper should report candidate counts per page because classifier
latency depends on this step.

---

## 5. Feature Vector

The feature families remain the same, but they should be framed as
publication-quality groups rather than a brainstorming list.

### A. Structural repetition

- dominant sibling-family size
- sibling homogeneity
- nested repetition depth
- reply nesting indicators
- subtree depth and tag diversity

### B. Semantic markers

- comment/reply/review keywords in identifiers and attributes
- ARIA and schema markers
- microdata and JSON-LD hints

### C. Identity markers

- author coverage
- avatar coverage
- profile-link coverage
- verification or badge cues

### D. Time and chronology

- relative-time markers
- absolute dates
- timestamp attributes
- edit-history indicators

### E. Per-unit actions

- reply actions
- reactions and vote controls
- permalink coverage
- moderation or reporting controls

### F. Composer proximity

- nearby textareas
- contenteditable regions
- submit controls
- pagination or load-more alignment

### G. Negative controls

- price and cart signals
- table-structure dominance
- navigation ancestry
- empty repeated units
- star-rating-only patterns

---

## 6. Model Choice

### Current deployment model

Logistic regression remains the right first model because it is:

- fast in browser
- easy to serialize
- interpretable for ablations
- appropriate for a medium-sized, feature-engineered dataset

### Planned progression

| Stage | Dataset maturity | Model |
|---|---|---|
| v1 | Small to medium labeled corpus | Logistic regression |
| v2 | Larger clean corpus | LightGBM or similar |
| v3 | Abundant candidate labels | Learning-to-rank model |

The paper should avoid promising deep graph models unless the dataset
actually justifies them.

---

## 7. Training Data And Labeling Protocol

### Data sources

- scanner-produced page corpus
- candidate screenshots and structured review UI labels
- manually curated positive and negative examples

### Label types

- `comment_region`
- `not_comment_region`
- `uncertain`

### Label handling

- exclude `uncertain` from the primary fit
- use `uncertain` only in sensitivity analysis or adjudication
- deduplicate by normalized URL and split by eTLD+1 or domain family

### Negative data quality

The dataset must include strong negatives, not only random negatives:

- product grids
- editorial article lists
- navigation-heavy sidebars
- transaction history tables
- feed-like but non-UGC structures

Otherwise the model will overestimate its real-world precision.

---

## 8. Inference And Calibration

The model output is used in a page-relative way:

1. score all candidates
2. keep top-ranked candidates
3. derive page-level `has_ugc` decision
4. populate low and high gating thresholds

Two thresholds are needed:

- `T_low` for lightweight scrutiny
- `T_high` for full UGC-directed gating

Thresholds should be tuned on a held-out domain split, not on the same
pages used to report final results.

---

## 9. Evaluation Plan

Candidate-level metrics:

- top-1 accuracy
- recall at k
- precision, recall, F1
- PR-AUC

Page-level metrics:

- precision, recall, F1 on `has_ugc`
- false positive rate on clearly non-UGC pages

Operational metrics:

- candidates proposed per page
- scoring latency per page
- region-map stability over SPA transitions

Stratified results should be reported separately for comments, forums,
reviews, Q and A, and social reply structures.

---

## 10. Relationship To The Security Gate

The classifier does not replace the bootstrap gate. Instead:

- unknown regions use the universal bootstrap policy
- low-confidence regions receive lightweight scrutiny
- high-confidence regions receive full selective scrutiny

This relationship is important because it explains how the system
protects early SPA mutations before classification has fully converged.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised to specify candidate generation, pruning, and calibration:
  `2026-03-30`
- Status: model note now reflects the actual decision pipeline instead
  of only the classifier in isolation
