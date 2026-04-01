# Trusted Types Integration

Date: `2026-03-30`

---

## 1. What Trusted Types Contributes

Trusted Types is a browser enforcement mechanism for a class of
dangerous injection sinks. When enforcement is active, code must pass
trusted objects, rather than arbitrary strings, into covered sinks.

For this project, Trusted Types is attractive because it sits below
ordinary application-level string handling and can strengthen the
binding between "sanitized by our logic" and "accepted by the sink."

---

## 2. Why It Is Relevant But Not Core To The Main Claim

Trusted Types is not required to make the main PseudoDOM-Guard paper
interesting. The core contribution is still:

- early sink interposition
- PseudoDOM-based analysis
- UGC localization
- two-stage gating

Trusted Types should therefore be framed as:

- **optional downstream hardening** if implemented on a controlled
  subset, or
- **future work** if it remains unimplemented at submission time

Treating it as a headline contribution before the implementation is
stable would overextend the paper.

---

## 3. How Trusted Types Could Complement The System

If integrated, the relationship would be:

- the wrapper decides whether a string should pass, be sanitized, or
  be blocked
- sanitization produces a trusted object for covered sinks
- the browser enforces that covered sinks reject raw strings where
  enforcement is active

This can reduce reliance on the wrapper alone for some sink families,
especially in controlled environments where compatibility is known.

---

## 4. Practical Integration Path

### Step 1 - Controlled policy creation

Create an extension-owned policy for covered sinks in environments
where policy creation is permitted and compatibility is understood.

### Step 2 - Controlled enforcement experiments

Enable Trusted Types only in:

- local evaluation harnesses
- explicitly authorized test sites
- report-only or compatibility-testing configurations

Enabling sink enforcement arbitrarily across the open web is likely to
break applications and should not be the default deployment story.

### Step 3 - Sink handoff

When the mutation gate sanitizes a string for a covered sink, the
sanitized output is wrapped in the appropriate trusted type rather
than being handed to the sink as a raw string.

### Step 4 - Violation logging

In controlled experiments, Trusted Types violations can be logged as
evidence that raw strings attempted to reach covered sinks.

---

## 5. Challenges And Limits

### Challenge 1 - Compatibility

Many production sites are not ready for strict Trusted Types
enforcement. A paper that claims arbitrary deployment would need very
strong compatibility evidence.

### Challenge 2 - Policy interaction

Sites may already define their own Trusted Types expectations or CSP
policies. Extension-driven hardening must not assume it can reshape
those policies without side effects.

### Challenge 3 - Coverage mismatch

Trusted Types covers important sink families, but it is not a complete
answer to every browser-side injection pathway considered in the paper.

### Challenge 4 - Paper focus

A partially implemented Trusted Types section can distract from the
core contribution if it is allowed to dominate the narrative.

---

## 6. Recommended Paper Positioning

Use one of these two positions:

1. **If implemented and evaluated on a controlled subset**
   Present Trusted Types as an optional hardening extension and report
   it in a dedicated subsection or appendix.

2. **If not fully implemented**
   Keep it as future work and emphasize that the main contribution
   stands without it.

At the current project stage, option 2 is safer unless the controlled
evaluation can be completed cleanly.

---

## 7. Current Status

| Component | Status |
|---|---|
| Main sink wrapper | In development |
| Two-stage gate | Designed |
| Trusted Types policy integration | Not yet implemented |
| Controlled enforcement experiments | Planned only |

---

## Update Notes

- Initial draft: `2026-03-29`
- Revised to treat Trusted Types as optional hardening rather than a
  main-paper dependency: `2026-03-30`
- Status: ready to cite as future work or controlled-scope extension
