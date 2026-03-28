# SVG Graph Rendering

## What Changed

The app can now render the stored DOT graph directly to SVG without relying on a system Graphviz installation.

This is done with a JavaScript/WASM renderer so the export path is portable across environments where `dot` is not installed.

## New Review Actions

When a selected row has a stored manual HTML snapshot, the review panel now exposes:

- `View SVG`
- `Download SVG`
- `Download DOT Graph`

This supports two workflows:

1. open the graph directly in the browser for quick inspection
2. download either the rendered SVG or the raw DOT for offline analysis

## Why This Matters

The raw DOT file is useful for:

- Graphviz desktop workflows
- versioning the structural graph
- research appendix material

The SVG view is useful for:

- fast human review
- opening the graph without extra tooling
- sharing the graph artifact with collaborators

## Important Constraint

SVG rendering still depends on the same prerequisite as DOT export:

- the row must have a stored manual HTML snapshot

Automated rows without saved HTML still cannot be reconstructed later into a graph.

## Implementation Direction

The pipeline is now:

1. rebuild graph DOT from stored snapshot HTML
2. render DOT to SVG on the server
3. return inline SVG for viewing or attachment for download

This preserves the comment-list / comment-block semantics already defined in the prior note.
