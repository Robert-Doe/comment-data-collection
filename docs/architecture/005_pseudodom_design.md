# PseudoDOM Design

Date: `2026-03-30`

---

## 1. What The PseudoDOM Is

The PseudoDOM is a lightweight parallel representation of the page
state built from intercepted sink calls and selective live-DOM seeding
when needed. It is not a second browser DOM. It exists to preserve the
information the security pipeline needs before dangerous content is
committed to the live tree.

It serves four roles:

1. **Analysis substrate**
   Stable structure for candidate generation and feature extraction

2. **Mutation history**
   Ordered record of sink invocations, inserted values, and targets

3. **Security context**
   Input to the bootstrap and selective gates

4. **Research artifact**
   Serializable state for debugging, labeling, and paper figures

---

## 2. Why A PseudoDOM Is Necessary

Directly querying the live DOM is insufficient because:

- the page may still be mutating while features are extracted
- security-relevant information such as raw inserted strings is lost
  after parsing
- repeated live traversal is expensive
- a persisted artifact is needed for labeling and reproducibility

The PseudoDOM provides a sink-aware, pre-live view of the evolving
structure.

---

## 3. Data Model

### PseudoNode

```typescript
interface PseudoNode {
  id: string;
  tag: string;
  namespace: string | null;
  attributes: Record<string, string>;
  directText: string | null;
  children: string[];
  parentId: string | null;
  depth: number;
  insertedAt: number;
  mutationType: MutationType;
  frameKey: string;
  isShadowRoot: boolean;
  shadowMode: 'open' | 'closed' | null;
}
```

### MutationEvent

```typescript
interface MutationEvent {
  seq: number;
  type: MutationType;
  targetId: string | null;
  insertedId: string | null;
  removedId: string | null;
  rawValueKind: 'none' | 'text' | 'html' | 'attr';
  rawValuePreview: string | null;
  timestamp: number;
  callSite: string | null;
}
```

### PseudoDOM

```typescript
class PseudoDOM {
  nodes: Map<string, PseudoNode>;
  mutations: MutationEvent[];
  ugcRegionMap: Map<string, number>;
  frameRoots: Map<string, string>;
  candidateRoots: Set<string>;

  recordMutation(...args): void;
  importExistingNode(node: Node): string;
  getSubtree(rootId: string): PseudoNode[];
  extractFeatures(rootId: string): FeatureVector;
  serialize(mode: 'research' | 'redacted'): SerializedPseudoDOM;
}
```

The addition of `rawValueKind`, `candidateRoots`, and redacted
serialization makes the structure more useful for both security and
privacy-aware artifact generation.

---

## 4. Construction Strategy

### 4.1 Initial seeding for SSR-heavy pages

For pages whose initial structure is largely present after parse, the
system seeds the PseudoDOM from the live DOM at a controlled point,
typically near `DOMContentLoaded`.

These nodes are tagged as `initialParse` rather than being treated as
runtime sink insertions.

### 4.2 Incremental construction for SPA-heavy pages

For pages that are built mainly through runtime mutation sinks, the
PseudoDOM is grown directly from intercepted sink calls. This is the
primary case for the paper's security story.

### 4.3 Context-sensitive detached parsing for string sinks

Earlier notes used a generic `DOMParser` narrative. That is not
sufficiently faithful to sink context. The revised design is:

- use an inert `template` element for generic HTML fragments
- use `Range#createContextualFragment` when the destination context
  matters
- use specialized containers for table-sensitive or namespace-aware
  content where needed
- never attach the fragment to the live DOM before the gate decides

This gives the security pipeline a closer approximation to actual sink
behavior without executing the content.

### 4.4 Node and fragment insertion semantics

For node-based sinks, the PseudoDOM imports the referenced subtree and
records:

- whether the node was created earlier in the same page
- whether it belongs to a detached fragment
- whether it introduces executable structure such as scripts,
  event-handler attributes, or namespace-sensitive elements

---

## 5. Node Identity Strategy

The preferred strategy remains a wrapper-local `WeakMap`:

```javascript
const nodeIds = new WeakMap();
let nextId = 0;

function getNodeId(node) {
  let id = nodeIds.get(node);
  if (!id) {
    id = `pn_${nextId++}`;
    nodeIds.set(node, id);
  }
  return id;
}
```

This avoids polluting the live DOM with synthetic attributes and keeps
identity local to the instrumentation layer.

---

## 6. Candidate-Generation Support

The PseudoDOM is not only for feature extraction after a candidate is
already known. It must actively support candidate discovery.

The candidate generator uses PseudoDOM state to identify:

- repeated sibling families
- ancestors that dominate those families
- containers near semantic anchors
- composer-adjacent repeated structures
- newly emerged repeated structures after route transitions

Candidate roots are tracked explicitly so the classifier can re-score
only the affected region rather than the full page on every mutation.

---

## 7. Feature Extraction From PseudoDOM

Feature extraction is intentionally live-DOM-light:

- structure from `children`, `parentId`, and depth
- semantics from tags, attributes, and short direct text
- chronology from mutation order and timestamp signals
- composer proximity and interaction cues from nearby controls

This keeps the classifier portable and allows feature re-extraction
from serialized snapshots.

---

## 8. Serialization And Privacy Controls

The earlier notes emphasized persistence but not data minimization.
The paper needs both.

### Research serialization

Includes:

- nodes and structural relationships
- mutation metadata
- selected short text previews
- candidate scores and labels

### Redacted serialization

Used for safer artifact release and possibly production diagnostics:

- strips or hashes full text
- retains structural features and short normalized previews only
- removes unnecessary raw attribute values

This distinction should flow into the privacy section of the paper.

---

## 9. PseudoDOM Versus MutationObserver

The key difference remains timing:

| Property | PseudoDOM from sink wrapping | MutationObserver |
|---|---|---|
| Timing | Before commit to covered sinks | After mutation |
| String visibility | Raw sink input available | Already parsed result only |
| Gate support | Can block or sanitize | Can only react |
| Sink identity | Known exactly | Inferred after the fact |

MutationObserver remains useful only as a supplemental stability and
consistency signal.

---

## 10. Shadow DOM And Frames

Shadow roots and frames are represented explicitly because both matter
for modern pages.

- `attachShadow` creates a shadow-root node in the PseudoDOM
- subtree features can either include or separately summarize shadow
  content
- frame roots are keyed separately to avoid mixing unrelated trees

Frame handling still depends on the platform's injection coverage and
must be reported as part of the timing study.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised to replace generic detached parsing with context-sensitive
  inert parsing and to add privacy-aware serialization: `2026-03-30`
- Status: data model and construction story are now aligned with the
  publication plan
