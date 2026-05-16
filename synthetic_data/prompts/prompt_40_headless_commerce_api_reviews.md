# Prompt 40 — Headless Commerce / API-First Review Pages (2020–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_40/`  
**Era:** 2020–present (Shopify Hydrogen, Commerce.js, BigCommerce Stencil, Medusa.js, Vercel Commerce)  
**UGC type:** Reviews in headless commerce / API-first storefront output  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section from a headless commerce storefront — the bleeding edge of e-commerce architecture where the frontend is fully decoupled from the backend. These sites are built with Shopify Hydrogen (React + Remix), Next.js Commerce, Commerce.js, Medusa.js, or BigCommerce with a custom frontend. The HTML output reflects this: Remix data attributes, React Server Components (RSC) output, Suspense boundaries, streaming SSR markers, and GraphQL-fetched data artifacts visible in inline `<script>` tags. Review sections are one of the last page components to be SSR'd (often streamed in after above-the-fold content). Each of the 100 pages must vary across ALL of the following dimensions.

### Framework Fingerprints to Vary

**Shopify Hydrogen (Remix-based):**
- `<html data-wf-locale="en-US" data-wf-domain="store.myshopify.com">` or `<html lang="en">`
- `<script>window.__remixContext = {"state":{"loaderData":{"routes/products/$handle":{"product":{"title":"...","reviews":[...]}}}}};</script>`
- Remix route module: `<script type="module" src="/build/routes/products.$handle.js?t=1234567890">`
- `data-remix-*` prefetch links in `<head>`
- `<Suspense>` fallback in SSR output: `<!--$?--><template id="B:0"></template><!--/$-->` (React Suspense SSR marker)
- Hydrogen-specific: `<ShopifyProvider>` component output, `<Money>` component rendered as `<span>$XX.XX</span>`

**Next.js Commerce:**
- `<div id="__next">` root
- `<script id="__NEXT_DATA__">` with full product + reviews JSON payload
- Next.js Image: `<img src="/_next/image?url=...&w=828&q=75" data-nimg="1">`
- RSC payload: `<script>self.__next_f.push([1,"...encoded RSC payload..."])</script>` (Next.js 13+ App Router)
- `<link rel="preload" as="fetch" href="/_next/data/BUILD_ID/products/slug.json" crossOrigin="anonymous">`

**Medusa.js / Custom React:**
- `<div id="root">` or `<div id="app">`
- `window.__medusa_config__ = {"storefront_url":"https://...","publishable_api_key":"pk_..."}`  
- Clean React SSR output with Tailwind classes

### Structural Dimensions to Vary
- Number of reviews shown in initial SSR payload: 5–15 (rest loaded via API after hydration)
- "Loading more reviews..." Suspense placeholder: `<div aria-busy="true" aria-label="Loading reviews">` skeleton cards
- Review section streamed in: `<!--$-->` ... `<!--/$-->` React streaming markers wrapping review list
- GraphQL fragment visible in page: `<!-- Fragment: ReviewsFragment loaded via GraphQL -->`
- Inline review data in script: `<script type="application/json" id="reviews-data">[{"id":"gid://shopify/ProductReview/123","body":"...","rating":5}]</script>`
- RSC (React Server Component) markers: `<!-- This component was rendered on the server -->`
- Image optimization: Next.js `srcset` with `/_next/image` URLs, or Cloudinary CDN transforms
- Web Vitals optimization: `<link rel="preload" as="image" href="/reviews/avatar-default.webp">` for above-fold avatars

### HTML/CSS Characteristics
- DOCTYPE: `<!DOCTYPE html>` always
- CSS: Tailwind utility classes dominant; CSS custom properties from design system; shadcn/ui component classes on some (`class="rounded-md border bg-card text-card-foreground shadow-sm"`)
- Semantic HTML: `<main>`, `<section>`, `<article>` per review — modern headless sites tend toward good semantics
- ARIA: comprehensive — `aria-label`, `aria-describedby`, `role="list"`, `aria-live="polite"` on loading states
- Schema.org JSON-LD: always present, often richly annotated with `@type: "Product"` + `"review"` array + `"aggregateRating"`
- Streaming SSR markers: React Suspense boundary markers in HTML comments
- Dark mode: `class="dark"` on `<html>` with CSS custom property switching

### Content Dimensions to Vary
- DTC brand categories: premium apparel, beauty, wellness, home goods, specialty food, outdoor gear — typical headless commerce verticals
- Review quality: modern, short-to-medium length, mobile-typed feel
- Platform fingerprint distribution: ~35% Shopify Hydrogen/Remix, ~40% Next.js Commerce, ~25% Medusa/custom

### Output Format
Single complete HTML file. Include the full headless commerce framework fingerprints in `<head>` and `<body>`. Show the product header with name, price, and aggregate rating. Then the review section — include streaming SSR markers, inline JSON data island, and Tailwind-styled review cards. Include `<script type="application/ld+json">` with full structured data. This represents the current state-of-the-art of e-commerce review presentation.
