# Prompt 29 — AMP (Accelerated Mobile Pages) Review Sections (2016–2021)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_29/`  
**Era:** 2016–2021 (Google AMP Project — amp-list, amp-bind, custom elements)  
**UGC type:** Product / business reviews — AMP-rendered pages  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing an AMP (Accelerated Mobile Pages) version of a product or business review page, as sites published from 2016–2021. AMP pages have a highly distinctive HTML structure: the `<html amp>` attribute, the AMP boilerplate `<style>` block, custom `<amp-*>` elements, strict CSS-in-head rules (no external CSS), and no JavaScript (only AMP script tags). Review sections in AMP use `<amp-list>` to fetch review data or render statically with `<amp-state>`. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 4–15 (rendered statically or as `<amp-list>` placeholder with static fallback)
- AMP list pattern: `<amp-list src="https://example.com/api/reviews?product=123" layout="responsive" width="400" height="600"><template type="amp-mustache">{{reviewBody}}</template></amp-list>` with static fallback inside `<div placeholder>`
- Rating display: `<amp-img src="stars-4.svg" width="80" height="16" layout="fixed" alt="4 out of 5 stars">` or text-based
- "Load more" via `<amp-list load-more="auto">` on some pages
- `<amp-accordion>` for collapsible older reviews on some pages
- `<amp-bind>` for sort toggle: `[class]="selectedSort == 'helpful' ? 'active' : ''"` on filter buttons
- "Write a Review" link: `<a href="/reviews/submit?product=123" rel="nofollow">Write a review</a>` (no forms in AMP — links to canonical)
- AMP sidebar menu: `<amp-sidebar>` with navigation on some pages
- Structured data: `<script type="application/ld+json">` with full schema.org Review/AggregateRating always present (AMP encourages this)

### HTML Characteristics (AMP-compliant markup)
- Opening tag: `<!doctype html><html ⚡>` or `<!doctype html><html amp>`
- Required AMP boilerplate in `<head>`:
  ```html
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}...</style>
  <noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
  ```
- AMP runtime script: `<script async src="https://cdn.ampproject.org/v0.js"></script>`
- AMP component scripts: `<script async custom-element="amp-list" src="https://cdn.ampproject.org/v0/amp-list-0.1.js"></script>` etc.
- `<link rel="canonical" href="https://www.example.com/product/reviews">` always present
- All CSS in `<style amp-custom>` block — NO external stylesheets, NO `!important`
- Images: `<amp-img src="" width="X" height="Y" layout="responsive">` — NO plain `<img>` tags
- NO `<script>` tags other than AMP runtime and component scripts
- `<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">`

### Content Dimensions to Vary
- Site types: news site review section (AMP was big for news), recipe site with user reviews, local business review page (Google Search AMP link), travel review, product review on small e-commerce site
- Review content: varied lengths and styles
- Schema.org type: `Product`, `LocalBusiness`, `Recipe`, `Hotel` — vary across pages
- Date: `<time datetime="2019-04-22">April 22, 2019</time>` always use `<time>` (AMP best practice)
- Language: English (AMP had good multilingual support but vary only English for this prompt)

### Output Format
Single complete, valid AMP HTML file. Must include the full AMP boilerplate. Use `<amp-img>` instead of `<img>`. Include a `<script type="application/ld+json">` structured data block. Vary the AMP components used across pages (amp-list, amp-accordion, amp-bind, amp-sidebar). Include the product/business header, then the AMP-rendered review section.
