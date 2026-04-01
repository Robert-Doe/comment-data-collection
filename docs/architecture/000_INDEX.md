# Paper Notes - Master Index

Project working title:
**"PseudoDOM-Guard: Early DOM-Sink Interception for Stored and DOM XSS in User-Generated Content"**

Target venue: USENIX Security Symposium

---

## Purpose of this folder

This folder tracks paper-facing decisions for the PseudoDOM-Guard
project. The notes are meant to do two things at once:

1. Preserve implementation and evaluation decisions while the system
   is still changing
2. Gradually converge on a defensible publication narrative instead
   of a collection of optimistic engineering notes

The current revision tightens claims, closes design gaps that would
draw reviewer criticism, and aligns the notes with a realistic
USENIX-style evaluation plan.

---

## Naming rule

- `NNN_topic.md` for stable completed notes
- `NNN_latest_topic.md` for the currently active note in a sequence
- When a newer note supersedes the active one, remove `latest` from
  the old filename

---

## Current sequence

| File | Topic |
|---|---|
| `001_introduction_and_motivation.md` | Problem framing, scope, contribution statement |
| `002_threat_model.md` | Assets, attacker model, assumptions, measurable goals |
| `003_system_architecture.md` | End-to-end pipeline, deployment modes, bootstrap gate |
| `004_dom_interception_techniques.md` | Interception taxonomy, timing properties, limitations |
| `005_pseudodom_design.md` | PseudoDOM construction, context-sensitive parsing, serialization |
| `006_ugc_detection_model.md` | Candidate generation, features, model, calibration |
| `007_trusted_types_integration.md` | Trusted Types as optional downstream hardening |
| `008_latest_methodology_and_evaluation.md` | Research questions, datasets, experiments, ethics |
| `009_submission_positioning_and_artifact_plan.md` | Reviewer risks, artifact plan, submission checklist |

---

## Relationship to the brainstorm folder

The `brainstorm/` folder remains the engineering workbench. It is the
right place for feature ideas, data schema sketches, and rapid design
iterations. This `paper/` folder should stay publication-oriented:
claims here must either already be supported by evidence or be marked
clearly as a hypothesis, open question, or future work item.

---

## Publication priorities

- Validate timing claims empirically instead of treating early
  injection as solved by assumption
- Close the SPA bootstrap gap by defining what happens before the
  UGC region is known
- Specify candidate generation and pruning, not only candidate
  scoring
- Replace generic detached parsing claims with context-sensitive
  inert parsing for string-to-HTML sinks
- Evaluate end-to-end protection only on authorized or locally
  controlled XSS testbeds, not on live third-party sites
- Make privacy, artifact reproducibility, and ethical data handling
  explicit in the paper plan

---

## Current status

- Date initialized: `2026-03-29`
- Last updated: `2026-03-30`
- Phase: design tightening + data collection
- Paper draft status: outline stable, core sections revised for
  submission realism
