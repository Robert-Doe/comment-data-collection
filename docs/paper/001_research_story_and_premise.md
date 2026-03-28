# Research Story And Premise

## Core idea

The project is motivated by a simple observation:

- many web pages expose user-generated content through repeated DOM subgraphs
- those subgraphs often serve as the earliest practical location where untrusted content is rendered
- if those regions can be localized reliably, defensive instrumentation can focus on the right place earlier

## Research premise

Instead of treating the whole page as equally risky, the system tries to:

1. detect whether a page contains comment-like UGC
2. localize the actual DOM region where that UGC lives
3. support defensive intervention before harmful rendering or exploitation pathways mature

## Why this matters

The problem is difficult because:

- comment systems are structurally diverse
- many sites hide semantics in custom attributes and framework markup
- repeated content units can be visually similar but structurally noisy
- page-level labels are weaker than subgraph-level labels

## High-level contribution claim

A feature-driven candidate-ranking system, supported by wildcard-XPath sibling-family grouping and human review of ambiguous candidates, may provide a practical way to localize risky UGC subgraphs across heterogeneous websites.

## Candidate paper contribution areas

- a DOM-subgraph localization problem formulation for comment-like UGC
- a feature-based detection pipeline for candidate region ranking
- a human-assisted labeling loop for ambiguous repeated DOM regions
- an evaluation methodology centered on cross-site generalization
