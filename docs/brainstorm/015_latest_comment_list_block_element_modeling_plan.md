# Comment List, Block, And Block Element Modeling Plan

Date:

- `2026-03-29`

This is the current active brainstorm note.

## Why this note exists

Before building models, the system needs a cleaner statement of what it is actually trying to detect.

That matters because the project currently talks about `candidates`, `comment regions`, `lists`, `repeated units`, and `text leaves`.

Those terms are related, but they are not identical.

This note locks down three things before model construction:

1. the detection hierarchy: comment list vs comment block vs comment block element
2. the first model variants: keyword-aware vs keyword-ablated
3. the modeling consequence of repeated structures for future single-block detection

## The three-level detection hierarchy

The current project naturally has three different structural levels.

## Level 1: Comment List

Definition:

- the container that holds repeated user-generated units

Examples:

- comment list under a post
- forum reply list
- review list on a product page
- Q&A thread container

In the current system, this is the main candidate target.

That means:

- candidate roots are usually `comment list` candidates
- candidate screenshots are list-level screenshots
- candidate ranking is primarily list-level ranking

## Level 2: Comment Block

Definition:

- one repeated unit inside the list

Examples:

- one comment card
- one forum reply
- one product review card
- one Q&A answer block

A comment block usually contains:

- author
- timestamp
- comment text
- reply or action controls
- engagement controls

In the current extractor, these are typically the dominant repeated child family inside a candidate list.

## Level 3: Comment Block Element

Definition:

- the textual leaf or near-leaf inside a comment block that contains the actual user-authored opinion, comment, review, or reply content

Examples:

- the text node or wrapper containing the actual comment text
- the paragraph or text wrapper that contains the review body
- the main text region of a forum reply

What is not a comment block element in this terminology:

- the author name
- the timestamp
- the reply button
- the avatar image
- other metadata or control nodes that sit beside the actual user text

This is the most granular level.

It is useful for explanation and perhaps later fine-grained labeling, but it is not the right first model target.

## What the current system is actually doing

The current code is already much closer to the right hierarchy than it might appear at first.

In [src/commentFeatures.js](../../src/commentFeatures.js):

- candidate discovery is container-oriented
- repeated child grouping is derived from dominant sibling families
- `unit_count` refers to repeated units inside the candidate
- the cropped candidate screenshots are usually list-level crops

So the current practical meaning is:

1. detect a comment-list candidate
2. infer the repeated comment-block family inside it
3. use block-level evidence to decide whether the list is a real comment list

That is a defensible design.

## Important modeling consequence

The first model should stay list-first.

That means the initial training label should still answer:

- is this candidate region the true comment list or not?

Why this is correct:

- that matches the current review UI
- that matches the current screenshots
- that matches how candidate discovery already works
- that gives the most stable supervision first

## Why block-level thinking still matters

Even though the first target is list-level, the model should learn from block-level regularities.

That is because a real comment list is not just "a box with keyword text."

It is a container whose repeated children usually behave like comment blocks.

Those repeated blocks often share:

- author markers
- time markers
- reply controls
- profile links
- avatar layout
- text-bearing bodies
- engagement elements

So the list detector should rely heavily on repeated block evidence.

## Why this matters for future single-block detection

Your observation is important:

- if we learn what repeated comment blocks look like inside lists
- we can later use that knowledge to detect pages where only a single comment block is visible

This is the bridge between:

- list detection now
- single-block detection later

The logic is:

1. repeated comment lists provide cleaner supervision
2. repeated comment blocks reveal the block structure more reliably
3. those block patterns can later be reused to detect isolated single blocks

So repeated lists are not only the main detection target.

They are also the training ground for future block-level detectors.

## Recommended ontology for this repo

To avoid confusion, the project should use the following stable meanings:

- `candidate` = usually a comment-list candidate
- `unit` = usually a comment block inside that list
- `element` = the specific text-bearing subpart inside the block that carries the user's actual message

