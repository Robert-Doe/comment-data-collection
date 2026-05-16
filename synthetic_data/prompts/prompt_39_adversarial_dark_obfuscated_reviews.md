# Prompt 39 — Adversarial: Dark Pattern / Obfuscated Review Markup

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_39/`  
**UGC type:** Review sections using deliberate obfuscation — dynamic class names, shadow DOM fragments, misleading structure  
**Label:** Positive (UGC region present — but structurally adversarial)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section where the HTML structure is deliberately obfuscated or unconventional — as happens with CSS-in-JS libraries that generate random class names, review platforms that use non-standard markup to resist scraping, or sites that render reviews in unusual structural patterns. The reviews ARE present and visible, but their structure breaks conventional detection heuristics. Each of the 100 pages must vary across ALL of the following dimensions.

### Obfuscation Pattern Variants (pick 2–3 per page)

**1. Hashed / random class names (CSS-in-JS output):**
- Class names like `class="sc-bdXxxt kqWRSM"`, `class="css-1a2b3c4"`, `class="MuiBox-root css-1tu83q9"`, `class="emotion-0"` — no semantic meaning
- Review container: `<div class="sc-AxiKw fMzHPa">` — nothing indicates "review"
- Vary: styled-components hash format, Emotion format, MUI format

**2. Non-standard element nesting:**
- Reviews inside a navigation structure: `<nav><ul><li>` per review (unusual but technically valid)
- Reviews inside a `<table>` where each `<td>` is a review (but the table is not labeled as reviews)
- Reviews inside a `<details><summary>Product info</summary>` where the expanded content is the review section
- Reviews inside an `<aside>` with no `aria-label`

**3. Anti-scraping class rotation:**
- Class names are templated with rotating suffixes: `review-card-v3`, `review-item-2024q1`, `rw-block-type7` — as if the site rotates class names to break scrapers
- Timestamp: `class="ts-obf-2147483647"` where the number is Unix timestamp noise

**4. Fragmented review content:**
- Each review's text split across multiple non-adjacent DOM elements: rating in one `<div>`, text in another, reviewer name in a third, all visually assembled by CSS `position` or `order` in flexbox — but in DOM order they are interleaved with other page elements
- CSS `order` property causes visual reordering: review at position 3 in DOM appears first visually

**5. Misleading structural role:**
- Review section inside a `<form>` element (the whole section is wrapped as if it were a form)
- Review section inside a `<figure>` or `<figcaption>` 
- Reviews structured as a definition list `<dl>` where the pattern is non-standard

**6. Script-placeholder pattern:**
- `<div data-hydrate-reviews="true"><!-- hydrated by client JS --></div>` — but the page also contains the pre-rendered reviews OUTSIDE this div, in an unexpected location
- Reviews rendered in a `<template>` tag that is technically inert in the DOM

### HTML Characteristics
- DOCTYPE: `<!DOCTYPE html>`
- CSS: external `<style>` block with hashed class definitions (no semantic names)
- Despite obfuscated structure, the review CONTENT is real and readable: star ratings visible (Unicode ★ or SVG), review text present, reviewer name present
- The page is visually a clear review section to a human — just structurally obfuscated to machines
- NO schema.org, NO ARIA, NO meaningful class names (these are removed as part of obfuscation)
- Inline SVG for star ratings (not img or unicode — harder to match with regex)
- Review metadata embedded as `data-*` with hashed keys: `data-r7x2="4"` meaning rating=4

### Content Dimensions to Vary
- Product categories: anything — the obfuscation is the variable, not the product
- Review content: full-length, readable review text (the content signal should still be present)
- Obfuscation severity: mild (hashed classes but semantic structure), moderate (unusual nesting), severe (fragmented DOM + misleading roles)
- Number of reviews: 5–20

### Output Format
Single complete HTML file. The review section MUST be visually clear to a human reader (they can see the stars, read the review text, identify the reviewer). But the HTML structure should resist conventional pattern matching. Include a product name in an `<h1>`. Include the review section with chosen obfuscation patterns. The star ratings must be visually rendered (even if via SVG or CSS) without semantic markup.
