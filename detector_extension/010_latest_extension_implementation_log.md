# Extension Implementation Log

Date: `2026-03-29`

This note records every significant implementation decision made
during the first build of the PseudoDOM Guard extension.
It is the companion to the architecture notes in this folder.

---

## 1. File Structure

```
extension/
├── manifest.json
├── src/
│   ├── background.js             ← Service worker (Layer 1 + message hub)
│   ├── content_bridge.js         ← Isolated world bridge (Layer 2 relay)
│   ├── core/
│   │   ├── injected_wrapper.js   ← MAIN world wrapper (Layers 3–5)
│   │   ├── pre_parse_analyzer.js ← Layer 1 header/HTML signal extraction
│   │   └── store.js              ← Persistence (chrome.storage.local)
│   ├── features/
│   │   └── feature_extractor.js  ← Full ML feature vector computation
│   └── ui/
│       ├── popup.html            ← Three-panel review UI
│       └── popup.js              ← Popup logic
└── icons/
```

---

## 2. Key Implementation Decisions

### Decision 1 — IIFE scope for all original API references

All original DOM API references are captured at the very top of the
`injected_wrapper.js` IIFE, before any patching occurs. This is
non-negotiable: if patching happened first, a subsequent capture
would get the wrapped version, not the original.

The `_originals` object is in closure scope — invisible to page
scripts that run after injection.

### Decision 2 — WeakMap for node IDs

PseudoNode IDs are tracked via `WeakMap<DOMNode, string>`. This was
chosen over tagging nodes with `data-pgid` attributes because:
- It does not modify the real DOM (no attribute pollution)
- WeakMap entries are GC'd when nodes are removed from the DOM
- It is not observable by page scripts

Tradeoff: The WeakMap is not iterable, so finding a real DOM node
from a PseudoNode ID requires a live DOM query when needed. This is
acceptable because real-node lookup only happens during classification,
not on every mutation.

### Decision 3 — DOMParser for HTML string sandboxing

String-based sinks (`innerHTML`, `insertAdjacentHTML`, `document.write`)
receive an HTML string. Before that string reaches the live DOM, we:
1. Run the XSS pattern check (SecurityGate)
2. Parse it through a detached `DOMParser` to build PseudoNodes

The `DOMParser` reference is captured in `_originals` before any
patching. Scripts inside the parsed document do not execute (DOMParser
produces an inert document). This gives us the structural tree for
feature extraction without running any embedded scripts.

### Decision 4 — Never throw from a wrapper

Every wrapper is wrapped in a try/catch that silently falls through
to the original API call on error. This is the primary reliability
guarantee: the extension must never break a benign page. A wrapper
bug is worse than missing a detection.

### Decision 5 — MutationObserver as supplementary, not primary

MutationObserver fires after the mutation has reached the live DOM.
It cannot block mutations. It is used only to:
- Detect SPA route transitions (new candidate regions emerging)
- Debounce re-classification after bursts of mutations

The security gate is entirely in the prototype wrappers (pre-mutation).

### Decision 6 — Security gate operates only on UGC regions

The gate only runs `SecurityGate.verdict()` when `PseudoDOM.isInUGCRegion()`
returns true for the mutation target. Mutations outside UGC regions
pass through without inspection.

This is the key selectivity mechanism. Without it, every `appendChild`
on every page would trigger a security check, which would be:
- Too slow (framework page loads do thousands of mutations)
- Too noisy (too many false positives on non-UGC content)

The UGC region map is populated by the heuristic classifier at
`DOMContentLoaded` and updated by `MutationObserver` after SPA
transitions. Until the map is populated (first ~100ms of page load),
the gate is inactive — this is acceptable because injected XSS content
almost always arrives after the page has loaded its UGC section.

### Decision 7 — `isInUGCRegion` walks ancestors

When checking if a mutation target is in a UGC region, we do not
require that the target node itself is flagged. We walk the ancestor
chain in the PseudoDOM looking for any ancestor with score >=
`UGC_HIGH_THRESHOLD`. This covers the common case where the mutation
inserts a deep leaf node (text, avatar image, action button) into a
UGC region's subtree.

