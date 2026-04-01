# Logistic Regression For This Repo

Date: `2026-04-01`

## 1. The simplest explanation

In this repo, logistic regression learns:

> given a candidate's feature vector, how likely is it that this candidate is
> the true comment region?

That is the whole job.

## 2. The key file

The model logic lives in:

- `src/modeling/common/logisticRegression.js`

Important functions:

- `trainLogisticRegression(vectors, labels, options = {})`
- `predictProbability(model, vector)`

## 3. The learned values

The two most important learned values are:

- `weights`
- `bias`

`weights`

- one learned number per vector slot

`bias`

- the starting offset before feature contributions are added

## 4. The prediction formula

The repo uses this idea:

```text
logit = bias + dotProduct(weights, vector)
probability = sigmoid(logit)
```

So prediction means:

1. multiply vector values by their matching weights
2. add them up
3. add the bias
4. squash the result into `[0, 1]` with `sigmoid`

## 5. What positive and negative weights mean

If a weight is positive:

- that feature pushes the candidate toward "looks like the true comment region"

If a weight is negative:

- that feature pushes away from that conclusion

Example intuition:

- positive weight on `author_avatar_coverage` means that signal often helped
- negative weight on `add_to_cart_present` means commerce patterns often hurt

## 6. Why `binary_label` is needed

The model learns from:

- `binary_label = 1`
- `binary_label = 0`

Those values come from the reviewed candidates.

So the model is really learning from the yes/no version of human review.

## 7. What training is doing

During training, the model repeatedly asks:

- was my prediction too high?
- was it too low?

Then it nudges `weights` and `bias`.

The main controls are:

- `iterations`
- `learningRate`
- `l2`

You can think of them as:

- how many correction rounds
- how big the corrections are
- how strongly large weights are discouraged

## 8. Why class weights exist

Sometimes the dataset has more negatives than positives.

The helper:

- `computeClassWeights(labels)`

tries to stop one class from dominating just because it appears more often.

That is useful in a candidate-ranking problem, because each page often has:

- one real candidate
- many wrong candidates

## 9. A tiny example

Suppose a toy model has:

- `bias = -1.2`
- weight for `comment_header_with_count` = `+1.5`
- weight for `has_avatar` = `+0.8`
- weight for `add_to_cart_present` = `-2.0`

If one candidate has:

- `comment_header_with_count = 1`
- `has_avatar = 1`
- `add_to_cart_present = 0`

then its logit rises and the probability becomes high.

If instead it has:

- `comment_header_with_count = 0`
- `has_avatar = 0`
- `add_to_cart_present = 1`

then the probability drops.

That is the basic logic.

## 10. Why logistic regression is a good first model

This repo uses logistic regression first because it is:

- interpretable
- fast
- easy to serialize
- easy to run in a browser

That makes it a good fit for `runtime.json` and extension-side scoring.

## 11. What to remember

Logistic regression here is just:

- weighted feature evidence
- plus a bias
- turned into a probability
