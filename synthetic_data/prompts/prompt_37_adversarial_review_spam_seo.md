# Prompt 37 — Adversarial: Review Spam / SEO-Padded Review Sections

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_37/`  
**UGC type:** Review sections polluted with SEO spam, keyword stuffing, fake reviews, and manipulated content  
**Label:** Positive (UGC region present — but content is spam-contaminated)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section that has been contaminated with common real-world spam and SEO manipulation patterns. This is NOT a negative example (no reviews) — the review structure is clearly present, and these are real review-section HTML structures. But the CONTENT exhibits spam characteristics: keyword stuffing, fake "verified" reviews with identical prose, review gating, incentivized reviews disclosures, or astroturfed content mixed with real reviews. This tests whether detectors handle noisy, low-quality review sections. Each of the 100 pages must vary across ALL of the following dimensions.

### Spam Pattern Types to Mix (use 2–4 patterns per page)

**1. Keyword-stuffed review bodies:**
- Reviews contain unnatural keyword insertions: "This [product name] [product category] is the best [product name] [product category] I have ever used for [use case]. The [product name] quality of this [product name] [product category] exceeded my expectations."
- Exact-match anchor text stuffed into review: "If you're looking for [product name] near [location], this is the best option."

**2. Fake "verified" review farms:**
- 10+ reviews with suspiciously similar structure and length
- Generic 5-star bodies: "Great product! Love it. Would recommend.", "Excellent quality. Fast shipping. 5 stars.", "Perfect. Exactly as described. Very happy."
- All dated within a 2-day window
- All rated 5 stars
- Username patterns: "User123456", "Customer_7891011", "Buyer_20230415"

**3. Incentivized review disclosures (required by FTC):**
- Some reviews include mandatory disclosure: "I received this product free in exchange for my honest review."
- "[DISCLAIMER: Incentivized review — reviewer received discount]" shown on some cards
- Star ratings on incentivized reviews cluster at 4–5 stars

**4. Gated / suppressed negative reviews:**
- Negative reviews (1–2 stars) with "[This review has been flagged for policy violation]" notice
- "Review removed by moderator" placeholder cards
- "X reviews hidden — these reviews do not meet our content policy" notice at bottom

**5. Review gating redirect:**
- A "How was your experience?" form at top: "Great | Neutral | Not great" — if "Not great" was clicked, it redirects to a support page (evidenced by: "Great" button links to review form, "Not great" button links to support page — this is a real FTC-prohibited practice)

**6. Repeated reviewer accounts:**
- Same username appears in 3+ reviews with different products
- Reviewer profile showing suspicious pattern: "1,247 reviews submitted in 6 months"

### HTML Characteristics
- Vary the structural era: some pages are Bootstrap-era, some are modern SPA-output, some are legacy table-based — spam exists across all eras
- Schema.org may be present but the `reviewRating` values are uniformly 5.0
- ARIA: normally applied (spam sites still use accessible markup)
- Review card structure: normal review card UI — it's the CONTENT not the structure that signals spam

### Content Dimensions to Vary
- Product categories: supplements/health products (highest FTC-scrutiny category), cheap electronics, dropshipping products, MLM products, SEO services, "as seen on TV" products
- Mix of spam and real reviews on same page: some pages have 80% spam + 20% real; some have 20% spam + 80% real
- Disclosure types: FTC, ASA (UK), "I was given a free sample", "Partner review"
- Spam sophistication: crude (identical text) vs. sophisticated (varied but formulaic)

### Output Format
Single complete HTML file. The review SECTION STRUCTURE must be complete and functional-looking — this is not a fake review page, it's a real review page with contaminated content. Include the product name, aggregate score, and review cards. Mix spam patterns with some genuine-looking reviews. The overall page should look like a real retail product page with a reviews section.
