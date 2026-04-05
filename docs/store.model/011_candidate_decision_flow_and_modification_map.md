# Candidate Decision Flow And Modification Map

Date: `2026-04-05`

This file traces how one candidate moves through the repo and where you change
each part of the behavior.

## 1. End-To-End Flow

The main path is:

- `src/commentFeatures.js`
- `src/shared/scanner.js`
- `src/shared/store.js`
- `src/api/server.js` or `src/local/dev-server.js`
- `web/app.js`
- `src/shared/output.js`
- `src/modeling/common/dataset.js`
- `src/modeling/common/routes.js`

If you start from a page in the browser, the scanner finds candidate DOM roots,
scores them, stores the full candidate array, and the browser UI renders the
review workspace from that stored JSON.

## 2. Where The Decisions Happen

### Candidate discovery

The first pass lives in `src/commentFeatures.js`.

Relevant functions:

- `looksLikeContainer(...)`
- `discoverCandidateRoots(...)`
- `extractCandidateRegions(...)`

This is where the code decides which DOM subtrees are even eligible to be
treated as candidates.

### Heuristic scoring and pseudo-labeling

The score and the heuristic cue are also built in `src/commentFeatures.js`.

Relevant function:

- `scoreFeatures(features)`

That function returns:

- `score`
- `detected`
- `acceptance_gate_passed`
- `heuristic_pseudo_label`
- `heuristic_pseudo_confidence`
- `heuristic_pseudo_reason`
- `heuristic_pseudo_source`

The pseudo-label is a reviewer cue, not the final truth.

### Candidate retention

The page-level candidate list is assembled in `src/shared/scanner.js`.

Relevant functions:

- `collectCandidatesFromPage(...)`
- `scanUrl(...)`
- `analyzeHtmlSnapshot(...)`

This is where the code keeps the larger candidate pool, stores the heuristic
summary, and records the top candidate separately.

### Persistence

The scan result and candidate array are stored as JSONB in `src/shared/store.js`.

Important fields:

- `candidates`
- `best_candidate`
- `scan_result`
- `candidate_reviews`

You usually do not need a schema change when you add new fields to candidate
objects because those columns already store JSON.

### Review UI

The browser dashboard is a plain JavaScript app in `web/app.js`.

This is not a React client.

Key functions:

- `renderCandidateReview(...)`
- `renderScoringBreakdown(...)`
- `renderWorkspaceSelection(...)`
- `renderJobLabelerReview(...)`

This is where the heuristic cue becomes visible to reviewers.

### Exports

Exports live in `src/shared/output.js`.

Relevant functions:

- `buildJobItemRecord(...)`
- `buildCandidateRows(...)`
- `serializeJobItemsCsv(...)`
- `serializeJobCandidateDetailsCsv(...)`
- `buildJobReportWorkbook(...)`

If a field shows up in the UI but not in CSV/XLSX, this is the file to check.

### Human labels

Human review is wired through:

- `src/shared/candidateReviews.js`
- `src/api/server.js`
- `src/local/dev-server.js`

That is where `comment_region`, `not_comment_region`, and `uncertain` are
stored and reapplied to the candidate list.

### Training

Model training starts in:

- `src/modeling/common/dataset.js`
- `src/modeling/common/routes.js`

That is the layer to change if you want the eventual model to ingest new
features or new review metadata.

## 3. How To Follow A Symptom

If a candidate disappears too early, start with:

- `src/commentFeatures.js`
- `src/shared/scanner.js`

If the candidate is present but the decision cue looks wrong, inspect:

- `scoreFeatures(...)`
- `heuristic_pseudo_label`
- `renderScoringBreakdown(...)`

If the dashboard hides the clue, inspect:

- `renderCandidateReview(...)`
- `renderWorkspaceSelection(...)`
- `renderJobLabelerReview(...)`

If a CSV or workbook is missing the field, inspect:

- `src/shared/output.js`

If the human label does not attach, inspect:

- `src/shared/candidateReviews.js`
- the review endpoints in `src/api/server.js` and `src/local/dev-server.js`

## 4. What To Change For Common Mods

- To widen candidate discovery, edit `src/commentFeatures.js` and
  `src/shared/scanner.js`.
- To change the heuristic cue, edit `scoreFeatures(...)` in
  `src/commentFeatures.js`.
- To change reviewer-facing hints, edit `web/app.js`.
- To change exports, edit `src/shared/output.js`.
- To change persistence behavior, edit `src/shared/store.js`.
- To change training inputs, edit `src/modeling/common/dataset.js`.

## 5. One Important Constraint

The current client is a vanilla browser app, not React. The UI is built directly
in `web/app.js`, which is why the code feels more imperative than componentized.
If you later want to rework the client architecture, that is a separate refactor
and should not be mixed into the heuristic changes.
