# Prompt 25 — Early Mobile / WAP-Simplified Review Pages (2007–2012)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_25/`  
**Era:** 2007–2012 (WAP 2.0 / XHTML-MP, early iPhone/Android mobile web, "m.site.com" subdomains)  
**UGC type:** Product / venue reviews — mobile-optimized stripped-down versions  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing the mobile version of a review section from 2007–2012 — the era when sites maintained separate "m.site.com" subdomains for mobile browsers (before responsive design). These pages were stripped to bare essentials for WAP 2.0 (XHTML Mobile Profile) or early iPhone Safari. Review sections are minimal: small text, no images (or tiny thumbnails), no JavaScript, no CSS animations, everything linear and stacked. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 3–8 (mobile pages showed fewer)
- "View full site" link in header or footer (linking to the desktop version)
- "Load more reviews" — a simple `<a href="?page=2">Next 5 reviews</a>` (no JS)
- Star rating: text-only ("4/5 stars"), Unicode stars (★★★☆☆), or a very small `<img src="s4.gif" width="60" height="12">`
- Review summary: truncated with "[...] Read full review" link on some pages
- Reviewer name only — NO avatar, NO post count, NO social links
- Date: abbreviated ("Mar 2009", "3/15/09")
- "Helpful" voting: absent on WAP pages, present as simple text links ("Helpful? Yes | No") on early iPhone pages
- Category score breakdown: absent or very minimal (just one overall score)
- `<meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0;">` present

### HTML Characteristics (era-accurate mobile 2007–2012)
- DOCTYPE: `<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.0//EN" "http://www.wapforum.org/DTD/xhtml-mobile10.dtd">` on WAP pages, OR minimal `<!DOCTYPE html>` on early iPhone-era pages
- `<html xmlns="http://www.w3.org/1999/xhtml">` on XHTML-MP pages
- Self-closing tags: `<br />`, `<img />` (XHTML-MP requirement)
- Absolutely NO JavaScript (WAP pages) or `<noscript>` fallback shown on some
- CSS: `<style>` block with `body { font-family: Arial, sans-serif; font-size: 14px; margin: 8px; padding: 0; }` — minimal, mobile-safe properties only
- NO floats, NO `position: absolute`, NO multi-column layout
- All content stacked vertically, full-width
- `<table>` used occasionally for score grid but single-column for review cards
- `<h1>` for page title, `<h2>` for review titles — heading hierarchy present but sparingly
- Colors: near-black text (#222 or #000) on white (#FFF) — high contrast for small screens
- Touch-friendly links: `<a>` tags with generous padding via `style="display:block; padding:8px 0;"`

### Content Dimensions to Vary
- Site style variants: mobile Yelp clone ("m.yelp.com" style), mobile Amazon ("m.amazon.com"), mobile restaurant finder, mobile hotel booking, mobile app review board (before app stores dominated)
- Product/venue types: restaurants, hotels, mobile phones (Nokia, Sony Ericsson, HTC), mobile carriers/tariffs, local shops
- Review content: short, punchy mobile-typed prose ("Good food, will return", "Battery dies fast. Not worth it.")
- WAP-specific vs iPhone-specific structural choices: WAP pages even more stripped (no CSS at all), iPhone era pages with viewport meta and minimal CSS
- "Are you looking for the mobile or full site?" banner on some pages

### Output Format
Single complete HTML file. Intentionally compact and minimal — this is a mobile page, not a desktop page. Include a page header showing the site name, the product/venue name, the aggregate score, and then the review list. Keep the page visually sparse — that is era-authentic. NO Bootstrap, NO CSS grid, NO flexbox, NO JavaScript.
