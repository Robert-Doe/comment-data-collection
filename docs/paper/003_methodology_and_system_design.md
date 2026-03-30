# Methodology And System Design

## System view

The system should be described as a pipeline:

1. upstream page analysis
2. candidate subgraph generation
3. feature extraction
4. candidate ranking
5. page-level decision
6. human-assisted review for ambiguous cases
7. dataset refinement

## Candidate generation

Candidate regions are proposed from DOM structure and repeated sibling-family patterns.

Important signals include:

- wildcard-XPath sibling families
- repeated-unit structure
- semantic keyword evidence
- time/author/action coverage
- negative-control features

## Feature extraction

Feature families include:

- repetition and sibling-homogeneity signals
- tag and attribute keyword signals
- direct-text and subtree-text signals
- author/avatar/timestamp/reply/reaction signals
- composer proximity signals
- negative controls such as commerce or table structure

## Modeling approach

Initial modeling should favor:

- candidate-level logistic regression
- page-level aggregation over candidate scores

For deployment, the trained model should not be treated as a vague
"ML result." It should be treated as a versioned browser-runtime
artifact.

The distinction should be explicit:

- full training artifact for research, audit, and reproducibility
- distilled runtime JSON bundle for browser-side inference

The runtime bundle should carry:

- feature schema
- vectorizer metadata
- logistic weights and bias
- thresholds
- compact provenance metadata

Later work can compare:

- gradient-boosted trees
- ranking models

## Extension handoff boundary

The future XSS-protection extension should consume the distilled
runtime bundle, not the full training record.

That matters because the browser-side system only needs:

- candidate feature extraction
- vectorization with the saved schema
- lightweight inference
- thresholded region selection

It does not need the entire training trace or evaluation payload.

This separation strengthens the systems story:

- offline training remains rich and auditable
- online deployment remains compact and practical

## Human review

If multiple candidate regions remain plausible, the system should preserve them for manual labeling rather than collapsing too early to one guess.

This supports:

- stronger candidate-level labels
- better hard-negative collection
- better cross-site learning

In the current application direction, this review loop is app-facing rather than purely theoretical:

- candidate screenshots are attached to stored scan results
- reviewers can label candidate regions directly from the web UI
- manual snapshot uploads produce their own candidate sets for review and later training
