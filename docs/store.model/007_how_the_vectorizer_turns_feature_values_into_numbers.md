# How The Vectorizer Turns Feature Values Into Numbers

Date: `2026-04-01`

## 1. Why a vectorizer is needed

The model can do math with numbers.
It cannot directly do math with strings like:

- `'section'`
- `'feed'`
- `'manual_snapshot'`

So the repo needs a translator.
That translator is the vectorizer.

## 2. The core functions

The vectorizer lives in:

- `src/modeling/common/vectorizer.js`

The main functions are:

- `fitVectorizer(rows, featureCatalog)`
- `transformRow(row, vectorizer)`
- `transformRows(rows, vectorizer)`

## 3. What `fitVectorizer(...)` creates

It produces a `vectorizer` object containing:

- `descriptors`
- `numericStats`
- `categoricalMaps`
- `dimension`

This object describes exactly how features are turned into numeric positions.

## 4. Numeric features

Examples:

- `node_depth`
- `repeating_group_count`
- `author_avatar_coverage`

For these, the vectorizer stores:

- `mean`
- `std`

Then it transforms the raw value roughly as:

```text
(raw - mean) / std
```

This is standardization.

## 5. Boolean features

Examples:

- `has_avatar`
- `comment_header_with_count`
- `table_row_structure`

These become simple numeric values:

- true-like -> `1`
- false-like -> `0`

## 6. Categorical features

Examples:

- `tag_name`
- `role_attribute`
- `analysis_source`
- `blocker_type`

These use one-hot encoding.

That means one feature may expand into many yes/no slots such as:

- `tag_name=div`
- `tag_name=section`
- `tag_name=article`
- `tag_name=__missing__`

## 7. Why `__missing__` matters

Missing categorical values are normalized to:

- `__missing__`

This rule is extremely important because the browser runtime must use the same
missing-value convention as training.

## 8. What `descriptors` means

Each descriptor says which feature goes into which numeric slot.

Typical descriptor fields include:

- `index`
- `feature_key`
- `output_key`
- `type`

So `descriptors` is like a map from human-readable features to vector positions.

## 9. Why the vectorizer must ship with the model

The model alone is not enough.

The browser also needs to know:

- how to normalize numeric values
- what categories existed during training
- which slot belongs to which feature

That is why `runtime.json` contains the vectorizer.

## 10. What to remember

The vectorizer is the translator between:

- `feature_values`

and:

- the numeric vector the logistic-regression model uses
