# Prompt 16 — Product Review-Adjacent Comment Hybrids (E-Commerce Era)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_16/`  
**Era:** ~2005–present (e-commerce evolution)  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a **product review section** — a special form of comment section where each user submission combines a star rating, a review title, review body text, and optionally structured metadata (verified purchase badge, helpful votes, reviewer location, review date). This pattern is found on Amazon, eBay, Etsy, Newegg, Best Buy, Booking.com, TripAdvisor, Yelp, Google Maps, app stores, and custom e-commerce sites. Each of the 100 pages must vary significantly:

### Platform Style Variation (vary across 100 pages)
- **Amazon-style**: rating stars as `<span class="a-icon-alt">` or SVG stars, "Verified Purchase" badge, "X people found this helpful", reviewer profile link, "Top Reviewer" badge
- **Yelp-style**: star rating as text or image, review excerpt with "Read more" truncation, reviewer metadata (reviews count, friends count, photos count), Elite badge
- **TripAdvisor-style**: bubble ratings (circles not stars), reviewer home location, "Date of stay", "Trip type" metadata, management response section
- **Booking.com-style**: dual score system (numeric: 8.5/10), pros/cons text areas, country flag next to reviewer name, room type shown
- **App Store-style** (iOS/Android): star rating, version number reviewed on, developer reply section, helpful/not helpful voting
- **Custom e-commerce**: site-specific star implementation, any combination of the above
- **Trustpilot-style**: large numeric score, "Verified" checkmark, date of experience vs. date of review, company response section
- **Google Maps-style** (web embed): profile photo prominent, star rating, relative time, expandable text, photo attachments

### Structural Dimensions to Vary
- Number of reviews: 3 to 20
- Star rating implementation:
  - Unicode stars: ★★★★☆ inside a `<span>`
  - Image stars: `<img src="stars-4.png">` or individual `<img src="star-full.png">` × N
  - SVG star icons inline
  - CSS-drawn stars using Unicode or pseudo-elements
  - Numeric only: "4.2 / 5" or "8.4 / 10"
  - No stars (written ratings like "Excellent", "Good", "Poor")
- Review title: present (bold `<h3>` or `<strong>`) or absent
- Rating distribution bar chart: present on some pages at the top (5★: 62%, 4★: 21%, etc.)
- Sorting/filtering controls: "Sort by: Most Recent / Most Helpful / Top Rated" — present on some pages
- Pagination: "Showing 1–10 of 247 reviews" — present on some pages
- Management/seller response: a reply from the product owner/seller below some reviews (a major structural variant)
- Write-a-review form: full form (rating selector + title + body + submit) vs. absent

### HTML Characteristics
- Schema.org Review markup on some pages: `itemscope itemtype="https://schema.org/Review"`, `itemprop="reviewRating"`, `itemprop="author"`, `itemprop="datePublished"`, `itemprop="reviewBody"`
- `<meta itemprop="ratingValue" content="4">` within rating elements
- `data-rating="4"`, `data-reviewer-id="..."`, `data-verified="true"` attributes
- Image attachments: some reviews show `<img class="review-photo">` thumbnails
- "Helpful" voting: `<button class="helpful-btn" data-vote-count="47">Helpful (47)</button>`

### Class Name Patterns (vary by platform simulation)
- Amazon-style: `.review`, `.review-title`, `.review-rating`, `.review-body`, `.review-helpful`, `.a-star-4`, `.review-date`
- Yelp-style: `.review-item`, `.review-content`, `.reviewer-info`, `.star-rating`, `.review-excerpt`
- Generic e-commerce: `.product-review`, `.rating-stars`, `.review-text`, `.reviewer-name`, `.review-date`, `.helpful-votes`
- Booking-style: `.review-score`, `.review-positive`, `.review-negative`, `.traveler-type`, `.review-header`
- Schema-driven: no semantic class names — just itemprop attributes for structure

### Content Dimensions to Vary
- Product types: electronics, clothing, kitchen appliance, book, hotel room, restaurant, mobile app, software, beauty product
- Review sentiment distribution: mostly positive (4–5 stars), mixed, mostly negative (1–2 stars) — vary per page
- Review text length: short (1 sentence) to long (5+ paragraphs with detailed analysis)
- 20% of pages: include at least one "verified purchase" badge per review
- 15% of pages: show a seller/management response below one or more reviews
- 10% of pages: show a "Top Reviews" vs. "All Reviews" tab selector
- Some reviews: include phrases like "I bought this as a gift for..." or "After using this for 6 months..."
