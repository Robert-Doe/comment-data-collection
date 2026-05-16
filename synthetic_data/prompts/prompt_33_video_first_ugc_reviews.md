# Prompt 33 — Video-First UGC Reviews (TikTok Shop / Instagram / YouTube, 2020–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_33/`  
**Era:** 2020–present (TikTok Shop reviews, Instagram Shopping, YouTube product review embeds, Reels-style UGC)  
**UGC type:** Video-first user-generated reviews with thumbnail grid + text captions  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a product review section where the primary content is VIDEO reviews from social media — TikTok Shop reviews, Instagram Reels reviews, YouTube Shorts reviews — displayed as a thumbnail grid with play button overlays, creator handles, view counts, and short text captions. Text-only reviews exist but are secondary. This is the dominant review format for 2020+ DTC brands and social commerce. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of video reviews shown: 6–20 video thumbnails in a grid
- Number of text-only reviews below video grid: 3–10
- Video thumbnail grid layout: 3-column, 4-column, or 2-column responsive grid (CSS Grid or Flexbox)
- Thumbnail card contents:
  - `<img src="thumb-video-1.jpg" alt="Video review by @creator">` (9:16 aspect ratio thumbnail)
  - Play button overlay: `<button class="play-btn" aria-label="Play video review">▶</button>` centered over thumbnail
  - View count: "1.2M views", "84K views" below thumbnail
  - Platform badge: TikTok logo SVG or `<span class="badge tiktok">TikTok</span>`, Instagram badge, YouTube badge
  - Creator handle: `@username` below thumbnail
  - Duration: "0:47", "1:23" in corner of thumbnail
- "Load more videos" button
- Filter tabs: "All Reviews | Video Reviews | Photo Reviews | Text Reviews"
- Sort: "Most Viewed | Most Recent | Most Helpful"
- Aggregate rating block at top with total review count split by type: "1,243 reviews · 847 videos · 396 text"

### HTML/CSS Characteristics (modern 2020–present)
- DOCTYPE: `<!DOCTYPE html>`
- CSS: CSS Grid for video thumbnail grid (`display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;`) or Tailwind classes
- Aspect ratio: `aspect-ratio: 9/16` on video thumbnail containers (CSS property, new in 2021)
- `<video poster="thumb.jpg" preload="none">` elements with `<source>` inside some thumbnails (autoplay muted loop disabled)
- `data-video-url`, `data-platform`, `data-creator` attributes on thumbnail containers
- Lazy loading: `loading="lazy"` on thumbnail `<img>` tags
- ARIA: `role="list"` on video grid, `aria-label="Video reviews"`, `role="listitem"` on each thumbnail card
- Schema.org JSON-LD: VideoObject array for video reviews in addition to Review array
- Dark/light mode: varies per platform aesthetic — TikTok dark (#000 / #111), Instagram warm white, YouTube white/red
- `<picture>` element with WebP source for thumbnails on some pages
- Creator verification badge: SVG checkmark icon on verified creator accounts

### Content Dimensions to Vary
- Product categories: beauty/skincare (TikTok Shop's biggest category), fashion/apparel, home decor, tech accessories, food/snacks, fitness equipment — typical social commerce categories
- Platform mix: some pages are pure TikTok Shop reviews, some mix TikTok + Instagram, some are YouTube-focused
- Creator follower counts shown: "2.3M followers", "58K followers", "micro-influencer" style
- Video review text captions: short (1–2 sentences), hashtag-heavy ("This blush is UNREAL 😍 #TikTokMadeMeBuyIt #GRWM")
- Text review section below: modern short reviews, emoji-heavy, often referencing the product being seen on social media ("Bought this after seeing it on TikTok — it really works!")

### Output Format
Single complete HTML file. Include a product name, aggregate score, and review type counts at the top. Then the video thumbnail grid. Then the text reviews section below. Use CSS Grid for the video layout. Include `<script type="application/ld+json">` with both AggregateRating and VideoObject data. Style to match the social commerce aesthetic (bold, high-contrast, mobile-first even on desktop).
