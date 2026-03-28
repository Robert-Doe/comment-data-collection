# UGC Manual Capture Extension

Load this folder as an unpacked extension:

1. Open your browser extensions page.
2. Enable Developer Mode.
3. Choose `Load unpacked`.
4. Select this folder.

Usage:

1. Set `API Base URL` once in the extension. For local mode this is usually `http://localhost:3000`.
2. In the scanner UI, click `Manual` on the target row to prime the extension for that item.
3. Open the target row URL in a new tab.
4. Do the manual actions needed to reveal the comments.
5. Open the extension popup on that tab.
6. Click `Refresh Match` if needed. The extension will ask the scanner which row matches the current page URL, while prioritizing the row you selected in the web app.
7. Click `Capture & Upload`.

Fallback:

- If auto-match cannot find the scanner row, use the `Advanced Fallback` section and paste the config JSON from the web app.

The extension uploads:

- a raw DOM snapshot for analysis
- an optional frozen-styles HTML snapshot for offline review
- the visible screenshot
- the current URL and page title
- optional reviewer notes

The server then re-analyzes that snapshot and updates the item.

Notes:

- `Frozen Styles Snapshot` is the recommended mode for manual labeling and visual review.
- The server analyzes the raw DOM when available, so the detector is not skewed by the freeze attributes added to the rendered snapshot.
