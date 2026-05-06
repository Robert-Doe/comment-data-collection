# Feature Family Breakdown

The keyword-aware runtime bundle uses 73 curated features split across 9 families. The key point is that keyword signals are only one family among several. The model is structurally driven, not keyword-only.

## Family Counts

| Family | Count | What It Captures |
| --- | ---: | --- |
| structure | 8 | Root container shape, role, depth, and basic DOM identity |
| repeated_blocks | 14 | Repeated sibling families, homogeneity, and nested reply structure |
| text_body | 7 | Whether the candidate actually contains useful authored text |
| lexical_keywords | 10 | Direct comment, review, reply, and forum wording |
| semantic_markup | 8 | Schema.org, ARIA, microdata, and JSON-LD signals |
| author_time_identity | 7 | Author, avatar, timestamp, and profile markers |
| interaction_controls | 9 | Reply, composer, load-more, share, and moderation controls |
| negative_controls | 7 | Commerce, navigation, table, and other false-positive suppressors |
| context | 3 | Page-level context such as source mode and blocker state |

## How The Model Breaks Down The Candidate

The model is really doing layered reasoning:

1. It asks what the root container looks like.
2. It asks whether that root contains repeated sibling blocks.
3. It checks whether those blocks have real text, author, and time signals.
4. It checks whether the region is explicitly named with comment-like language.
5. It checks whether semantic markup says the same thing.
6. It checks whether the surrounding page supports a discussion/composer workflow.
7. It suppresses common false positives such as tables, commerce cards, and nav regions.

That progression is what makes the model more than a keyword matcher.

## What The Runtime Reliance Summary Says

The runtime bundle ranks families in this order:

1. repeated_blocks
2. structure
3. text_body
4. context
5. lexical_keywords
6. author_time_identity
7. negative_controls
8. interaction_controls
9. semantic_markup

That tells us two important things:

- repeated structure is the backbone
- keywords help, but they are not the only thing carrying the model

## The Strongest Signs In Practice

The model tends to benefit from combinations like these:

- repeated blocks plus text-bearing units
- author markers plus timestamps
- nearby composer controls plus repeated reply affordances
- explicit lexical hints plus semantic markup

This is the healthy path to a positive prediction.

## The Main Suppressors

The model should push away candidates that look like:

- tables or tabular rows
- product or commerce cards
- nav or header furniture
- link-heavy directories
- empty repeated wrappers with little authored text

Those suppressors matter because many false positives are structurally repetitive, but not actually user discussion.

## What Makes This Model Better Than A Simple Heuristic

A heuristic can say "this looks repetitive" or "this says comment." The logistic model can combine all of the above at once:

- repeated structure
- authored text
- author and time identity
- interaction controls
- semantic hints
- negative controls

That combined view is the reason the model is already useful enough to drive candidate ranking.
