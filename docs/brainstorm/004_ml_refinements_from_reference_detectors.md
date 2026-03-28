# ML Refinements From Reference Detectors

This note captures what the older reference detectors add to the current strategy.

Reference files reviewed:

- `C:\Users\bobcumulus\WebstormProjects\comment_police\004_subgraphing\index_A.js`
- `C:\Users\bobcumulus\WebstormProjects\comment_police\004_subgraphing\index_B.js`
- `C:\Users\bobcumulus\WebstormProjects\comment_police\004_subgraphing\index_C.js`

This is not a pseudo-DOM design note. It is a modeling and feature-strategy note.

## Main conclusion

The reference detectors strengthen three parts of the current approach:

1. keyword detection should inspect more than the current reduced attribute blob
2. time/date detection should cover more relative and absolute formats
3. sibling similarity should not rely only on hashed structural signatures

The wildcard-`xpath` sibling-family approach is a strong anchor and should remain central.

## 1. Keyword Detection Should Be Broader

## What the older detector does well

`index_A.js` checks:

- direct text
- `class`
- `id`
- `aria-label`
- `title`
- all attribute names
- all attribute values

That is stronger than only checking a small fixed subset of attributes.

## Current gap

The current extractor mainly uses a reduced attribute blob:

- `className`
- `id`
- `role`
- `aria-label`
- `itemtype`
- `data-testid`

That misses useful signals such as:

- custom `data-*` names and values
- `itemprop`
- `name`
- `rel`
- `title`
- `alt`
- non-standard framework attributes
- keyword-bearing attribute names, not just values

## Recommended refinement

Add a broader normalized attribute text source for keyword features.

For each element, build:

- tag name
- `class`
- `id`
- all attribute names
- all attribute values

Then derive:

- high-confidence keyword hit
- medium-confidence keyword hit
- low-confidence keyword hit
- keyword in tag name
- keyword in attribute name
- keyword in attribute value
- keyword in short direct text

## Recommended keyword families

High-confidence:

- `comment`
- `comments`
- `commenter`
- `commentlist`
- `comment-list`
- `commentthread`
- `comment-thread`
- `reply`
- `replies`
- `discussion`
- `thread`
- `forum`
- `review`
- `reviews`
- `answer`
- `answers`
- `feedback`

Medium-confidence:

- `post`
- `message`
- `messages`
- `response`
- `conversation`
- `community`
- `topic`
- `reaction`
- `remark`
- `note`

Low-confidence:

- `item`
- `entry`
- `block`
- `card`
- `unit`
- `feed`
- `list`

## Recommended rules

Use stronger weighting when:

- keyword occurs in attribute name
- keyword occurs in `id`
- keyword occurs in `class`
- keyword occurs in short direct text
- the same keyword family appears across repeated siblings

Use lower weighting when:

- keyword is generic like `item`, `entry`, or `list`

## Important modeling rule

Do not feed the full raw attribute blob into the first model.

Instead feed derived features like:

- `keyword_attr_name_high`
- `keyword_attr_value_high`
- `keyword_tag_name_high`
- `keyword_direct_text_high`
- `keyword_repeated_sibling_coverage`

That keeps the model generalizable.

## 2. Time And Date Detection Should Be Expanded

## What the older detector does well

`index_A.js` covers:

- relative age text
- shorthand relative age
- explicit `time` tag
- timestamp-like attributes
- absolute numeric dates
- month-name dates

That is broader than the current relative-time-only text check.

## Current gap

The current extractor already handles:

- `time[datetime]`
- text like `2 days ago`
- `just now`
- `yesterday`
- shorthand like `5h`

But it should be extended to include more variants.

## Recommended relative-time coverage

Support these forms:

- `just now`
- `today`
- `yesterday`
- `1 second ago`
- `4 seconds ago`
- `1 sec ago`
- `45 sec ago`
- `1 minute ago`
- `12 minutes ago`
- `1 min ago`
- `30 mins ago`
- `1 hour ago`
- `5 hours ago`
- `1 hr ago`
- `6 hrs ago`
- `1 day ago`
- `3 days ago`
- `1 week ago`
- `2 weeks ago`
- `1 month ago`
- `4 months ago`
- `1 year ago`
- `2 years ago`
- shorthand forms:
  - `5s`
  - `12m`
  - `4h`
  - `3d`
  - `2w`
  - `7mo`
  - `1y`

## Recommended absolute-date coverage

Support these forms:

- `2026-03-27`
- `2026/03/27`
- `03/27/2026`
- `27/03/2026`
- `March 27, 2026`
- `Mar 27, 2026`
- `27 March 2026`
- `27 Mar 2026`
- `March 27`
- `27 March`

## Recommended attribute coverage for timestamps

Check:

- `datetime`
- `title`
- `aria-label`
- `data-time`
- `data-date`
- `data-timestamp`
- `data-created`
- `data-epoch`
- `timeago`

## Recommended derived features

Instead of only a boolean, add:

- `has_relative_time_text`
- `has_absolute_date_text`
- `has_timestamp_attribute`
- `timestamp_signal_count`
- `units_with_time_signal`
- `time_signal_coverage`

These are better model inputs than one broad flag.

## 3. Similar Sibling Detection Should Be Hybrid

## What the older detector does well

`index_B.js` gives a clean grouping method:

- `parentXPath`
- `xpathStar`
- same-tag sibling grouping under one parent

