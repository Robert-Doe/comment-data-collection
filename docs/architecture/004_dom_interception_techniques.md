# DOM Interception Techniques

Date: `2026-03-30`

---

## 1. Overview

This note records the interception options considered for
PseudoDOM-Guard and, more importantly, what each option can and cannot
justify in a paper. The central lesson is that timing, context, and
trust boundary all matter:

- early does not automatically mean untamperable
- broad observability does not automatically mean synchronous control
- research-mode instrumentation is not the same thing as deployable
  always-on protection

---

## 2. Technique Taxonomy

The techniques below are ordered from earlier to later in page load.

### Layer 1 - Network / pre-parse interception

**Examples**
- response-body inspection in debugger-backed mode
- response-header rewriting where the platform permits it

**What it enables**
- metadata extraction before parse
- SSR-page structure hints
- optional CSP or reporting experiments in controlled settings

**What it does not solve**
- no direct access to page JavaScript objects
- expensive for large responses
- limited value for SPA shells that contain almost no UGC structure

**Role in our design**
- measurement mode, metadata extraction, and optional controlled
  experiments

### Layer 2 - Earliest extension-visible JavaScript execution

**Examples**
- content script at `document_start`
- debugger-backed `Page.addScriptToEvaluateOnNewDocument`

**What it enables**
- wrapper installation before most page scripts
- early capture of original sink references
- per-frame initialization in measurement mode

**Key limitation**
- this is the core timing claim and must be validated empirically
- main-world code remains exposed to host-page interference after
  installation

**Role in our design**
- primary installation path for sink wrappers

### Layer 3 - Prototype and descriptor interposition

**Examples**
- replacing `Node.prototype.appendChild`
- wrapping `innerHTML` setters through descriptors
- wrapping `attachShadow`

**What it enables**
- synchronous interposition on covered sinks
- access to raw strings before they reach the live DOM
- direct integration with the mutation gate

**Key limitation**
- only as strong as installation timing and page-world hardening

**Role in our design**
- primary protection mechanism

### Layer 4 - Context-sensitive detached parsing

**Examples**
- inert `template` parsing for generic HTML fragments
- `Range#createContextualFragment` when sink context matters
- special containers for table and namespace-sensitive fragments

**What it enables**
- inspect string-based insertions before commit
- preserve more sink context than a generic detached document parse

**Key limitation**
- still must be tested against tricky parser contexts
- not every sink maps cleanly to one generic detached parser strategy

**Role in our design**
- string-sink analysis inside the bootstrap and selective gates

### Layer 5 - Reactive observation

**Examples**
- `MutationObserver`
- post-hoc DOM snapshots

**What it enables**
- stability detection
- supplementary structure signals
- sanity checking for missed mutations

**What it does not solve**
- cannot prevent synchronous script execution from already-committed
  DOM writes

**Role in our design**
- supplemental only, not the primary gate

### Layer 6 - Out-of-process debugger observation

**Examples**
- DOM snapshots
- execution-context events
- child-target instrumentation

**What it enables**
- rich measurement and debugging
- frame-level visibility
- artifact capture for the paper

**What it does not solve**
- too asynchronous to be the main gate
- requires explicit debugger attachment

**Role in our design**
- measurement mode only

---

## 3. Selected Stack

The selected stack for the paper is:

| Priority | Technique | Role |
|---|---|---|
| 1 | `document_start` main-world injection | Always-on early installation path |
| 2 | Debugger-backed new-document injection | Timing study and research instrumentation |
| 3 | Prototype and descriptor wrapping | Synchronous sink interposition |
| 4 | Context-sensitive inert parsing | String-sink inspection before commit |
| 5 | MutationObserver | Candidate-stability and consistency checks |
| 6 | Debugger DOM/runtime events | Measurement and artifact generation |

Notably absent from the core claim:

- service-worker interception as a required component
- reactive-only blocking
- Trusted Types as a prerequisite for the main result

---

## 4. Timing Interpretation

The paper should distinguish three statements:

1. **Platform semantics**
   The browser documents early-injection behavior for the selected
   APIs.

2. **Observed success**
   Our implementation installed before the first relevant page script
   on a measured fraction of pages.

3. **Residual risk**
   Some pages, frames, or execution patterns may still evade early
   installation.

Conflating these would weaken the paper. The methodology section
should report all three explicitly.

---

## 5. What Cannot Be Reliably Claimed

The earlier notes were too close to claiming complete coverage. The
paper should instead acknowledge the following limits:

- a malicious origin can inspect or tamper with main-world wrappers
- frame coverage is not uniform across all cross-origin configurations
- browser-native DOM changes may bypass JavaScript-level wrappers
- sink coverage is substantial but not equivalent to proving
  interception of every executable browser pathway

These are acceptable limitations if they are stated cleanly and the
evaluation is aligned with them.

---

## 6. Design Consequences

This taxonomy leads directly to four design consequences:

1. Timing must be measured, not merely asserted.
2. The protection story needs a bootstrap phase before UGC
   classification converges.
3. Generic detached parsing is insufficient for string sinks.
4. Out-of-process observation belongs in the artifact and analysis
   pipeline, not in the main security gate.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised to separate deployable protection from research
  instrumentation: `2026-03-30`
- Status: interception note now matches the architecture note
