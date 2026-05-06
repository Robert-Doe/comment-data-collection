# Feature Gaps And Testing Playbook

This note is the practical one. It describes what still needs attention and how to use the model for testing once the runtime bundle is wired in.

## What To Fix Before Expecting Runtime Parity

The current extension already computes many useful signals, but the runtime bundle expects exact feature names. That means the first job is not "add more features." The first job is "match the curated contract."

Priority gaps:

- repeated-family detail keys
- lexical keyword detail keys
- page context keys

Do not let extra features hide the missing ones. Extra features are ignored by the runtime vectorizer unless they are part of the catalog.

## What To Default Deliberately

If a key cannot be computed yet, default it on purpose instead of leaving it ambiguous.

Use these rules:

- numeric: `0`
- boolean: `false`
- categorical: `__missing__`

That keeps browser-side scoring aligned with training-time assumptions.

## What To Test First

Use pages that represent the real decision boundaries of the model:

| Page Type | Expected Behavior |
| --- | --- |
| Comment thread | High score, top candidate should look like the discussion region |
| Review grid | Often high repetition, but negative controls should keep false positives in check |
| Forum or Q&A page | Should benefit from keyword, author, and reply signals |
| Navigation or footer cluster | Low score |
| Commerce listing | Negative controls should suppress it |
| Login or captcha wall | Usually uncertain or low confidence |
| Mixed article page with comments below | The comment block should outrank the article body |

## What To Look At In The Popup

In the experimental popup, you should be able to inspect:

- the runtime artifact id
- the variant id
- the feature count
- the threshold values
- the candidate list and score ordering
- the security events that were recorded during mutation interception

If the runtime model is loaded, the popup should make that obvious.

## How To Compare Runtime Model Vs Heuristic Baseline

Use the same page and compare:

- candidate count
- top 1 candidate
- top 3 candidate order
- score band distribution
- page-level review rate

If the runtime model and heuristic baseline disagree, check these first:

- candidate-generation drift
- missing runtime keys
- wrong categorical defaults
- vectorizer dimension mismatch
- threshold mismatch

## What Success Looks Like

The integration is good enough for testing when:

- the runtime bundle loads in the extension
- the top candidate is stable on repeated reloads
- high-confidence positives are reasonable
- obvious false positives fall into the review band or below it
- score differences can be explained by the feature breakdown

At that point the model is doing its real job: guiding the extension toward better decisions, while still leaving room for review and debugging.
