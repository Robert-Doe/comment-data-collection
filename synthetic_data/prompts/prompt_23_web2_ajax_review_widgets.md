# Prompt 23 — Web 2.0 AJAX-Era Review Widgets (2005–2010)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_23/`  
**Era:** 2005–2010 (XMLHttpRequest, Prototype.js, jQuery 1.x, "rounded corners" design era)  
**UGC type:** Product / service reviews — Web 2.0 AJAX-enhanced widgets  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a product review section from the Web 2.0 era (2005–2010), when sites adopted AJAX loading, star-rating widgets built from JavaScript image-swaps, and "rounded corners" CSS box styling. This era is defined by the transition away from full-page table layouts toward `<div>`-based component islands — but still using inline styles, no CSS grid/flexbox, and no semantic HTML5 tags. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 5–15
- AJAX load pattern: render the review section as if it were returned by an XMLHttpRequest partial — include a wrapping `<div id="review-container">` or `<div id="reviewsArea">` with a comment like `<!-- AJAX partial begin -->`
- "Write a review" tab panel (static rendered as active) vs. simple link to a form page
- "Sort by:" dropdown (Most Helpful | Most Recent | Highest Rated) — rendered as a static `<select>` with `onchange` stub
- Pagination with `<a href="javascript:loadPage(2)">` style links (nonfunctional in static page)
- "Helpful" vote tally: "X of Y found this review helpful" with Yes/No links (`href="javascript:voteHelpful(123, 1)"`)
- Star rating widget: row of `<img>` swapped by JS on hover, or a static `<div>` with width-clipped star sprite image
- Aggregate score panel at top of section (average stars + distribution bar chart via `<div style="width: Xpx; background: #FFCC00">`)

### HTML/CSS Characteristics (era-accurate 2005–2010)
- DOCTYPE: `XHTML 1.0 Transitional` or `HTML 4.01 Transitional`
- Layout: `<div>`-based columns, NO `<table>` for layout (transitional era — some residual table use OK for rating grids)
- Inline styles dominant: `style="float:left; margin:5px; padding:8px; background:#F8F8F8; border:1px solid #DDDDDD; -moz-border-radius:6px; -webkit-border-radius:6px;"`
- Web 2.0 visual cues: subtle drop shadows (`filter: progid:DXImageTransform.Microsoft.Shadow(...)`), gradient backgrounds via `background: #E8E8FF url(bg_gradient.png) repeat-x top left`
- Color palette: blues (#336699, #4477AA), oranges (#FF9900, #FF6600), greens (#339900), light grays (#F5F5F5, #EEEEEE)
- `<span class="rating">`, `<div class="reviewItem">`, `<div class="reviewAuthor">` — functional class names but NO framework classes
- NO semantic HTML5 tags, NO ARIA, NO schema.org
- JavaScript stubs in `<script type="text/javascript">` blocks — functions defined but body says `// AJAX call would go here`
- Prototype.js or jQuery `$()` patterns in stub functions (non-executing on static page)
- Avatar: `<img src="avatar_default.gif" style="border:1px solid #CCCCCC">` in review header

### Content Dimensions to Vary
- Product categories: Web 2.0 era products — digital cameras, external hard drives, flat-panel TVs (1080p was new), GPS units (Garmin, TomTom), Blu-ray vs. HD-DVD players, early smartphones (Motorola RAZR, Windows Mobile devices), broadband modems
- Review prose style: early-internet informal ("I bought this on sale at Best Buy and honestly"), enthusiast forum transplant ("specs are solid but real-world performance is meh"), shopping site generic ("great product fast shipping")
- Rating scale: 1–5 stars (most), 1–10 on some pages mimicking CNET/Engadget influence
- Date formats: "December 3, 2007", "Dec 3, 2007", "12/03/07", "3 days ago" (as if dynamic)
- Username styles: FirstnameLastInitial, forum handles, "Anonymous" on some

### Output Format
Single complete HTML file. Include a product name, product image placeholder (`<img src="product_thumb.jpg">`), product price, and "Add to Cart" link at the top. Then the reviews widget. Use realistic fictional product names (brand names + model numbers from the era). NO Bootstrap, NO CSS grid, NO flexbox.
