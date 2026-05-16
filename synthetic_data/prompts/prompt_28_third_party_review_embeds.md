# Prompt 28 — Third-Party Review Widget Embeds (2012–2019)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_28/`  
**Era:** 2012–2019 (Bazaarvoice, PowerReviews, TrustPilot widget, Yotpo, Stamped.io)  
**UGC type:** Product / service reviews — third-party platform widget embeds  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing the output of a third-party review platform widget embedded on a retailer or brand's product page. From 2012–2019, large e-commerce sites licensed review platforms like Bazaarvoice, PowerReviews, TrustPilot, Yotpo, or Stamped.io. These platforms injected a distinct, self-contained review widget into the host page — often inside an `<iframe>` stub or a specifically-named `<div>` that the platform script would populate. Because the platform controlled the markup, widget HTML has a distinctive appearance: namespaced CSS classes, vendor-specific data attributes, and template-generated structure. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 5–25
- Widget injection pattern: `<div id="BVRRContainer">` (Bazaarvoice), `<div id="powerreviews-root">`, `<div data-bv-show="reviews" data-bv-product-id="sku-12345">`, `<div class="yotpo yotpo-main-widget">` (Yotpo), `<div id="trustbox" data-template-id="5419b732fbfb950b10de65e5">` (TrustPilot)
- Static-rendered widget content inside the div (simulating what the JS would inject)
- Platform watermark/branding: "Powered by Bazaarvoice", "Reviews by PowerReviews", "Powered by Yotpo" footer
- Filter bar: "All Reviews | 5 Star | 4 Star | Verified Buyers | With Photos"
- "Syndicated" indicator: some reviews show "Originally posted on [PartnerSite.com]" — Bazaarvoice content syndication feature
- "Most helpful positive review" and "Most helpful critical review" pinned at top (Amazon-style feature adopted by Bazaarvoice)
- Q&A section alongside reviews on some pages (Bazaarvoice "Answers" module)
- Photo/video review thumbnails: `<img src="ugc-photo-thumb.jpg" class="bv-photo-thumbnail">` on some reviews
- Badge system: "Verified Purchaser", "Brand Ambassador", "Incentivized Review" disclosure labels

### HTML/CSS Characteristics (third-party widget style)
- DOCTYPE: `<!DOCTYPE html>` (host page is modern HTML5)
- Host page wrapper: normal Bootstrap or custom grid, then the review widget div
- Widget interior classes: vendor-prefixed like `bv-content-review`, `pr-review-snippet`, `yotpo-review`, `stamped-review-header` — NOT Bootstrap classes
- Data attributes on widget elements: `data-rating="4"`, `data-review-id="12345678"`, `data-content-locale="en_US"`
- CSS: host page has its own stylesheet; widget has inline styles or a namespaced stylesheet block (simulated as `<style>.bv-cv2-cleanslate .bv-content-review { ... }</style>`)
- Platform-specific CSS namespace: Bazaarvoice uses `.bv-cv2-cleanslate` isolation class, PowerReviews uses `.p-w-r` prefix
- ARIA: some platforms injected good ARIA (`role="list"`, `aria-label="Customer Reviews"`), others did not — vary across pages
- Schema.org JSON-LD: present as a `<script type="application/ld+json">` block on ~50% of pages (platforms began generating this automatically)
- Avatar: initials-based circular avatar (`<div class="bv-author-avatar">JD</div>`) common in this era (no real photos for privacy)

### Content Dimensions to Vary
- Product categories: consumer packaged goods (shampoo, vitamins), apparel, home appliances, outdoor gear, baby products, pet supplies, electronics accessories — typical Bazaarvoice/PowerReviews client categories
- Platform simulation: vary which platform each page simulates (Bazaarvoice, PowerReviews, Yotpo, Stamped, TrustPilot, G2 Crowd widget)
- Review content: mix of short ("Love it!"), medium (2–3 sentences), and long (structured with pros/cons headers)
- Syndicated reviews vs. native-site reviews: some pages mix both types with the "Syndicated" badge
- Date formats: "October 2, 2017", "2 months ago", "10/02/17", `<time datetime="2017-10-02">`

### Output Format
Single complete HTML file. Render the host product page with a product name, price, and brief description at the top, then the third-party widget div (with its vendor-specific class/id). Simulate the widget content that the platform JS would have injected — use realistic vendor-specific class names and data attributes. Vary the simulated platform across pages.
