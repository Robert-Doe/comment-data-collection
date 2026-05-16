# Prompt 38 — Adversarial: Reviews Behind Access Barriers (Paywalled / Login-Gated)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_38/`  
**UGC type:** Review sections partially or fully hidden behind login/paywall walls  
**Label:** Positive (UGC region present — but partially or fully obstructed)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section where the review content is partially or fully gated behind a login wall or paywall. The STRUCTURE of the review section is visible and the UGC region is clearly present — but the content is obscured by overlays, blur effects, truncation, or access barriers. This is an important adversarial case: the page IS a review section, the review cards ARE in the DOM, but they are obstructed. Each of the 100 pages must vary across ALL of the following dimensions.

### Gate Pattern Variants (pick one primary pattern per page)

**1. Full blur overlay:**
- 2–4 reviews visible fully, then remaining reviews blurred: `<div style="filter: blur(4px); pointer-events: none;">`
- Modal/overlay div positioned over blurred content: `<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.7);">`
- CTA inside overlay: "Sign in to read all reviews" or "Subscribe to access full reviews"

**2. Truncation with "Read more" gate:**
- All reviews shown but each body is cut after 2 sentences: "This product has been absolutely..." `[...] Sign in to read full review`
- "Showing 3 of 47 reviews. Sign in to see all reviews."

**3. Total content lock:**
- Review section shows only the aggregate rating and a list of reviewer avatars/names
- All review bodies replaced with a lock icon: `<span>🔒 Premium content</span>`
- "See what 1,243 customers said — join free" CTA

**4. Metered access:**
- "You've viewed 2 of your 3 free reviews this month" notice
- First 2 reviews fully visible, third review blurred
- "Get unlimited reviews with Pro — $9/month" paywall card

**5. Regional lock:**
- "Reviews for this product are not available in your region"
- Review ghost cards shown as skeleton/shimmer placeholders
- Actual review text replaced with greyed placeholder bars: `<div style="height:12px; background:#E0E0E0; border-radius:4px; width:80%; margin:4px 0;">`

**6. Account tier lock:**
- "Verified purchasers only can view reviews" notice
- Review cards shown but bodies are asterisk-masked: "This product is ******* for anyone who needs *******"

### HTML Characteristics
- Era mix: vary across Bootstrap-era, modern React SSR output, legacy table-based, AMP — the gating pattern is era-agnostic
- Gate overlay: `position: relative` on review section container, `position: absolute` on overlay — pure CSS positioning
- ARIA: `aria-hidden="true"` on blurred content on some pages; `role="dialog"` on modal overlay on some
- Schema.org: still present in JSON-LD (search engines can still index it), `reviewCount` matches total even if not all visible
- "Sign in" / "Create account" CTAs in gate: `<a href="/login">` or `<button>` styled prominently
- Skeleton loaders for gated review slots: gray shimmer rectangles at appropriate heights

### Content Dimensions to Vary
- Product/service types: professional review platforms (software, medical devices, financial products), news site comment sections (paywall crossover), educational platform peer reviews, B2B review sites (G2 with gated detail)
- Gate aggressiveness: mild (last 3 reviews truncated) to total (all review bodies locked)
- Visible review count before gate: 0 fully visible, 1–2 visible, 3–5 visible
- Login/paywall CTA copy: "Sign in to read reviews", "Subscribe for full access", "Join our community", "Create a free account", "Unlock all 2,847 reviews"

### Output Format
Single complete HTML file. The review section structure must be complete in the DOM — review cards, aggregate score, all present — but visually obstructed by the gate mechanism. Include the product name and aggregate score. Show some visible reviews (depending on gate pattern) followed by the gate. The gate must be CSS-only (no JavaScript needed to render the visual obstruction). Include `<script type="application/ld+json">` with AggregateRating.
