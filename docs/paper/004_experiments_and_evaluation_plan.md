# Experiments And Evaluation Plan

## Main hypotheses

1. wildcard-XPath-based sibling-family grouping improves candidate discovery
2. broader attribute and time/date features improve candidate discrimination
3. candidate-level manual labeling improves cross-site generalization more than page-only labels

## Baselines

Potential baselines:

- heuristic score only
- logistic regression on the initial feature set
- logistic regression on the refined feature set
- gradient-boosted trees on the refined feature set

## Evaluation units

Evaluate separately at:

- candidate level
- page level

## Candidate metrics

- top-1 accuracy
- recall@3
- precision / recall / F1
- PR-AUC

## Page metrics

- precision / recall / F1
- PR-AUC
- false-positive rate

## Deployment artifact metrics

Because the learned detector is meant to move into a browser
extension, the paper should also measure the deployment artifact
itself.

Important deployment metrics:

- browser-runtime model bundle size
- browser-runtime model load time
- browser-side inference latency per candidate
- parity between server-side and browser-side probabilities
- parity between server-side and browser-side top-1 ranking
- parity between server-side and browser-side page-level decisions

## Dataset split rule

Always split by domain or eTLD+1.

This matters because random page splits leak template identity.

## Ablation ideas

- remove wildcard-XPath features
- remove expanded attribute-keyword features
- remove expanded time/date features
- remove direct-text-local features
- compare hash-only similarity versus hybrid similarity

## Deployment parity check

The evaluation should explicitly compare:

1. the full server-side training artifact
2. the distilled browser-runtime JSON bundle

For a held-out set of pages:

1. score candidates on the server
2. score the same candidates using the browser runtime bundle
3. compare probabilities and rankings

This matters because the research claim is stronger if the trained
model is not only accurate offline, but also deployable as a compact
browser inference bundle without changing the underlying decision
behavior.
