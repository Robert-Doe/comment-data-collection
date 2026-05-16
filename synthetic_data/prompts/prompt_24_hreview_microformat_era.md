# Prompt 24 — hReview / hAtom Microformat Reviews (2005–2011)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_24/`  
**Era:** 2005–2011 (microformats.org hReview 0.2/0.3, hAtom, vCard in class attributes)  
**UGC type:** Product / service / venue reviews — microformat-annotated  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section from the microformat era (2005–2011), when developers used class-name-based semantic annotations (`class="hreview"`, `class="reviewer vcard"`, `class="rating"`, `class="summary"`) to make HTML parseable by search crawlers without proprietary markup. This predates schema.org by years. Sites using hReview include early Yelp (2005–2007), travel review sites, restaurant guides, and tech blogs. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 4–12
- hReview version cues: `class="hreview"` root element on each review block
- Reviewer identity: `class="reviewer vcard"` containing `class="fn"` (full name) and optionally `class="url"` and `class="email"`
- Rating: `class="rating"` with a nested `<span class="value">4</span>` and `<span class="best">5</span>`, OR as an `<abbr class="rating" title="4">★★★★</abbr>`
- Review summary: `<span class="summary">` or `<h3 class="summary">` — a short title for the review
- Review body: `<span class="description">` or `<div class="description">`
- Item reviewed: `<span class="item"><span class="fn">Product Name</span></span>` at top of review
- Date: `<abbr class="dtreviewed" title="2008-03-15">March 15, 2008</abbr>` (ISO date in title attr)
- Aggregate: `class="aggregate hreview-aggregate"` block with `class="count"` and `class="rating"`
- "Version" field: `<span class="version">1.3</span>` on software reviews

### HTML/CSS Characteristics (era-accurate 2005–2011)
- DOCTYPE: `XHTML 1.0 Strict` or `XHTML 1.0 Transitional` (microformat era preferred XHTML)
- Layout: `<div class="hreview">` blocks with floated avatar on left, review body on right — via `style="float:left"` on elements
- Self-closing tags: `<br />`, `<img />`, `<hr />` (XHTML style)
- Star display: Unicode stars (★★★★☆) or `<img src="stars_4.gif">` — but always with the machine-readable class-annotated version also present
- CSS in `<style>` block in `<head>`: class-based rules like `.hreview { border-bottom: 1px solid #CCCCCC; padding: 12px 0; }` — minimal, functional
- Color palette: muted early Web 2.0 — `#666`, `#999`, `#333`, `#F9F9F9` backgrounds, link color `#0066CC`
- NO HTML5 semantic tags (`<article>`, `<section>`, `<time>` — too new)
- NO ARIA attributes
- NO schema.org
- `<abbr title="">` used for machine-readable dates and ratings (microformat pattern)
- Breadcrumb navigation present on most pages using `class="breadcrumb"` list

### Content Dimensions to Vary
- Review categories: restaurants, hotels, books, software, consumer electronics, local services (plumber, dentist), events
- Site style variants: restaurant guide clone, travel site clone, tech product review blog, local business directory
- Reviewer metadata depth: some with full vcard (fn, url, org), some with just `class="fn"` name
- Review length: one-sentence capsule to 4-paragraph detailed assessment
- Language: English only (microformat era sites rarely handled RTL)
- Product/venue names: realistic fictional (period-appropriate — 2005–2011 products and restaurants)

### Output Format
Single complete HTML file with a `<head>` containing a `<link rel="profile" href="http://microformats.org/profile/hreview">` tag (microformat convention). Include a page title like "[Venue/Product] Reviews — [Site Name]". Then render the review section. Use realistic hReview class annotations throughout. NO Bootstrap, NO CSS grid, NO flexbox.
