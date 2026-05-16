# Prompt 26 — Schema.org Microdata Review Pages (2011–2016)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_26/`  
**Era:** 2011–2016 (schema.org launched June 2011, Google Rich Snippets, microdata over RDFa)  
**UGC type:** Product / service / local business reviews — schema.org microdata annotated  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section from the schema.org microdata era (2011–2016), when Google, Bing, and Yahoo announced schema.org and site developers began adding `itemscope`, `itemtype`, and `itemprop` attributes to HTML to earn rich snippets (star ratings in search results). Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 5–20
- Aggregate review block: `<div itemscope itemtype="https://schema.org/AggregateRating">` with `itemprop="ratingValue"`, `itemprop="reviewCount"`, `itemprop="bestRating"` at the top of the section
- Individual review: `<div itemscope itemtype="https://schema.org/Review">` per review card
- Reviewer identity: `<span itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">...</span></span>`
- Rating: `<span itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating"><meta itemprop="ratingValue" content="4"><meta itemprop="bestRating" content="5"></span>` alongside visible star display
- Date: `<time itemprop="datePublished" datetime="2014-06-15">June 15, 2014</time>`
- Review body: `<span itemprop="reviewBody">` or `<div itemprop="description">`
- Item reviewed: `<span itemprop="itemReviewed" itemscope itemtype="https://schema.org/Product"><span itemprop="name">...</span></span>`
- "Review of:" breadcrumb using itemprop on page-level schema
- Some pages also include `itemprop="image"`, `itemprop="brand"`, `itemprop="model"` on the product

### HTML/CSS Characteristics (2011–2016 transitional era)
- DOCTYPE: `<!DOCTYPE html>` (HTML5 doctype — schema.org was designed for HTML5)
- Layout: `<div>`-based cards with CSS via `<style>` block — NO Bootstrap (40% of pages) OR Bootstrap 2.x (60% of pages, but only basic panel classes)
- Semantic tags used where appropriate: `<article>` per review on some, `<section class="reviews">` as container on some — but inconsistently applied (half the pages skip semantics entirely)
- CSS star ratings: `<span class="stars stars-4">` with CSS sprite approach, OR Unicode ★ characters, OR `<img>` GIF stars
- Avatar: circular avatar via `border-radius: 50%` (new in this era) on some; gravatar-style `<img>` on others
- ARIA: absent on most pages (not yet standard practice for reviews); minimal `aria-label` on some newer pages
- Color palette: transitional — some pages still use corporate blue/gray, others use flat design (#E74C3C, #3498DB, #2ECC71, #F39C12)
- JSON-LD alternative: some pages use BOTH microdata in HTML AND a `<script type="application/ld+json">` block (JSON-LD was gaining traction from 2013 onward)

### Content Dimensions to Vary
- Review categories: consumer electronics (tablets, smartphones, smart TVs), software (mobile apps, SaaS tools), local businesses (restaurants, gyms, spas), e-commerce product pages, hotels, courses
- Site style variants: product page with reviews below the fold, dedicated review hub page, local business directory, B2C e-commerce with reviews integrated into product detail page
- Schema.org type variety: `Product`, `LocalBusiness`, `Book`, `Movie`, `Software`, `Hotel`, `Course` — vary across pages
- Review length: one-sentence to multi-paragraph
- Date range: 2011–2016 (vary dates realistically across pages)

### Output Format
Single complete HTML file. Include a `<head>` with appropriate meta tags. The product/business entity should have full schema.org annotation at the page level. Reviews section below with per-review microdata. Use realistic fictional product names, business names, and reviewer names. Vary the schema.org item type across pages.
