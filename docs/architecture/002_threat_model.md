# Threat Model

Date: `2026-03-30`

---

## 1. Threat Model Summary

We consider an attacker who can place malicious content into the
user-generated-content pipeline of a web application and relies on the
application's client-side rendering path to turn that content into
active same-origin script execution in a victim browser.

The extension's goal is to stop or sanitize that dangerous DOM-sink
write before the inserted content becomes live.

---

## 2. Primary Asset

The primary asset is:

> **The integrity of the victim's browser execution environment while
> visiting pages that render user-generated content.**

Concretely this includes:

- session state and authenticated actions
- page DOM integrity
- same-origin data exposed to page scripts
- the user's trust in visible page content and interactions

---

## 3. Attacker And Site Assumptions

### Who the attacker is

The attacker is any party who can influence content that later reaches
the site's DOM-rendering path, including:

- a registered user posting malicious comments, reviews, replies, or
  messages
- an attacker who compromised a server-side component and planted
  stored content
- a third-party feed provider whose content is rendered by the site

### What the attacker can do

The attacker can:

- submit arbitrary strings or structured content into the UGC path
- exploit weak or inconsistent server-side sanitization
- rely on framework-driven rendering that eventually reaches
  dangerous DOM sinks
- use payload families such as event attributes, `javascript:` URLs,
  SVG-based handlers, script text insertion, and mutation-XSS-style
  encodings

### What the attacker cannot do

Under this model, the attacker cannot:

- modify the browser binary or operating system
- tamper directly with the extension package or its privileged
  extension contexts
- rely on the target origin itself being an intentionally malicious
  anti-extension page

### Site assumption that must be explicit

The target site may be **vulnerable** and may run buggy or unsafe
third-party scripts. It is not modeled as an origin that is actively
trying to detect, remove, or sabotage the extension's protection
logic. That stronger case is out of scope because main-world wrapper
code is inherently more exposed to host-page interference.

---

## 4. Attack Surface

### 4.1 Stored XSS through UGC rendering paths

Primary target:

1. Attacker submits content through a comment, review, or reply path
2. The site stores or forwards the content
3. Client-side code renders it via a dangerous sink
4. The browser turns that sink write into active same-origin code

### 4.2 DOM-based XSS from tainted page sources

Secondary target:

- URL fragments
- `postMessage`
- `localStorage`
- `document.referrer`
- API responses that are not semantically "comments" but still reach
  the same dangerous sinks

The wrapper can observe these sinks, but the UGC-localization layer is
not designed primarily around them.

### 4.3 Reflected HTML injection

Secondary target:

Server-delivered reflected payloads may be partially addressable in a
debugger-backed or research-mode configuration that inspects response
bodies before parse, but this is not the core claim of the paper.

### 4.4 Indirect executable content

The design must also consider payloads that become executable through
indirect paths, such as:

- constructing a `<script>` node and appending text
- setting event-handler attributes
- creating executable SVG or MathML fragments
- `document.write`

This matters because sink coverage is broader than only `innerHTML`.

---

## 5. Trust Boundaries

There are four relevant trust zones:

1. **Privileged extension context**
   Background/service-worker logic, stored models, logging, and review
   tooling. Trusted.

2. **Injected main-world wrapper**
   Required for sink interposition, but exposed to host-page
   inspection and tampering. Trusted for design purposes, yet not as
   strong a trust boundary as the isolated extension context.

3. **Page JavaScript and DOM**
   Untrusted. Includes first-party code, third-party libraries, and
   attacker-controlled rendering paths.

4. **Network-delivered content**
   Untrusted. May contain benign markup, broken markup, or malicious
   payloads.

The paper should be explicit that the critical security boundary is
between extension-controlled decision logic and page-controlled sink
invocation, not between the page and the browser kernel.

---

## 6. Bypass Attempts And Mitigations

### Bypass 1 - Obtain original sink references before wrapper install

Mitigation:
- inject at the earliest extension-visible point
- validate timing empirically
- distinguish debugger-backed and always-on deployment modes

### Bypass 2 - Restore patched prototypes or descriptors

Mitigation:
- retain originals only in closure scope
- re-define wrapped methods with hardened descriptors where possible
- run integrity checks and log tampering attempts

Residual risk:
- a fully malicious origin remains out of scope

### Bypass 3 - Use a fresh frame context

Mitigation:
- inject into frames where extension permissions and platform support
  permit
- in debugger-backed mode, attach to child targets as needed

Residual risk:
- cross-origin OOPIF coverage depends on platform mechanics and must
  be measured

### Bypass 4 - Use string-to-HTML sinks before UGC classification

Mitigation:
- universal bootstrap precheck for early dangerous sink writes
- incremental candidate emergence and reclassification

### Bypass 5 - Use `document.write` or parser-driven insertion

Mitigation:
- wrap `document.write` and `writeln`
- optionally inspect network responses in measurement mode

### Bypass 6 - Hide content in Shadow DOM

Mitigation:
- wrap `attachShadow`
- represent shadow roots explicitly in the PseudoDOM

### Bypass 7 - Exploit parser-context mismatches

Mitigation:
- use context-sensitive inert parsing for string sinks rather than a
  one-size-fits-all detached HTML document parse

---

## 7. Out Of Scope

The following are out of scope for the main paper claim:

- actively malicious origins trying to dismantle the extension
- browser or extension compromise
- phishing sites under attacker control
- CSRF and clickjacking without DOM-sink injection
- CSS-only UI deception that never crosses a covered sink
- arbitrary non-UGC application logic bugs unrelated to DOM injection

---

## 8. Security Goals

**G1 - Early sink interposition**
Install wrappers early enough to meaningfully interpose on relevant
DOM sinks in practice.

**G2 - Bootstrap safety**
Provide protection for dangerous early sink writes that occur before
UGC localization has stabilized.

**G3 - Accurate UGC localization**
Identify likely UGC subgraphs with practical precision and recall on a
domain-diverse corpus.

**G4 - Low disruption**
Preserve benign functionality and keep false positive blocking low.

**G5 - User-side deployability**
Require no application changes or per-site rules for the core system.

---

## 9. Security Claims To Measure

The paper should report measured values for:

- wrapper-installation success before first relevant page script
- bootstrap gate coverage and misses
- candidate-level and page-level UGC-localization accuracy
- end-to-end blocking or sanitization rate on a controlled XSS corpus
- benign false positive rate and performance overhead

Avoid fixing these to ambitious thresholds in the threat model note
before the data exists.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised for clearer assumptions and bypass coverage: `2026-03-30`
- Status: threat model now matches a publication-realistic scope
