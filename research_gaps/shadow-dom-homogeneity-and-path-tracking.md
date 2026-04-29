# Shadow DOM: Homogeneity and Path Tracking Gaps

## 1. Homogeneity Across Shadow Roots

### How it works today

`feat_sibling_homogeneity_score` (`commentFeatures.js:1277`) calls `directChildren(root)`, which pierces one level into a shadow root via `getShadowRoot()`. This means a shadow host whose repeated children all live inside its shadow root is handled correctly:

```
<custom-element>
  #shadow-root
    <article>…</article>   ← visible to homogeneity calculation
    <article>…</article>
    <article>…</article>
```

The N identical `<article>` siblings are counted, the dominant signature is identified, and the score is proportional — this path works fine.

### The nested shadow host problem

When the repeated units are themselves shadow hosts, the calculation breaks down:

```
<custom-element>
  #shadow-root
    <comment-card>          ← shadow host (unit A)
      #shadow-root
        <div class="body">…
    <comment-card>          ← shadow host (unit B)
      #shadow-root
        <div class="body">…
```

The outer `<custom-element>` correctly sees N identical `<comment-card>` siblings and scores high homogeneity. But `dominantUnitGroup` (`commentFeatures.js:511`) only calls `directChildren()` on the outer host. The inner shadow root of each `<comment-card>` is evaluated independently and in isolation — its internal structure does not feed back into the outer homogeneity score.

`sigId` (`commentFeatures.js:~230`), which fingerprints element shape for comparison, only looks at local children. It does not recurse through nested shadow roots to build a deep signature. Two `<comment-card>` hosts that are visually and semantically identical but differ in their inner shadow tree — for example because a `<slot>` is filled differently in one instance — will produce different `sigId` values, causing homogeneity to undercount.

### Consequence

A repeating comment region where each repeated unit is a shadow host will produce a correct outer homogeneity score (the units themselves are structurally identical at the tag level), but the unit shape will be misidentified or fragile whenever internal shadow structure varies between instances. The system may fail to select the correct candidate root or may score it lower than deserved.

### What a fix would require

- A shadow-aware `sigId` that walks the composed tree (crossing open shadow boundaries recursively) to produce a deep structural fingerprint.
- A `dominantUnitGroup` that, when the dominant unit is itself a shadow host, optionally descends one additional shadow boundary to validate unit-shape consistency.
- Neither exists in the current codebase.

---

## 2. Path Tracking: Light DOM to Shadow DOM

### XPath format

`getXPath` (`commentFeatures.js:277`) walks `parentElement` normally until it hits a shadow boundary. At that point it inserts the synthetic segment `/#shadow-root` and jumps to the host element, continuing the walk up the light DOM:

```
/body/custom-element/#shadow-root/div/article[3]
```

Multiple shadow boundaries stack naturally:

```
/body/app-root/#shadow-root/comment-list/#shadow-root/article[2]
```

Sibling index notation (`[N]`) is only appended when there are multiple siblings of the same tag, consistent with standard abbreviated XPath.

### CSS path (parallel representation)

`getCssPath` (`commentFeatures.js:318`) builds a parallel path using `>>` as the shadow-piercing combinator:

```
body > app-root >> comment-list >> article:nth-of-type(2)
```

Both representations are stored on every candidate. They serve different purposes: the XPath is used for deduplication and ancestor checks; the CSS path is more readable and more suitable for human inspection or replay tools.

### Candidate discovery

`discoverCandidateRoots` (`commentFeatures.js:2096`) runs `deepQuerySelectorAll` with shadow piercing enabled, which crosses all open shadow roots during traversal. Each node that passes `looksLikeContainer` and has sufficient repetition structure (via `getCandidateStructureStats`) becomes a candidate. The XPath recorded at that point includes any `/#shadow-root` segments accumulated on the way up.

### Deduplication

`dedupeCandidates` (`scanner.js:1057`) uses the tuple `frame_url + xpath + css_path` as the deduplication key. Because XPath encodes shadow boundaries explicitly, candidates inside different shadow roots produce different keys and are never incorrectly collapsed.

Ancestor pruning uses `pathIsAncestor` (`commentFeatures.js:2064`), a string prefix check:

```
/div/#shadow-root/article   is an ancestor of   /div/#shadow-root/article[2]
/div/#shadow-root/article   is NOT an ancestor of   /div/section/article[2]
```

This correctly prevents selection of overlapping candidates within the same shadow tree.

### Limitations

| Limitation | Detail |
|---|---|
| Non-standard XPath | `/#shadow-root` is a synthetic marker. The generated path cannot be evaluated with `document.evaluate()` or any standard XPath engine on a live page. It is only usable internally for string comparison. |
| Open shadow roots only | `getShadowRoot()` can only pierce open shadow roots. Closed shadow roots are opaque; elements inside them are unreachable and produce no path segments. |
| No shadow context in features | `extractAllFeatures()` records `has_shadow_dom` to indicate whether the candidate node *is* a shadow host, but there is no feature indicating whether the node *lives inside* a shadow root. Depth of shadow nesting is also not recorded. |
| CSS path selector completeness | The `>>` CSS path uses `:nth-of-type()` for indexing, which does not account for complex slot assignments or part-based styling within shadow roots. |

---

## Combined Gap: Repeating Structures of Shadow Hosts

The two issues compound when a page uses a pattern common in modern component frameworks:

```
<comment-section>             ← shadow host, candidate root
  #shadow-root
    <comment-item>            ← shadow host (repeated unit)
      #shadow-root
        <div class="header">
        <div class="body">
        <div class="footer">
    <comment-item>
      #shadow-root
        …same structure…
```

- The outer `<comment-section>` is correctly discovered as a candidate because its shadow children repeat.
- Each `<comment-item>` appears identical at the tag level, so outer homogeneity scores well.
- But `sigId` for each `<comment-item>` is computed only from its tag and light-DOM attributes — not from its shadow children — so internal variation across instances is invisible to the scorer.
- The XPath for the candidate root correctly records the `/#shadow-root` boundary, but no feature captures that the repeating units are themselves shadow hosts, which would be a strong signal that the structure is component-driven and likely high value.

A complete fix requires both a composed-tree `sigId` and at least one new feature — something like `repeating_units_are_shadow_hosts` — so the model can weight this pattern appropriately.
