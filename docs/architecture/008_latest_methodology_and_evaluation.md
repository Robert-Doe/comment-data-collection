# Methodology And Evaluation Plan

Date: `2026-03-30`

This is the current publication-facing methodology note.

---

## 1. System Overview

PseudoDOM-Guard is a browser extension architecture that interposes on
dangerous DOM sinks at the earliest extension-visible point, builds a
lightweight parallel representation of page structure from intercepted
sink calls, ranks candidate UGC regions, and applies a two-stage
mutation gate: a universal bootstrap precheck followed by selective
UGC-aware scrutiny. The system is designed for vulnerable-but-not-
malicious sites and aims to reduce stored and DOM XSS risk without
requiring developer cooperation.

---

## 2. Research Questions

**RQ1** - How often does sink-wrapper installation occur before the
first relevant page script in practice, and where does it fail?

**RQ2** - Can candidate generation and ranking identify UGC-bearing
DOM subgraphs accurately enough to drive selective enforcement?

**RQ3** - Does the two-stage gate block or sanitize dangerous
UGC-directed sink writes on controlled XSS benchmarks?

**RQ4** - What is the runtime and memory overhead of the protection
pipeline?

**RQ5** - What privacy, compatibility, and deployment tradeoffs remain
after narrowing the system to this threat model?

---

## 3. Main Hypotheses

**H1** - Early injection succeeds on the large majority of measured
page loads, but failure cases are non-zero and can be characterized.

**H2** - Explicit candidate generation plus ranking performs
substantially better than heuristic-only identification of UGC roots.

**H3** - The bootstrap gate reduces misses on early SPA mutations
relative to a selective-only gate.

**H4** - Context-sensitive inert parsing improves string-sink fidelity
relative to a naive detached-document parse.

**H5** - The protection pipeline stays within an acceptable overhead
budget for interactive pages when candidate counts are pruned.

---

## 4. Methodology

### 4.1 Implementation Variants

Two implementation variants should be evaluated separately:

- **Extension mode**
  The deployable always-on system

- **Measurement mode**
  A debugger-backed instrumented system used for timing studies and
  artifact capture

Results from the two modes must not be mixed casually. A reviewer will
rightly ask which claims belong to the deployable system versus the
research harness.

### 4.2 Timing Experiment For RQ1

Timing evaluation should have two parts.

**Part A - Controlled microbenchmarks**

Build a local harness with:

- first inline script in `<head>`
- classic scripts in `<body>`
- `defer` and `async` scripts
- module scripts
- dynamic `import()`
- frame-created content
- shadow-root creation

Measure whether the page first observes wrapped or original sink
references at each point.

**Part B - Domain-diverse corpus**

Run the extension on a corpus spanning:

- news sites
- forums
- e-commerce pages
- Q and A sites
- social-style discussion pages
- non-UGC controls

For each load, record:

- whether wrappers installed before first relevant page script
- main-frame versus frame coverage
- failure category if early installation was missed

Timing results should be reported with counts, rates, and confidence
intervals, not only anecdotes.

### 4.3 UGC Localization Experiment For RQ2

**Dataset targets**

- at least hundreds of labeled candidates
- domain-diverse sites
- positives and strong negatives
- splits by eTLD+1 or site family

**Baselines**

- BL0: heuristic-only page score
- BL1: candidate generator plus heuristic ranker
- BL2: logistic regression on structural features only
- BL3: logistic regression on full feature set
- BL4: boosted-tree model on full feature set when data permits

**Ablations**

- no wildcard-family features
- no semantic features
- no time features
- no composer-proximity features
- no negative-control features
- no candidate-pruning step

**Metrics**

- top-1 accuracy
- recall at k
- precision, recall, F1
- PR-AUC
- candidates scored per page
- latency per page

### 4.4 End-To-End Protection Experiment For RQ3

This experiment must be ethically clean.

**Allowed evaluation settings**

