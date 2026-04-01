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
8. Keep the scanner page open on that job. It now continues polling after completion, so the uploaded snapshot should appear in the UI within a few seconds without a manual refresh.

Fallback:

- If auto-match cannot find the scanner row, use the `Advanced Fallback` section and paste the config JSON from the web app.

The extension uploads:

- a raw DOM snapshot for analysis
- an optional frozen-styles HTML snapshot for offline review
- the visible screenshot from the current browser viewport
- the current URL and page title
- optional reviewer notes

The server then re-renders that stored snapshot, saves its own rendered screenshot, re-analyzes the DOM state, and updates the item.

Notes:

- `Frozen Styles Snapshot` is the recommended mode for manual labeling and visual review.
- The server uses the frozen/styled snapshot for screenshot rendering when available, so the saved rendered image is closer to what you saw in the browser.
- The server still uses the raw DOM for structural candidate detection when available, so the detector is less skewed by the freeze attributes added to the rendered snapshot.
- Normal automated scans also do a bottom-loading scroll pass before detection so comment panes that only appear after scrolling, such as some YouTube pages, have a better chance of being loaded before analysis.
