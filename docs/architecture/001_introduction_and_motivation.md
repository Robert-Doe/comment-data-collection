# Introduction And Motivation

Date: `2026-03-30`

System name used in the notes: **PseudoDOM-Guard**

---

## 1. Problem Setting

Modern web applications render user-generated content (UGC) through
two broad pathways:

1. **Server-side rendered pages**
   The server returns HTML that already contains most of the user
   content structure.

2. **JavaScript-driven pages**
   The initial HTML is sparse and framework code later constructs the
   page by calling DOM mutation sinks such as `innerHTML`,
   `insertAdjacentHTML`, `appendChild`, `replaceChildren`, and related
   APIs.

The second pathway is especially relevant for stored and DOM XSS. If
attacker-controlled content survives server-side handling and is later
inserted into a dangerous DOM sink, the browser executes what the page
hands to it. Existing browser defenses help, but they are generally
opt-in, developer-configured, or both.

---

## 2. The Gap In Current Defenses

Current defenses leave a practical gap for ordinary users:

- **CSP** is configured by the site, not the user
- **Trusted Types** is powerful but requires developer adoption and
  compatibility work
- **Sanitization libraries** protect only if the application actually
  routes untrusted data through them
- **Reactive DOM monitoring** sees dangerous content only after the
  page has already mutated the DOM

The user is therefore exposed whenever a site is vulnerable, legacy,
or simply under-defended.

The gap we target is narrower than "all XSS on the web":

> Can the browser install a user-side defense at the earliest
> extension-visible point, recognize the DOM regions most likely to
> carry attacker-controlled UGC, and scrutinize mutations to those
> regions before they become live?

---

## 3. Research Scope

This work is about **vulnerable but not intentionally hostile sites**.

We assume:

- The site may contain insecure rendering logic
- Third-party scripts on the page may be buggy or over-privileged
- An attacker can inject content into the site's UGC pipeline

We do **not** claim to defeat an origin that is itself malicious and
actively attempting to dismantle extension-installed wrappers in the
page's main JavaScript world. That stronger setting should be called
out as out of scope instead of being left ambiguous.

---

## 4. Our Approach In One Paragraph

PseudoDOM-Guard is a browser extension architecture that:

1. Installs DOM-sink wrappers as early as the platform permits
2. Builds a lightweight parallel representation of the evolving DOM
   from intercepted sink calls
3. Generates and ranks candidate DOM subgraphs that may contain
   comment-like or review-like UGC
4. Applies a two-stage mutation gate:
   a fast universal bootstrap precheck for early dangerous sink writes,
   followed by selective full scrutiny once the UGC region map is
   available

The design is deployment-oriented: it aims to protect users without
site cooperation, site-specific rules, or application code changes.

---

## 5. Why UGC Localization Matters

Inspecting every mutation with the same intensity is expensive and
likely to break benign sites. The practical observation behind the
system is that the highest-risk attacker-controlled strings often
appear in a fairly predictable class of DOM regions:

- comment threads
- reply chains
- review sections
- Q and A answer lists
- social discussion panels

If those regions can be located reliably, the expensive security logic
can be concentrated where it matters most.

This yields the main architectural thesis:

> XSS risk is not uniformly distributed across the DOM. UGC locality
> makes selective browser-side interposition practical.

---

## 6. The Three Technical Challenges

### Challenge 1 - Timing

The wrappers must install before the page obtains useful references to
the original sinks. In an extension setting this is a measurable
platform question, not something to assume away.

### Challenge 2 - UGC Localization

The extension must identify likely UGC containers across diverse site
templates without site-specific rules and without waiting for the page
to become fully idle.

### Challenge 3 - The Bootstrap Gap

On SPA pages, the mutation that creates the comment subtree may happen
before the system has enough structure to classify the region. The
design therefore needs a bootstrap strategy for early high-risk sink
writes rather than relying only on a later selective gate.

---

## 7. Contribution Statement

For the paper, the defensible contribution set is:

1. **Early extension-side DOM-sink interposition**
   A practical architecture for installing wrappers at the earliest
   extension-visible point, with explicit discussion of timing
   guarantees and failure cases.

2. **PseudoDOM as a pre-live analysis substrate**
   A lightweight representation that records sink type, insertion
   order, subtree structure, and candidate context before content
   reaches the live DOM.

3. **UGC localization through candidate generation and ranking**
   A domain-general pipeline for identifying the DOM regions most
   likely to contain repeated user-authored content.

4. **A two-stage security gate**
   A universal bootstrap precheck plus UGC-aware selective scrutiny.

These are stronger, cleaner paper contributions than a generic claim
to "prevent XSS with an extension."

---

## 8. Claims We Expect To Test

The paper should test the following claims empirically:

1. In the evaluated Chrome extension configurations, wrapper
   installation occurs before the first relevant page script on a
   large majority of observed loads, with failures characterized
   explicitly.

2. The PseudoDOM supports fast feature extraction and candidate
   generation without requiring repeated live-DOM traversals.

3. A feature-based ranking model can identify UGC-bearing subgraphs
   accurately enough to support selective enforcement on a
   domain-diverse test set.

4. The two-stage gate blocks or sanitizes dangerous UGC-directed sink
   writes on controlled XSS benchmarks with acceptable overhead.

---

## 9. Relationship To Prior Work

The paper should position itself against four lines of prior work:

- **Developer-deployed defenses**
  CSP, Trusted Types, and sanitization libraries

- **Reactive browser-side monitoring**
  MutationObserver-style approaches that see the DOM only after the
  mutation has committed

- **Taint tracking and script isolation**
  More general browser-security systems that do not focus on UGC
  locality or extension deployment

- **Earlier browser XSS filters**
  Especially reflected-XSS-oriented filters that did not address
  framework-driven stored or DOM XSS

Our differentiator is the combination of timing, selective scope, and
user-side deployability.

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised for publication framing: `2026-03-30`
- Status: introduction is now aligned with a narrower and more
  defensible USENIX claim set
