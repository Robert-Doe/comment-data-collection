# How Features Are Extracted

Date: `2026-04-01`

## 1. Why feature extraction exists

A DOM subtree is too messy to hand directly to this repo's first model.

So the code converts each candidate into measured facts called `features`.

In simple terms:

- candidate in
- feature object out

## 2. The main scanner-side function

In `src/commentFeatures.js`, the key function is:

- `extractAllFeatures(root, rawHTML, responseHeaders)`

It builds one large feature object from:

- the candidate `root`
- optional page HTML
- optional response-header context

## 3. Features are built by many `feat_*` helpers

Examples include:

- `feat_tag_name(root)`
- `feat_attributes_data_aria_role(root)`
- `feat_text_statistics(root)`
- `feat_repeating_group_count(root)`
- `feat_comment_header_with_count(root)`
- `feat_reply_button_per_unit(root)`
- `feat_author_avatar_colocation(root)`
- `feat_price_currency_in_unit(root)`

Each helper measures one slice of evidence.

## 4. Feature families in plain English

### Structure

Examples:

- `tag_name`
- `role_attribute`
- `node_depth`
- `child_tag_variety`

These describe what kind of container this is.

### Repetition

Examples:

- `repeating_group_count`
- `child_sig_id_group_count`
- `child_xpath_star_group_count`
- `sibling_homogeneity_score`

These describe whether the root contains repeated units.

### Authorship and semantics

Examples:

- `schema_org_comment_itemtype`
- `aria_role_comment`
- `microdata_itemprop_author`
- `has_avatar`
- `author_avatar_coverage`
- `author_timestamp_colocated`

These describe whether the region looks like authored user content.

### Interaction and negatives

Examples:

- `reply_button_unit_coverage`
- `has_nearby_textarea`
- `submit_button_present`
- `table_row_structure`
- `add_to_cart_present`
- `nav_header_ancestor`

These help tell discussion widgets apart from false positives.

## 5. Lower-level raw-signal helpers

The higher-level features are built from lower-level helpers such as:

- `attrText(el)`
- `fullAttrText(el)`
- `textOf(el)`
- `directChildren(root)`
- `getXPath(el)`
- `getXPathStar(el)`
- `structuralSignature(el)`

These are the raw observation tools.

## 6. `feature_values`

Later in the training pipeline, the candidate's measured signals are stored in a
row field called:

- `feature_values`

So:

- `features` is the conceptual object
- `feature_values` is that object as stored on one dataset row

## 7. Extension-side feature extraction

The detector extension already has:

- `detector_extension/feature_extractor.js`

Its main function is:

```js
extractFeatures(el, pseudoNode, candidateMeta, pageSignals)
```

The names here are useful:

- `el` = real candidate element
- `pseudoNode` = PseudoDOM representation
- `candidateMeta` = repeated-structure metadata
- `pageSignals` = page-level hints

## 8. Why exact feature names matter

If training expects:

- `reply_button_unit_coverage`

but runtime inference sends:

- `reply_button_coverage`

the model will not see the expected signal.

That is why the central feature schema lives in:

- `src/modeling/common/featureCatalog.js`

## 9. What to remember

Feature extraction is the stage where:

- messy DOM structure

becomes:

- clean named signals the model can learn from
