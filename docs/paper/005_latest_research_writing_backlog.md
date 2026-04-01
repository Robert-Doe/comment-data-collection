# Research Writing Backlog

Date:

- `2026-03-28`

This is the active paper-planning note.

## Current paper story

The strongest story so far is:

- user-generated content often appears in repeated DOM subgraphs
- those subgraphs are a better focus for defensive analysis than the page as a whole
- comment-like UGC localization can be framed as a candidate-ranking problem
- manual review of ambiguous candidates can improve the dataset and the model iteratively

## Claims that need evidence

- wildcard-XPath sibling-family grouping is robust across sites
- hybrid similarity beats hash-only similarity
- broader attribute and date/time coverage improves recall
- candidate-level labeling produces better models than page-level labeling alone
- the trained model can be distilled into a compact browser-runtime bundle without changing inference outcomes materially

## Evidence we still need

- cross-site evaluation results
- examples of ambiguous multi-candidate pages
- screenshots showing correct versus incorrect candidate regions
- ablations for keyword, time/date, and sibling-family refinements
- parity checks between server-side scoring and browser-side runtime scoring
- runtime bundle size and load-time measurements

## What the current app can already collect

- page-level scan outcomes
- candidate arrays per page
- candidate-local screenshot artifacts
- candidate-level human labels
- manual snapshot re-analysis results

This should make the eventual paper stronger because the dataset can be built in the same workflow used for the product.

## Writing assets to collect over time

- architecture diagrams
- feature taxonomy tables
- candidate screenshot examples
- threat-model diagrams
- failure-case examples
- full training artifact versus browser-runtime bundle figure
- browser inference contract figure (feature extractor -> vectorizer -> weights -> thresholds)

## Current position

The paper should emphasize:

- localization of risky UGC subgraphs

more than:

- generic page classification

## Update note

This file should lose `latest` in its name when a newer paper-planning note is created.