That matches both the current code and your conceptual framing.

## First modeling target

The first ML model should be:

- a list-level candidate reranker or classifier

Input:

- one candidate list region at a time

Target:

- `comment_list` vs `not_comment_list`

Supervision source:

- current candidate review labels, where `comment_region` is treated as the positive list-level label

Why not start with block-level or element-level training:

- current labels are already list-centric
- current screenshots are already list-centric
- list-level supervision is easier to collect consistently

## Where block-level information enters the model

Even if the label is list-level, many of the strongest features should be block-derived.

Examples:

- repeated sibling count
- sibling homogeneity
- author/timestamp colocation across units
- reply-button coverage across units
- avatar coverage across units
- reaction or engagement coverage across units

These are effectively "how comment-block-like are the repeated units?" signals.

That is exactly the bridge we want.

## Two model variants to build

The project should build two parallel variants from the start.

## Variant A: Keyword-aware model

Purpose:

- use the full feature set, including keyword-driven evidence

This model includes:

- keyword features
- semantic markup features
- structural features
- interaction features
- negative-control features

Expected advantage:

- strong performance on pages with explicit lexical cues

Risk:

- the model may lean too hard on obvious words like `comment`, `reply`, or `review`
- this can inflate apparent performance on familiar templates and reduce generalization

## Variant B: Keyword-ablated model

Purpose:

- remove direct keyword-family dependence and test how much the system can learn from structure and interaction alone

This model should exclude the clearly lexical keyword family, such as:

- `comment_header_with_count`
- `attributes_contain_keywords`
- `keyword_container_*`
- `keyword_text_*`
- `keyword_direct_text_*`
- `keyword_attr_name_*`
- `keyword_attr_value_*`
- `keyword_unit_*`
- `keyword_tag_name_*`
- `submit_button_keyword_*`
- raw route or script keyword hints where they are basically lexical shortcuts

This model should still keep non-lexical semantic and structural evidence such as:

- schema.org comment or review markup
- ARIA roles
- repeated-unit structure
- author/timestamp/reply coverage
- negative controls

Expected advantage:

- better test of whether the model truly understands comment-like structure

Expected risk:

- lower raw accuracy on easy cases where keywords are genuinely helpful

## Why both variants are necessary

This is not extra work for the sake of curiosity.

It answers a real modeling question:

- are keywords genuinely helping in a robust way, or are they acting like a shortcut that hides weak structural learning?

Possible outcomes:

### Outcome 1: Keyword-aware model clearly wins everywhere

Interpretation:

- keywords are genuinely useful
- structural features alone are not enough yet

Action:

- keep the keyword-aware model, but watch domain-split generalization carefully

### Outcome 2: Keyword-aware model wins on in-domain data, but not on held-out domains

Interpretation:

- keyword dependence is creating overfitting

Action:

- reduce keyword weight
- prefer the keyword-ablated or keyword-limited variant

### Outcome 3: Keyword-ablated model stays competitive

Interpretation:

- structural and interaction evidence is doing real work
- the model is learning something more generalizable

Action:

- treat this as a strong sign that the feature set is on the right path

## Algorithms that help us inspect feature reliance

You asked for algorithms that help reveal what the detector really relies on.

That is the right requirement.

The first algorithm set should therefore prioritize interpretability and feature analysis, not just raw benchmark scores.

## Recommended algorithm pair

### 1. Logistic regression

Why use it:

- simple baseline
- coefficients are easier to inspect
- useful for seeing broad directional effects of features

What it tells us:

- which features tend to push predictions toward positive or negative

Limitation:

- it may underfit complex nonlinear interactions

### 2. Gradient-boosted trees

Candidates:

- LightGBM
- XGBoost
- CatBoost

Why use them:

- strong on mixed tabular data
- capture nonlinear interactions
- usually much stronger than linear models on structured feature sets

What they tell us:

- feature importance
- gain-based importance
- split usage
- SHAP-style local explanations later if needed

This combination is practical:

- logistic regression for transparency baseline
- boosted trees for stronger tabular performance

## What "feature reliance" should mean in practice

We should not settle for one vague feature-importance chart.

We should ask at least four questions:

1. Which feature families dominate the keyword-aware model?
2. Which feature families dominate the keyword-ablated model?
3. Which features matter on held-out domains, not just familiar ones?
4. Which features matter when the model is right on hard pages that lack obvious lexical cues?

That is the more meaningful version of "what does the detector really rely on?"

## Recommended feature-family comparison

During experiments, compare importance at the family level, not only individual columns.

Families to compare:

- lexical keyword family
- semantic markup family
- repeated-structure family
- author and timestamp family
- interaction-control family
- negative-control family

This is much easier to reason about than hundreds of small columns in isolation.

## Evaluation plan for the two variants

Both model variants should be evaluated on the same domain-split benchmark.

Compare:

- candidate precision
- candidate recall
- top-1 accuracy
- recall@3
- false positive page rate
- manual-review rate

Also compare failure buckets:

- pages with obvious keywords
- pages with weak or missing keywords
- pages from manual snapshots
- forum-like pages
- review-like pages
- Q&A-like pages

This matters because a keyword-heavy model may look strong overall while failing exactly on the more general or hidden-comment layouts we care about.

## How this relates to human labeling

Human labeling should continue to target the list level first.

That means:

- reviewers keep marking the correct candidate list region
- not the text leaf
- not one isolated comment block

Why:

- this matches the current candidate review UI
- it is more consistent and faster to label
- it keeps the dataset aligned with the actual candidate generator

Later, if needed, block-level labeling can be added as a second layer.

## Proposed later block-level extension

Once the list-level model is stable, a second dataset can be constructed from repeated units inside positive comment lists.

That later dataset could support:

- comment-block detection
- single-block detection on pages where only one visible comment or review card exists

The key idea would be:

- positive list candidates provide repeated positive block examples

That means the list detector is not wasted effort.

It becomes the path to block supervision.

## Proposed future single-block strategy

A plausible later strategy is:

1. detect positive comment lists reliably
2. extract their repeated dominant units as candidate comment blocks
3. use those units as training examples for a block-level classifier
4. apply the block-level classifier on pages where repeated lists are absent or weak

This is a much stronger path than trying to train single-block detection from scratch immediately.

## Important guardrail

The first model should not drift into block-element detection.

That would mean trying to predict:

- the exact text node
- the exact paragraph
- the exact leaf wrapper

That is too fine-grained for the current labeling setup.

For now:

- list = first model target
- block = future secondary target
- block element = explanation-level structure, not first-model target

## Practical recommendation before implementation

Before writing training code, the team should adopt these explicit rules:

1. The first supervised target is list-level.
2. Current `comment_region` labels are interpreted as list-level positives.
3. Repeated-unit features are treated as block evidence supporting list detection.
4. Two variants are always trained:
   - keyword-aware
   - keyword-ablated
5. All evaluations are run on domain splits, not random candidate splits.

## Immediate next implementation tasks

1. Build a candidate-level training export.
2. Add a feature-family switch so keyword-family columns can be included or excluded cleanly.
3. Train logistic regression for both variants.
4. Train one boosted-tree model for both variants.
5. Compare feature-family importance between the two.
6. Review failure examples where the two variants disagree.

## Working thesis

The current candidate system should be understood as a `comment list` detector that uses repeated `comment block` evidence.

That is good.

It means:

- the present model target is stable
- the current features are meaningful
- the future path toward single-block detection is already visible

The best immediate modeling plan is therefore:

- build two list-level candidate models
- one with keyword-family features
- one without keyword-family features
- inspect which evidence families actually drive robust detection

## Update note

This file should lose `latest` in its name when a newer brainstorm note is created.
