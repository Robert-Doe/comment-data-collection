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

## Dataset split rule

Always split by domain or eTLD+1.

This matters because random page splits leak template identity.

## Ablation ideas

- remove wildcard-XPath features
- remove expanded attribute-keyword features
- remove expanded time/date features
- remove direct-text-local features
- compare hash-only similarity versus hybrid similarity
