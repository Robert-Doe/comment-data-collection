# Submission Positioning And Artifact Plan

Date: `2026-03-30`

---

## 1. Submission Thesis

The paper should present **PseudoDOM-Guard** as a practical browser
security architecture for a narrow but important setting:

> protecting users from stored and DOM XSS that reaches browser DOM
> sinks through user-generated-content rendering paths on otherwise
> benign but insufficiently defended websites.

This is intentionally narrower than "browser-side XSS prevention" in
general. The narrower claim is more defensible and better aligned with
the actual design.

---

## 2. Core Contributions To Defend

The submission should defend four concrete contributions:

1. **Early DOM-sink interposition in an extension setting**
   A browser-extension architecture that installs sink wrappers as
   early as the platform allows, with explicit separation between
   always-on extension mode and debugger-backed measurement mode.

2. **PseudoDOM as an analysis substrate**
   A lightweight parallel representation that captures mutation order,
   sink type, and subtree structure before content reaches the live
   DOM.

3. **UGC localization for selective enforcement**
   A candidate-generation and ranking pipeline that identifies the DOM
   subgraphs most likely to carry attacker-controlled user content.

4. **A two-stage mutation gate**
   A universal bootstrap precheck for early high-risk sink writes,
   followed by selective full scrutiny once the UGC region map has
   stabilized.

---

## 3. Claims We Should Not Make

These claims are likely to be attacked by reviewers unless we obtain
very strong evidence:

- "We intercept all DOM writes before any page code on the web"
- "The system is robust against fully malicious origins"
- "Trusted Types closes all remaining bypasses"
- "DOMParser perfectly models browser parsing for all sinks"
- "The extension eliminates XSS"

The paper should instead use language such as:

- "intercepts at the earliest extension-visible point"
- "validated empirically on a domain-diverse corpus"
- "targets vulnerable-but-not-malicious sites"
- "provides defense in depth for a specific XSS pathway"

---

## 4. Reviewer Risk Register

### Risk 1 - Timing claim is too strong

Expected reviewer question:
Can a browser extension really run before page scripts in practice?

Needed evidence:
- Chrome-platform semantics from official documentation
- Microbenchmarks with inline, module, deferred, async, dynamic, and
  frame-created scripts
- Corpus-level success rate and failure taxonomy

### Risk 2 - Main-world wrappers are tamperable

Expected reviewer question:
Why does a malicious page not simply restore the original prototype?

Needed answer:
- Scope the threat model to content-level attackers on benign sites
- Document best-effort hardening
- Explicitly exclude actively malicious origins from the main claim

### Risk 3 - SPA bootstrap gap

Expected reviewer question:
What protects the first mutation that creates the comment subtree?

Needed answer:
- Universal bootstrap gate on string-to-HTML and executable sinks
- Incremental candidate emergence and reclassification rules

### Risk 4 - Parsing fidelity

Expected reviewer question:
How do you safely analyze `innerHTML` for tables, SVG, and contextual
fragments?

Needed answer:
- Context-sensitive inert parsing strategy
- Fallback behavior for unsupported contexts
- Tests against a representative sink corpus

### Risk 5 - End-to-end evaluation ethics

Expected reviewer question:
Did the authors inject XSS into third-party production sites?

Needed answer:
- No live unauthorized exploitation
- Controlled applications, local harnesses, or replay traces only
- Explicit ethics statement in the methodology section

---

## 5. Artifact Plan

The artifact should make the paper reproducible at three layers:

1. **Instrumentation**
   Extension build, sink-wrapper code, and timing harnesses

2. **Dataset**
   Candidate feature tables, labeling schema, and scripts that produce
   train/test splits by eTLD+1

3. **Evaluation**
   Scripts for timing, classification, end-to-end protection, and
   performance figures

Required artifact outputs:

- A versioned sink-coverage list
- Candidate-generation code and feature schema
- Training and evaluation manifests
- Plot-generation scripts
- Redacted or synthetic sample PseudoDOM exports
- A controlled XSS benchmark suite

---

## 6. Ethics And Privacy Text To Carry Into The Paper

The paper should state the following principles explicitly:

- We do not submit XSS payloads to third-party production systems
  without authorization.
- Production browsing data used for labeling is minimized and
  redacted; raw page text is not retained in the protection mode.
- Human reviewers label candidate regions, not arbitrary private page
  content whenever possible.
- Persisted artifacts should prefer structural features, hashed text,
  or short redacted snippets over full raw UGC bodies.

---

## 7. Submission Readiness Checklist

- Timing claim validated on real pages and synthetic harnesses
- Candidate-generation algorithm specified and implemented
- Bootstrap gate implemented and evaluated
- Context-sensitive sink parsing tested
- Domain-split classification results stable
- Controlled XSS benchmark completed
- Performance overhead measured with percentiles and confidence
  intervals
- Artifact package assembled
- Ethics and privacy language drafted for the paper body

---

## Update Notes

- Initial draft: `2026-03-30`
- Status: active publication-facing note