- local vulnerable applications
- deliberately instrumented test pages
- archived or replayed page traces
- explicitly authorized test environments

**Not allowed**

- submitting live XSS payloads to third-party production sites without
  authorization

**Payload families**

- script-tag insertion
- event-handler attributes
- `javascript:` URLs
- SVG-based handlers
- script text-node activation
- `document.write`
- mutation-XSS style encoded payloads

**Comparisons**

- no protection
- selective-only gate
- two-stage gate
- optional sanitized variant

**Metrics**

- dangerous sink writes blocked
- dangerous sink writes sanitized
- dangerous sink writes missed
- benign writes incorrectly blocked or modified

### 4.5 Performance Experiment For RQ4

Measure on a domain-diverse page set:

- wrapper overhead per covered sink
- PseudoDOM construction time
- candidate-generation and scoring time
- mutation-gate decision latency
- memory overhead
- page-level impact on user-visible milestones where measurable

Percentiles are more important than averages alone. The paper should
report at least p50, p95, and worst-case outliers.

### 4.6 Privacy, Compatibility, And Deployment Analysis For RQ5

Explicitly evaluate:

- what data is stored in research mode
- what is omitted or redacted in protection mode
- whether common sites break under the wrapper alone
- whether any optional hardening features, such as Trusted Types,
  materially reduce compatibility

This section turns likely reviewer criticism into measured results.

---

## 5. Dataset Construction Plan

### Phase 0 - Export and clean existing scanner output

- deduplicate by normalized URL
- identify domain families
- separate likely positives, likely negatives, and ambiguous pages

### Phase 1 - Candidate labeling

- use the review UI to label candidate roots
- track inter-reviewer disagreement where practical
- keep ambiguous cases rather than forcing low-quality labels

### Phase 2 - Feature table generation

- freeze a versioned feature schema
- generate train, validation, and test tables
- record candidate counts and page metadata

### Phase 3 - Threshold calibration

- tune `T_low` and `T_high` on held-out domains
- select operating points based on security and usability tradeoffs

### Phase 4 - Benchmark assembly

- curate the controlled XSS test suite
- version payload families and expected outcomes

---

## 6. Baselines And Related Systems

### Technical baselines

| System | Comparison role |
|---|---|
| No protection | Lower-bound baseline |
| Heuristic-only UGC detection | Current rule-based baseline |
| Selective-only gate | Shows value of bootstrap gate |
| MutationObserver-only monitoring | Reactive baseline |
| Optional sanitizer-only mode | Separates localization from policy |

### Related research directions

- developer-deployed web defenses
- reactive DOM monitoring
- taint tracking and isolation
- prior browser-side XSS filtering work

The evaluation should compare against what is actually implementable in
our environment, not an idealized security oracle.

---

## 7. Paper Structure Guidance

Recommended high-level paper structure:

1. Introduction
2. Background and platform model
3. Threat model
4. System design
5. UGC localization pipeline
6. Evaluation
7. Discussion and limitations
8. Related work
9. Conclusion

The discussion section should explicitly revisit:

- malicious-origin limitations
- frame coverage limitations
- privacy and data handling
- deployment compatibility

---

## 8. Writing Assets Still Needed

- final architecture diagram
- timing harness diagram
- candidate-generation illustration
- feature-family table
- benchmark payload table
- privacy/data-flow diagram
- PR curves and ablation plots
- overhead percentile plots

---

## 9. Current Blockers

1. Candidate-label volume is still the main ML bottleneck.
2. Timing data on real pages has not yet been collected at paper
   quality.
3. Bootstrap-gate implementation still needs to be evaluated against
   the selective-only baseline.
4. Controlled XSS benchmark suite needs to be assembled and versioned.
5. Privacy-minimizing serialization policy needs to be implemented for
   artifact readiness.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised for USENIX-facing rigor and ethics: `2026-03-30`
- Status: this note now reflects a publishable evaluation plan rather
  than a loose experiment sketch
