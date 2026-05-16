# Prompt 21 — Legacy Table-Based Star Reviews (1998–2004)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_21/`  
**Era:** 1998–2004 (Epinions, CNET, early Amazon, early eBay seller feedback)  
**UGC type:** Product / service reviews — legacy era  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a product or service review section from the era of 1998–2004, when review sites like Epinions, CNET Reviews, Deja.com, and early Amazon used HTML `<table>` elements for ALL layout. Star ratings were rendered as `<img>` tags pointing to GIF files. There was no AJAX, no schema.org, no CSS frameworks — just presentational HTML. Each of the 100 pages must vary across ALL of the following dimensions — no two pages should feel identical.

### Structural Dimensions to Vary
- Number of reviews: 3–12
- Star rating rendering: `<img src="stars3.gif">` images, or a row of `<img src="star_full.gif">` + `<img src="star_empty.gif">`, or plain text "Rating: 4 out of 5"
- Review card structure: each review in its own `<table>` or as rows in one large `<table>`
- Whether there's an aggregate rating summary table at top (some early review sites had one, some didn't)
- Column layout: 2-column table (rating sidebar | review body) or single-column stacked
- Reviewer metadata: "Reviewer: username" and "Member since: 2001" in a `<td>` on the left
- "Was this review helpful?" Yes/No links — present on 40% of pages (early Amazon feature)
- Review submission form at bottom on some pages (all `<table>` layout, `<input>` and `<textarea>` inside `<td>`)

### HTML Characteristics (must era-accurately reflect 1998–2004)
- DOCTYPE: `HTML 4.01 Transitional` or none at all
- Presentational attributes: `bgcolor`, `cellpadding`, `cellspacing`, `border`, `valign`, `align`, `width` in pixels or percentages
- `<font face="Arial" size="2" color="#333333">` tags everywhere
- `<b>` and `<i>` for emphasis — NO `<strong>` or `<em>`
- NO CSS classes for layout — only `style=""` attributes if at all, and even then sparingly
- Colors: `#336699`, `#CCCCCC`, `#FFFFEE`, `#336600`, `#CC0000` in `bgcolor`
- NO semantic HTML: no `<article>`, `<section>`, `<time>`, `<header>`, `<footer>`
- NO ARIA attributes, NO schema.org, NO microdata
- NO JavaScript or dynamic behavior — pure static HTML
- Horizontal separator bars: `<table width="100%" bgcolor="#999999" height="1" cellpadding="0" cellspacing="0"><tr><td></td></tr></table>`

### Content Dimensions to Vary
- Product categories: electronics (CD players, digital cameras, modems), software (Windows XP, Office), DVDs, books, kitchen appliances, cars, ISP services, web hosting
- Review prose style: formal ("I purchased this item in October 2002"), casual ("This thing rocks!"), detailed technical
- Star scale: 1–5 or 1–10 depending on site style
- Date formats: "October 15, 2002", "10/15/02", "Posted: Oct 2002"
- Review titles: bold `<b>` headline above body on Epinions-style pages, absent on others
- Reviewer post count: "Reviews written: 47" shown on some
- "Pros:" and "Cons:" labeled sections common in the Epinions style (plain text labels in `<b>`)
- "Bottom Line:" summary sentence at end of some reviews

### Site Style Variants (rotate across the 100 pages)
- Epinions clone: cream/tan background, left-rail reviewer info, star GIF images
- CNET clone: gray/blue header, compact table, 10-point scale
- Early Amazon clone: white background, orange/black accents, "X of Y people found this helpful"
- Early eBay feedback clone: compact rows, positive/neutral/negative labels with colored text

### Output Format
Single complete HTML file. Use realistic placeholder product names, usernames, and review content from that era. Vary the product categories widely. Do NOT use Bootstrap, jQuery, CSS grid, flexbox, or any post-2004 technology.
