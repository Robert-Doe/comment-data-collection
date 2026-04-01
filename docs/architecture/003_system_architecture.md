# System Architecture

Date: `2026-03-30`

---

## 1. Architecture Overview

PseudoDOM-Guard has two deployment modes that share the same core
pipeline:

- **Extension mode**
  Always-on protection path intended for ordinary browsing

- **Measurement mode**
  Research and evaluation path that additionally uses debugger-backed
  instrumentation for stronger timing visibility and richer artifacts

The architecture is best understood as six cooperating layers:

1. Early injection
2. Sink interposition and hardening
3. PseudoDOM construction
4. Candidate generation and ranking
5. UGC-region map maintenance
6. Two-stage mutation gate

---

## 2. Deployment Modes

### Extension mode

This is the user-facing mode:

- content script injected at `document_start`
- main-world sink wrapping where the platform permits
- no debugger attachment required
- no persistent page-content storage by default

This mode is the main deployability claim of the paper.

### Measurement mode

This is the research mode:

- debugger-backed early script injection
- optional response inspection before parse
- frame and child-target instrumentation
- richer logging, screenshots, and serialized PseudoDOM exports

This mode is useful for timing studies, dataset creation, and artifact
generation. It should not be conflated with the always-on deployment
story.

---

## 3. Layer 1 - Early Injection

### Purpose

Install the wrapper before the page obtains useful references to the
original sinks.

### Mechanisms

**Extension mode**
- declarative or registered content script at `document_start`
- injection into the page's main world when needed for prototype
  interposition

**Measurement mode**
- debugger-backed `Page.addScriptToEvaluateOnNewDocument`
- optional automatic attachment to relevant child targets

### Design stance

The paper should treat timing as an empirical question. Chrome's
documented behavior is encouraging, but the submission needs measured
success rates and a failure taxonomy rather than a hand-waved
"guarantee."

---

## 4. Layer 2 - Sink Interposition And Hardening

### Purpose

Interpose on the DOM sinks that turn strings or node subtrees into
live executable or structurally significant DOM content.

### Covered sink families

**Node mutation methods**
- `appendChild`
- `insertBefore`
- `replaceChild`
- `removeChild`

**Element mutation methods**
- `append`
- `prepend`
- `before`
- `after`
- `replaceWith`
- `replaceChildren`
- `insertAdjacentHTML`
- `insertAdjacentElement`
- `setAttribute`
- `setAttributeNS`
- `removeAttribute`

**Property setters**
- `innerHTML`
- `outerHTML`

**Document-level APIs**
- `write`
- `writeln`
- `createElement`
- `createElementNS`
- `createTextNode`
- `createDocumentFragment`
- `importNode`
- `adoptNode`

**Shadow DOM**
- `attachShadow`

### Hardening principles

- capture original descriptors and functions in closure scope
- expose only wrapped versions to the page
- prefer non-reconfigurable replacements where compatible
- log integrity violations and descriptor tampering attempts

This is best-effort hardening. It is not claimed to defeat a malicious
origin that actively attacks the wrapper.

---

## 5. Layer 3 - PseudoDOM Construction

### Purpose

Maintain a lightweight parallel representation of the evolving DOM
before suspicious content reaches the live tree.

### Inputs

Each intercepted call contributes:

- sink type
- target node identity
- inserted node or raw string
- timestamp and mutation sequence
- optional call-site metadata in research mode

### Output

The PseudoDOM provides:

- subtree structure for candidate generation
- sink-aware context for security checks
- mutation histories for analysis and replay
- serializable artifacts for labeling and debugging

---

## 6. Layer 4 - Candidate Generation And Ranking

### Purpose

Find a small set of DOM subgraphs worth scoring as possible UGC roots.

### Candidate generation

Candidate roots are proposed from:

- repeated sibling families above a minimum cardinality
- ancestors of semantic anchors such as comment or review markers
- composer-adjacent containers
- new repeated structures that emerge during SPA route transitions

Candidate generation is important enough to be explicit in the paper.
The model cannot rank what the system never proposes.

### Ranking

Each candidate receives a score from the UGC model based on structural,
semantic, author, time, action, composer, and negative-control
features. The result is a ranked list rather than a single binary
decision made in isolation.

---

## 7. Layer 5 - UGC Region Map Maintenance

### Purpose

Maintain a map from observed nodes to UGC likelihood as the page
stabilizes or changes.

### Classification timing

The classifier runs in two situations:

1. **Initial stabilization**
   At `DOMContentLoaded` or after a short settle delay on SSR-heavy
   pages

2. **Incremental emergence**
   When SPA transitions or deferred API responses create new repeated
   content structures

### Region states

For gating purposes, nodes may be in one of three states:

- `unknown`
- `low-confidence UGC`
- `high-confidence UGC`

This matters because protection policy differs before and after the
map has stabilized.

---

## 8. Layer 6 - Two-Stage Mutation Gate

### Stage A - Universal bootstrap precheck

Before the region map is stable, apply a cheap precheck to all
high-risk sink writes, especially:

- string-to-HTML sinks
- event-handler attribute writes
- `javascript:` URL assignments
- script-node construction and activation
- `document.write`

The bootstrap gate is intentionally conservative. It aims to stop
obvious dangerous payloads without fully classifying the page.

### Stage B - Selective UGC-aware gate

Once the region map exists:

- high-confidence UGC targets receive the full precheck
- low-confidence targets receive a lighter policy
- non-UGC targets pass with minimal overhead unless the sink is
  inherently high risk

### Decisions

For each covered sink write, the gate may:

- `pass`
- `sanitize`
- `block`
- `log for analysis`

The exact policy can differ between measurement mode and protection
mode.

---

## 9. SSR And SPA Handling

### SSR pages

- seed the PseudoDOM from the already-built live DOM after parse
- classify candidate roots once enough structure exists
- continue intercepting later dynamic updates

### SPA pages

- rely on sink interposition from the beginning
- construct the PseudoDOM incrementally
- run the bootstrap gate before UGC localization is stable
- promote to selective gating as candidate confidence improves

This explicit bootstrap story closes a gap in the earlier notes.

---

## 10. Data Collection Mode Versus Protection Mode

### Data collection mode

- pass or sanitize based on experimental policy
- persist feature vectors and selected artifacts
- capture screenshots for candidate review
- store richer mutation metadata

### Protection mode

- minimize stored content
- retain only security-relevant logs
- avoid persisting full raw text by default

This distinction is important for the privacy section of the paper.

---

## 11. Component Summary

| Component | Where it runs | Responsibility |
|---|---|---|
| Early injector | Extension and/or debugger path | Install wrappers |
| Sink wrapper | Page main world | Interpose on DOM sinks |
| PseudoDOM | Page main world | Parallel structural state |
| Candidate generator | Page main world | Propose UGC roots |
| UGC classifier | Page main world or extension-assisted path | Score candidates |
| Region map | Page main world | Track UGC confidence |
| Mutation gate | Page main world | Pass, sanitize, or block |
| Review tooling | Extension UI / local tools | Human labeling |

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised for deployment clarity and bootstrap handling: `2026-03-30`
- Status: architecture note now separates research-mode instrumentation
  from the deployable extension path
