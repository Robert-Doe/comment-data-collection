# Prompt 36 — Adversarial: Zero-Identifier Review Blocks (No Classes, No ARIA, No Schema)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_36/`  
**UGC type:** Reviews with no semantic markers — maximum detection difficulty  
**Label:** Positive (UGC region present — but with no keyword/schema/aria signals)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section that has been stripped of all conventional semantic markers. There are NO `class` attributes, NO `id` attributes, NO ARIA attributes, NO schema.org microdata, NO JSON-LD, NO `itemprop`, NO hreview classes, NO data attributes. The reviews are conveyed purely through raw HTML element structure and visible text. This is the hardest possible case for automated UGC detection — the detector must infer "this is a review section" from structural patterns in unadorned HTML and visible text content alone.

### Generation Rules (strictly enforced)
- ABSOLUTELY NO class attributes on any element (except where the class IS the visible content)
- ABSOLUTELY NO id attributes
- ABSOLUTELY NO aria-* attributes
- ABSOLUTELY NO itemscope / itemtype / itemprop attributes
- ABSOLUTELY NO data-* attributes
- ABSOLUTELY NO schema.org JSON-LD script blocks
- ABSOLUTELY NO hreview / vcard / microformat class names
- All layout via inline `style=""` attributes OR presentational HTML elements (`<table bgcolor="">`, `<font>`, `<b>`)

### Structural Dimensions to Vary
- Number of reviews: 5–20
- Review "card" structure: purely positional — `<div style="border:1px solid #ccc; padding:12px; margin-bottom:10px">` with no class
- Star rating display: Unicode stars (★★★★☆) in a `<span>` with no class or aria-label, OR plain text "4 out of 5 stars", OR a row of `<img src="star.gif">` with no alt text
- Reviewer info: plain `<p>` or `<span>` containing "By: Username — March 2019" — no semantic wrapper
- Review title: `<b>` or `<strong>` heading with no surrounding structure
- Review body: plain `<p>` tags with review text
- Date: plain text, no `<time>` element
- Helpful votes: "X people found this helpful" in a plain `<p>` or `<small>` tag
- Aggregate score: a number or star string in a `<p>` near the top — no semantic container

### HTML Characteristics
- Era mix: use different eras' HTML structures but strip ALL class/id/aria/schema markers:
  - Ancient: `<table><tr><td>★★★★☆</td><td><b>Great product</b><p>...</p></td></tr></table>` but no class or bgcolor
  - Modern-looking but stripped: `<div style="display:flex; gap:12px; padding:12px; border-bottom:1px solid #eee">` with no class
  - Some pages: pure `<p>` tags stacked vertically — each review is just paragraphs
  - Some pages: `<ul><li>` lists where each `<li>` contains a review
  - Some pages: `<dl><dt>Rating</dt><dd>4/5</dd><dt>Review</dt><dd>text</dd></dl>` definition list format
- Inline styles only for layout — no stylesheet, no CSS classes
- NO `<article>`, NO `<section>` unless used without any attributes
- Allowed HTML: `<div>`, `<span>`, `<p>`, `<b>`, `<i>`, `<table>`, `<tr>`, `<td>`, `<ul>`, `<li>`, `<dl>`, `<dt>`, `<dd>`, `<hr>`, `<br>`, `<img>`, `<h1>`–`<h6>`

### Content Dimensions to Vary
- Product categories: varied — any product or service
- Review text: full, real-length review prose (the TEXT signal must be present even if structural signals are absent)
- Page header: product name in an `<h1>` or `<h2>` with no attributes — the page is recognizable as a product review page from the text content
- Rating scales: 1–5 stars (text/Unicode), 1–10 numeric, thumbs up/down count
- Reviewer names: first name, username format, "Anonymous", "Verified Buyer" — as plain text only

### Output Format
Single complete HTML file. No external CSS. No `<style>` block with class rules. Pure structural HTML. The page must still be RECOGNIZABLE as a review section to a human reader — just not to a machine relying on keyword or schema matching. This forces detector to use structural heuristics.
