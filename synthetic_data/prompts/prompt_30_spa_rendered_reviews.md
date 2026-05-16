# Prompt 30 — SPA-Rendered Review Sections (React / Vue / Angular, 2016–2022)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_30/`  
**Era:** 2016–2022 (React 15/16/17, Vue 2/3, Angular 2+, SSR hydration output)  
**UGC type:** Product / service reviews — server-side rendered SPA output  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing the server-side rendered (SSR) HTML output of a React, Vue, or Angular application's review section. This is the HTML that arrives in the browser before JavaScript hydration — it contains the real review content but also the fingerprints of the framework: `data-reactid`, `data-reactroot`, `ng-version`, `data-v-XXXXXXXX` attributes, `<!--[-->` Vue comment nodes, `__nuxt` or `__NEXT_DATA__` script tags. Each of the 100 pages must vary across ALL of the following dimensions.

### Framework Fingerprints to Vary (pick one framework per page)

**React (Next.js / CRA SSR):**
- `<div id="__next">` root
- `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"reviews":[...]}},"page":"/products/[id]","query":{"id":"abc123"}}</script>`
- `data-reactroot` attribute on root element
- React SSR checksum: `data-react-checksum="1234567890"` on older React 16 pages
- Component-generated class names: `className` in JSX → `class` in output, sometimes hashed (`class="ReviewCard_container__3xKmP"`)
- Inline `__NEXT_DATA__` includes full review payload as JSON

**Vue (Nuxt.js SSR):**
- `<div id="__nuxt">` or `<div id="app">`
- `<script>window.__NUXT__={"data":[{"reviews":[...]}]}</script>`
- Scoped attribute on elements: `data-v-3a2f5c1d` (Vue component scoped CSS hash)
- Server-side rendered comment markers: `<!--[-->` and `<!--]-->` for v-for list boundaries
- `<nuxt>` or `<nuxt-child>` stubs on some pages

**Angular (Angular Universal SSR):**
- `ng-version="12.2.0"` attribute on `<app-root>`
- `_nghost-XXXXX-c123` and `_ngcontent-XXXXX-c123` attributes on host and child elements
- `<app-review-list _nghost-abc-c45>` component selectors as HTML tags
- `<!--ng-container-->` comment nodes
- Standalone `<style>` blocks with Angular-generated view encapsulation CSS

### Structural Dimensions to Vary
- Number of reviews: 6–25
- Review card structure: varies by framework — React might use functional components generating `<article>` tags, Vue uses `<div data-v-xxx>`, Angular uses custom element tags
- JSON data island: `__NEXT_DATA__` or `__NUXT__` includes reviews array (realistic JSON structure visible in source)
- CSS Modules / CSS-in-JS output: hashed class names on React pages (`ReviewCard_rating__AbCdE`); scoped attributes on Vue pages; view encapsulation attributes on Angular pages
- Hydration placeholder: `<div data-server-rendered="true">` on Vue, `<!-- __NEXT_DATA__ hydrated -->` comment on React
- Schema.org: `<script type="application/ld+json">` present on ~70% of pages
- ARIA: more comprehensive than legacy pages — `role="list"`, `aria-label`, `aria-describedby` common

### Content Dimensions to Vary
- Product/service types: SaaS subscription products, DTC e-commerce brands (2016–2022 era), streaming services, food delivery apps, fintech apps, online learning platforms
- Review content and length: mixed short/long, modern writing style
- Rating display: SVG star icons (inline SVG paths), emoji-based (⭐⭐⭐⭐), icon font
- Framework distribution: ~40% React/Next.js, ~35% Vue/Nuxt, ~25% Angular Universal

### Output Format
Single complete HTML file representing the SSR output (what the server sends before JS hydration). Include realistic framework fingerprints. Include the `__NEXT_DATA__` or `__NUXT__` or Angular boot script. Show a product name, aggregate score, and then the review list rendered as SSR HTML. Include hashed/scoped CSS class names appropriate to the chosen framework.
