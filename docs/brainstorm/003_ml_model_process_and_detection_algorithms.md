# ML Model Process And Detection Algorithms

This note defines the modeling process assuming one important boundary:

- pseudo-DOM construction is handled upstream
- feature extraction is handled upstream
- the model only consumes a feature array or feature set and predicts whether a candidate region is comment-like UGC or not

That means this document is about:

- what gets detected before the model
- what gets converted into features
- which models we should train
- how candidate regions become page-level decisions
- how screenshot labeling improves the dataset

## Scope

Out of scope:

- reCAPTCHA
- Cloudflare
- login walls
- security-intervention modeling
- implementation details of pseudo-DOM construction

In scope:

- candidate region discovery
- similar sibling detection
- feature-array generation
- candidate-level UGC classification
- page-level comment detection
- screenshot-assisted human labeling

## High-Level Contract

The upstream extraction system gives us:

1. a page representation
2. a set of candidate DOM subgraphs
3. feature vectors for those candidates
4. optional metadata for localization:
   - `xpath`
   - wildcard `xpath` template
   - `css_path`
   - bounding box
   - screenshot crop

The model returns:

1. candidate probability: `P(candidate_is_comment_region)`
2. page probability: `P(page_has_comment_like_ugc)`

## Core Design Decision

The model should not learn raw page layout identities.

So:

- use `xpath` and wildcard `xpath` heavily for upstream grouping, dedupe, and localization
- do not use raw absolute `xpath` as a first-pass model feature
- use derived repetition and homogeneity features from `xpath` grouping as model inputs

That preserves the value of your current wildcard-XPath workflow without causing the model to memorize site-specific paths.

## End-To-End Process

### Stage 1: Candidate discovery

Upstream logic identifies possible UGC containers from the page tree.

These candidates usually come from:

- `section`
- `article`
- `div`
- `ul`
- `ol`
- `main`
- `aside`
- nodes with comment/reply/review/feed semantics

### Stage 2: Similar sibling family detection

For each candidate container, detect repeated sibling families.

This is where wildcard `xpath` is very useful.

### Stage 3: Candidate feature generation

For each candidate, compute:

- repetition features
- semantic features
- per-unit action features
- text/timestamp/author features
- negative-control features

### Stage 4: Candidate ranking model

The candidate model scores each candidate region.

Output:

- probability that the region is the true comment-like UGC area

### Stage 5: Page-level aggregation

Aggregate the top candidate scores into a page-level comment decision.

### Stage 6: Screenshot review loop

For the top candidates:

- capture the region screenshot
- let a human label whether it is the correct UGC area
- add that label back into the training set

This is how the dataset gets cleaner over time.

## How To Detect Similar Siblings

Your current instinct is correct: wildcard `xpath` is a practical way to detect repeated sibling structures.

### Primary approach: wildcard-XPath sibling grouping

Assume we have siblings like:

```text
/html/body/main/div[2]/section[1]/article[1]
/html/body/main/div[2]/section[1]/article[2]
/html/body/main/div[2]/section[1]/article[3]
```

Normalize the sibling index to a wildcard:

```text
/html/body/main/div[2]/section[1]/article[*]
```

That template defines one repeated sibling family.

### Why this works

It captures:

- same parent
- same node type
- same structural position
- repeated units under one container

That is exactly the shape most comment/review/reply lists have.

### Recommended sibling grouping rule

Two nodes belong to the same sibling family if:

1. they share the same parent
2. their wildcard sibling `xpath` template is the same
3. their tag type is the same or compatible
4. optional sanity checks pass:
   - similar depth
   - similar child-count range
   - similar semantic token density

### Features derived from wildcard-XPath grouping

From each candidate container, derive:

- dominant wildcard sibling template
- dominant sibling family size
- number of repeated sibling families
- ratio of dominant family size to direct child count
- count of families with size `>= 3`
- deepest repeated family level
- nested repeated family presence

These become model features.

### Important distinction

Use:

- wildcard `xpath` as a grouping and localization mechanism

Do not initially use:

- raw absolute `xpath` string as a direct model feature

Reason:

- raw paths memorize templates
- derived repetition metrics generalize better

## Secondary sibling similarity checks

Wildcard `xpath` can be the main grouping signal, but it should not be the only signal.

Good supporting checks:

- tag-name consistency
- similar child-tag histogram
- similar direct child count
- same repeated action pattern:
  - reply buttons
  - author nodes
  - timestamps
  - avatar presence
- same text-density range

This creates a hybrid definition of sibling similarity:

- location similarity from wildcard `xpath`
- content-pattern similarity from features

## Detection Approaches

We should think of detection as a stack of approaches, not a single rule.

## Approach 1: Repeated sibling family detection

Purpose:

- find containers that look like lists of repeated UGC units

Main signals:

- wildcard `xpath` family size
- dominant sibling group ratio
- repeated family count
- recursive/nested repeated families

Best for:

- comments
- replies
- reviews
- forum answers

### Algorithm

```text
For each candidate container C:
  enumerate direct children of C
  compute absolute xpath for each child
  replace child index with [*] to build wildcard template
  group children by wildcard template
  choose dominant group G
  derive:
    group_size = |G|
    homogeneity = |G| / child_count(C)
    repeated_family_count = number of groups with size >= 2
    repeated_family_strong = number of groups with size >= 3
```

## Approach 2: Semantic UGC signal detection

Purpose:

- verify that repeated units look like actual user-generated content and not product cards or navigation

Main signals:

