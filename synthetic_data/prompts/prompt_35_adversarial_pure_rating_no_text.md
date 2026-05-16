# Prompt 35 — Adversarial: Pure Rating / Minimal-Signal Reviews

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_35/`  
**UGC type:** Reviews with star ratings but minimal or absent text — hard detection case  
**Label:** Positive (UGC region present — but with very weak text signal)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a product or service review section where reviews exist but contain very little or no text content. This is an adversarial case for UGC detection: the review STRUCTURE is present (star ratings, reviewer names, dates, helpful votes) but the TEXT is minimal — one word, emojis only, or entirely absent. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 8–30
- Text body content variants (vary across reviews within each page):
  - Completely empty text body — just rating and metadata
  - Single emoji: "😊", "👍", "🔥", "❤️", "💯"
  - One word: "Good.", "Excellent.", "Meh.", "Perfect!", "Disappointed."
  - Short phrase: "Works as expected.", "Does the job.", "Pretty good.", "Not impressed.", "As described."
  - Two words max: "Love it!", "Highly recommended.", "Fast shipping."
  - Emoji string: "⭐⭐⭐⭐⭐", "🙌🙌🙌", "❌ bad"
- Some reviews have a review TITLE but empty body: `<h4 class="review-title">Great product</h4>` with nothing below
- Some reviews show "[No text provided]" or "(This reviewer left a star rating without a written review)" placeholder
- Some reviews have 1–3 words ONLY in a foreign language with no English content

### Rating Signal Variety
- Star rendering: SVG stars, img stars, Unicode ★, `data-rating="4"` attribute only with no visible stars on some
- Some pages: ratings shown as number only — "4.0" or "8/10" — no star visual at all
- Some pages: only the aggregate score shown large, individual ratings shown as small numbers
- Scale variants: 1–5 stars, thumbs up/down binary (helpful/not), 1–10 numeric

### HTML/CSS Characteristics (vary the era/platform)
- Era mix: use structural patterns from across eras — some pages look like Bootstrap card era, some like modern SPA output, some like table-based legacy, some like AMP — but all share the "minimal text" trait
- ARIA: varies — some have `aria-label="5 out of 5 stars"`, some have nothing
- Schema.org: present on ~40% of pages (the rating is still machine-readable)
- Review metadata density: reviewer name, date, and "Verified Buyer" badge may be present even with no text

### Content Dimensions to Vary
- Product categories: anything — varied across pages
- Reviewer names: anonymous on some, usernames on others, "A. Smith" format on Amazon-style pages
- Dates: varied across eras
- Context for the sparse reviews: mobile-app-submitted reviews (tiny keyboard, common to be brief), international reviewers with language barrier, elderly users, rushed one-click ratings
- Page context signal: some pages have a "Most helpful reviews" section with longer reviews AND a "Recent reviews" section dominated by empty/short reviews — demonstrating the real mix that occurs

### Output Format
Single complete HTML file. The review STRUCTURE must be clearly a review section (star ratings, reviewer info, review cards/rows), but TEXT content within each review body must be minimal. This tests whether a detector can identify UGC structure from structural signals alone, not just keyword matching. Do NOT make reviews unrecognizable as reviews — they must be structurally obvious review UIs.
