# Comment Data Collection

Playwright-based UGC/comment region detection over a CSV of sites.

## Install

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

## Run

```powershell
node src/detect-ugc.js --input .\sites.csv --output .\output\ugc-results.json --url-column url
```

Useful flags:

- `--limit 50`
- `--concurrency 3`
- `--max-candidates 25`
- `--max-results 5`
- `--headful`

If `--url-column` is omitted, the script auto-detects common URL column names such as `url`, `site`, `website`, `link`, or `href`.
