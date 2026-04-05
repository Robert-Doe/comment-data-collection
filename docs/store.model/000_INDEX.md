# Store.Model Beginner Index

Date: `2026-04-01`

This folder is a beginner-first walkthrough of how this repo turns a live DOM
page into:

- candidate UGC regions
- human labels
- training rows
- a trained logistic-regression model
- a runtime JSON artifact that the `detector_extension` can eventually use

The goal is to help you connect the exact variable names in the code to the
machine-learning story.

Read in this order:

1. [001_big_picture_from_dom_to_model.md](./001_big_picture_from_dom_to_model.md)
2. [002_how_candidate_roots_are_found.md](./002_how_candidate_roots_are_found.md)
3. [003_how_features_are_extracted.md](./003_how_features_are_extracted.md)
4. [004_the_heuristic_phase_before_ml.md](./004_the_heuristic_phase_before_ml.md)
5. [005_how_human_labeling_enters_the_system.md](./005_how_human_labeling_enters_the_system.md)
6. [006_how_reviewed_candidates_become_dataset_rows.md](./006_how_reviewed_candidates_become_dataset_rows.md)
7. [007_how_the_vectorizer_turns_feature_values_into_numbers.md](./007_how_the_vectorizer_turns_feature_values_into_numbers.md)
8. [008_logistic_regression_for_this_repo.md](./008_logistic_regression_for_this_repo.md)
9. [009_model_artifacts_and_runtime_json.md](./009_model_artifacts_and_runtime_json.md)
10. [010_how_the_detector_extension_will_use_the_model.md](./010_how_the_detector_extension_will_use_the_model.md)
11. [011_candidate_decision_flow_and_modification_map.md](./011_candidate_decision_flow_and_modification_map.md)

## Core words

`candidate`

- a DOM subtree that might be the comment area

`candidate_reviews`

- stored human labels for candidates

`feature_values`

- the measured facts attached to one candidate row

`binary_label`

- the machine-learning version of the human label

`vectorizer`

- the translator from `feature_values` to numeric arrays

`weights` and `bias`

- the learned numbers inside logistic regression

`ugcRegionMap`

- the detector-extension map of likely UGC regions and their confidence scores