- author indicators
- avatar indicators
- relative time
- timestamps
- reply buttons
- reaction counts
- profile links
- comment headers
- microdata / schema signals
- reply nesting

### Algorithm

```text
For each candidate C:
  compute semantic features
  estimate unit-level coverage:
    author_coverage
    timestamp_coverage
    reply_button_coverage
    profile_link_coverage
    reaction_coverage
  if several of these cover a large share of repeated units:
    boost candidate quality
```

## Approach 3: Negative-control filtering

Purpose:

- reduce false positives from commerce and layout widgets

Main negatives:

- add-to-cart presence
- price density
- star-rating without text
- navigation/header ancestry
- table row structure
- high external-link density
- low text coverage

### Algorithm

```text
For each candidate C:
  compute negative-control features
  if commerce/navigation/table signals are strong:
    reduce candidate quality
```

## Approach 4: Candidate ranking model

Purpose:

- combine all extracted features into one score

Input:

- one feature vector per candidate

Output:

- `P(candidate_is_comment_region)`

### Baseline model

Start with:

- logistic regression

Why:

- fast
- stable
- interpretable
- easy to deploy in the extension

### Later models

After label volume improves:

- LightGBM
- XGBoost
- CatBoost
- ranking model like LambdaMART

## Approach 5: Page-level aggregation

Purpose:

- decide if the page has comment-like UGC at all

The page model should not start from scratch.

It should consume:

- top candidate probabilities
- candidate-count features
- page-global HTML signals

### Simple page decision algorithm

```text
Given candidate probabilities p1 >= p2 >= p3 ...
Compute page features:
  top1 = p1
  top2 = p2
  top3_mean = mean(p1, p2, p3)
  margin = p1 - p2
  candidate_count
  count_above_0_5
  count_above_0_7
  page_global_html_flags

Feed page features into:
  either threshold logic
  or a small logistic-regression page model
```

## Approach 6: Screenshot-assisted active labeling

Purpose:

- improve candidate labels quickly

This is the most practical refinement loop.

### Algorithm

```text
For each page:
  score all candidates
  keep top K candidates
  capture screenshot crop for each
  show screenshot + xpath + summary features to human reviewer
  label:
    correct UGC region
    not UGC
    uncertain
  store labels
  retrain candidate model periodically
```

This approach is valuable because it creates:

- hard negatives
- explicit positives
- better ranking supervision

## Candidate Model Feature Families

The candidate model should evaluate a feature array built from these families.

### 1. Repetition and sibling-family features

Examples:

- dominant wildcard-`xpath` family size
- repeated sibling family count
- sibling homogeneity ratio
- direct child count
- nested repeated family count
- reply depth
- repeated structure strength buckets

### 2. Unit-semantic coverage features

Examples:

- author coverage
- timestamp coverage
- avatar coverage
- reply-button coverage
- profile-link coverage
- reaction coverage
- quote/deleted/edit-history coverage

### 3. Text-distribution features

Examples:

- total text length
- words per region
- sentences per region
- relative-time coverage
- link density
- mention/hashtag/emoji counts

### 4. Composer/proximity features

Examples:

- textarea proximity
- contenteditable proximity
- submit-button presence
- load-more adjacency
- collapse/expand controls

### 5. Negative-control features

Examples:

- add-to-cart
- price density
- table structure
- header/navigation ancestry
- external-link proportion
- empty repeated units

## Where XPath Fits In The Plan

Use `xpath` for:

- sibling-family grouping
- wildcard repeated-unit detection
- candidate dedupe
- ancestor/descendant overlap removal
- screenshot targeting
- review-tool localization
- attaching human labels back to the same subtree

Do not depend on raw `xpath` alone to decide comment-ness.

The decision should come from:

- repetition derived from `xpath`
- sibling similarity features
- semantic UGC signals
- model score

## Model Shortlist

## Candidate model

Order of preference:

1. Logistic regression
2. Gradient-boosted trees
3. Linear SVM
4. Random forest
5. Learning-to-rank model

### Recommendation

Start with logistic regression first.

Move to boosted trees when:

- the dataset is larger
- labels are cleaner
- nonlinear interactions matter enough to justify extra complexity

Move to ranking models when:

- candidate-level labels are abundant
- we care primarily about top-1 or recall@K

## Page model

Order of preference:

1. threshold over top candidate score
2. logistic regression over candidate aggregates
3. boosted-tree page model

## Practical Algorithm Recommendation

If we were choosing one working system now, it would be:

### Candidate discovery

- use wildcard-`xpath` sibling repetition as the main upstream grouping signal

### Candidate feature construction

- derive repetition features from the sibling families
- add semantic, text, proximity, and negative-control features

### Candidate classification

- train logistic regression on the candidate feature array

### Page classification

- aggregate top candidate scores
- run a threshold or a small page-level logistic model

### Dataset improvement

- screenshot top candidates
- label them manually
- retrain

## Evaluation

Candidate metrics:

- top-1 accuracy
- recall@3
- PR-AUC
- precision / recall / F1

Page metrics:

- precision / recall / F1
- PR-AUC
- false-positive rate

Split policy:

- split by domain or eTLD+1

Reason:

- random row split leaks site templates

## Final Position

Your wildcard-`xpath` idea is valid and should be part of the detection stack.

The right way to use it is:

- upstream for repeated sibling-family detection
- downstream as derived features for the model
- as localization metadata for screenshot labeling

The model itself should then evaluate the feature array, not the raw tree-construction logic.

## Update Notes

Initial version added on `2026-03-27`.