### Decision 8 — Shadow DOM: re-wrap on each attachShadow

ShadowRoot inherits Element.prototype methods, so the wrappers on
`Node.prototype.appendChild` etc. are already active inside shadow
trees. The one gap is `ShadowRoot.innerHTML`, which lives on the
ShadowRoot prototype, not Element.prototype. We handle this by
installing a fresh `innerHTML` property wrapper on each ShadowRoot
as it is created.

### Decision 9 — `document.createElement` is instrumented, not blocked

`createElement` creates a detached node — not yet in the DOM. It cannot
cause XSS by itself. We instrument it to record the node in the
PseudoDOM so we can track it if it is later inserted. We do not run
SecurityGate on element creation — only on insertion.

Exception: creation of `<script>`, `<iframe>`, `<base>` elements is
logged and can be flagged in the security event log for analysis.

### Decision 10 — Content bridge uses postMessage for MAIN/isolated relay

The MAIN world (where `injected_wrapper.js` runs) cannot call
`chrome.runtime.sendMessage` directly. The relay pattern:
```
MAIN world → window.postMessage({ __pseudodom: true }) →
content_bridge.js (isolated world) → chrome.runtime.sendMessage →
background service worker
```
The `__pseudodom: true` sentinel ensures we only relay our messages,
not arbitrary page postMessages.

### Decision 11 — Debug helpers gated on `window.__PSEUDODOM_DEBUG`

The `window.__PSEUDODOM_DEBUG` object exposes PseudoDOM state for
development. It is only populated if the global already exists at
injection time. In production, the global is never set by the
extension — so the debug surface is invisible to page scripts.

During development, a test page can set `window.__PSEUDODOM_DEBUG = {}`
before the extension injects to enable the debug API.

### Decision 12 — Heuristic classifier scores [0, 1] for ML compatibility

The heuristic scorer outputs a float in [0, 1] and writes it to
`ugcRegionMap`. When the ML logistic regression model is trained, it
will produce the same type of output (calibrated probability in [0, 1])
and replace the heuristic scorer inline — no structural change needed.

The thresholds (`UGC_HIGH_THRESHOLD = 0.65`, `UGC_LOW_THRESHOLD = 0.35`)
will be re-calibrated after the model is trained.

---

## 3. What Is NOT Implemented Yet (Pending ML Classifier)

- **ML logistic regression model**: placeholder is `HeuristicClassifier`.
  Will be replaced by a JSON weights object and a dot-product scorer.
- **Trusted Types enforcement**: designed in `007_trusted_types_integration.md`;
  not yet wired
- **DOMPurify sanitization**: the gate currently blocks or flags;
  the "sanitize" path (return a clean version) is wired but not connected
  to a sanitizer library yet
- **CDP HTML body inspection**: `PreParseAnalyzer.fromHTMLBody()` is
  implemented; not yet called from the background (requires reading the
  full response body via CDP, which needs the debugger API active)
- **`findDOMNodeById` in HeuristicClassifier**: currently returns null for
  most nodes because the WeakMap is not iterable. The live-DOM classification
  path needs a reverse lookup mechanism. Short-term fix: tag elements with
  `data-pgid` during `ensureNode` when in data-collection mode.

---

## 4. Remaining P0 APIs To Wire

The following P0 APIs from `009_dom_mutation_api_reference.md` are
structurally handled by the `makeWrapper` factory but need verification
that the `extractArgs` lambda correctly captures both target and content:

- `HTMLAnchorElement.href` setter — `javascript:` guard
- `HTMLBaseElement.href` setter — base tag injection guard
- `Range.surroundContents`
- `CharacterData.data` setter, `appendData`, `insertData`, `replaceData`
- `document.execCommand` (insertHTML command)
- `Function` constructor wrap

These will be added in the next implementation session.

---

## Update Notes

- Initial entry: `2026-03-29`
- Status: core pipeline complete; ML classifier slot open; UI functional