`index_C.js` adds a stronger structural support method:

- choose a median sibling as reference
- match corresponding descendant nodes inside sibling copies
- use support threshold across the group
- use child-tag containment as a tie-break

That is materially stronger than relying only on a hashed child-tag signature.

## Current gap

The current extractor uses:

- `structuralSignature`
- hashed `sigId`
- dominant child group by `sigId`

That is useful, but it can fail when:

- sibling nodes are mostly similar but not identical
- one sibling has an extra wrapper
- one sibling has an extra badge/button
- reply depth causes mild local divergence
- hash equivalence is too strict

## Recommended sibling strategy

Use a hybrid approach in this order:

### Primary anchor

- wildcard `xpath` sibling family

This answers:

- which nodes are same-tag siblings under the same parent

### Secondary structure check

- child-tag histogram similarity
- direct child count similarity
- subtree size similarity
- local action pattern similarity
- metadata similarity

This answers:

- whether the siblings behave like the same repeated unit family

### Tertiary support scoring

Use a median-sibling reference method similar to `index_C.js`:

1. choose the median subtree-sized sibling as reference
2. walk its descendants
3. try to match each reference node inside every sibling copy
4. measure support ratio
5. mark substructure as shared if support exceeds threshold

## Recommended derived similarity features

Add or strengthen:

- `xpath_star_family_size`
- `xpath_star_family_count`
- `dominant_xpath_star_ratio`
- `median_sibling_subtree_size`
- `subtree_size_variance`
- `child_tag_histogram_similarity_mean`
- `child_tag_histogram_similarity_min`
- `repeated_substructure_support`
- `nested_repeated_substructure_support`
- `same_tag_sibling_count`
- `same_parent_sibling_count`

## Recommended rule

Treat wildcard-`xpath` as the first grouping step.

Treat structural signature hash as only one feature among several, not the final arbiter of similarity.

## 4. Direct-Text Features Are Useful

## What the older detector does well

`index_A.js` frequently uses direct text only, not full descendant text, for:

- keyword detection
- microaction detection
- timestamp detection

That matters because container text can be polluted by descendant content.

## Recommended refinement

Use both:

- `direct_text_*` features
- `subtree_text_*` features

Examples:

- `direct_text_word_count`
- `direct_text_has_keyword`
- `direct_text_has_timestamp`
- `direct_text_has_microaction`
- `subtree_text_word_count`
- `subtree_link_density`

This helps separate:

- a container label like `Comments`
- from the full text content of all repeated units

## 5. Microaction Detection Can Be More Robust

## What the older detector does well

`index_A.js` checks:

- clickable tag type
- `role`
- `onclick`
- `aria-label`
- `title`
- `alt`
- direct text
- all attributes

That is strong for actions such as:

- reply
- quote
- like
- upvote
- report
- share
- edit

## Recommended refinement

Current action features are already good, but they should also consider:

- attribute-name matches
- attribute-value matches
- icon/button labels from `title` and `alt`
- short direct text labels

Recommended derived features:

- `reply_action_attr_match`
- `reaction_action_attr_match`
- `moderation_action_attr_match`
- `share_action_attr_match`
- `microaction_token_count`
- `microaction_token_diversity`

## 6. Group Suspicion Should Combine Structure And Semantics

## What the older detector does well

`index_C.js` does not blindly cluster every repeated sibling family.

It first asks whether a group looks comment-like using:

- related keyword features on sibling roots
- fallback string heuristics on `xpathStar`

That is a good idea.

## Recommended refinement

When deciding whether a repeated sibling family is worth promoting to a candidate container, combine:

- repeated-family size
- sibling homogeneity
- repeated UGC keyword presence
- time/author/action coverage

That is better than promoting all large repeated groups.

## Recommended candidate-promotion score

A repeated sibling family becomes a strong candidate if:

- family size is at least `3` or `4`
- dominant sibling ratio is high
- at least one strong keyword signal is present
- at least one of these has useful coverage:
  - author
  - timestamp
  - reply action
  - avatar
  - profile link

## 7. What To Change In Strategy

The strategy should be updated in these ways.

### Keep

- wildcard-`xpath` grouping
- repeated sibling families
- candidate scoring from extracted features
- screenshot-based human review

### Strengthen

- broaden keyword matching to all attributes and tag names
- broaden date/time detection to more absolute and relative formats
- add direct-text-specific features
- treat signature/hash similarity as secondary, not primary
- add median-reference support scoring for sibling-family consistency

### Avoid

- using raw absolute `xpath` as a learned model feature
- depending only on a hashed structural signature
- using only subtree text when local node text is more discriminative

## Refined Detection Stack

Use this order:

1. candidate containers are proposed upstream
2. sibling families are grouped by wildcard `xpath`
3. sibling-family similarity is validated by hybrid structural support
4. keyword, time, author, avatar, and microaction features are computed
5. negative-control features are computed
6. candidate model scores each region
7. top candidates are screenshotted and labeled
8. labels are fed back into training

## Final position

The attached files support your current `xpath[*]` direction.

The main refinement is not to replace wildcard-`xpath`, but to make it stronger by pairing it with:

- broader keyword coverage
- richer date/time coverage
- direct-text-local features
- median-reference structural support

That gives a better definition of "similar siblings" than either raw `xpath` alone or hash signatures alone.

## Update notes

Initial version added on `2026-03-27`.
