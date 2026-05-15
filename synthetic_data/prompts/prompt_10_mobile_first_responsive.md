# Prompt 10 — Mobile-First Responsive Flat Comment Feeds (2013–2017)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_10/`  
**Era:** ~2013–2017  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section built with a **mobile-first, responsive design** philosophy — where the layout is designed for small screens first, then enhanced for desktop via media queries. These pages use flexbox (not floats or tables), relative units (rem, em, %), and responsive images. They often look like native mobile app comment feeds translated to the web. Each of the 100 pages must vary significantly:

### Defining Characteristics
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` always present
- Primary layout: flexbox (`display: flex`, `flex-direction`, `align-items`, `gap`)
- No floats for layout (or floats only as fallback)
- Font sizes in `rem` or `em`, not `px`
- Avatars: circular (`border-radius: 50%`) — this era standardized the circle avatar
- Touch-friendly targets: reply/like buttons at minimum 44px height
- `@media (min-width: ...)` media queries to enhance for tablet and desktop (mobile-first)

### Structural Variations (vary across 100 pages)
- Comment count: 4 to 25
- Feed style: purely flat (no threading) vs. 1-level replies
- Reply indicator: "↩ Reply to @username" inline in the comment text vs. separate indented block
- Compose area: floating/sticky compose bar at bottom of screen (show as sticky CSS) OR inline at top OR at bottom after list
- Avatar size: 32px / 40px / 48px — vary per page
- Action row: like count + reply link + timestamp all on one flex row below the comment text
- Infinite scroll indicator: `<div class="load-more-trigger">Loading...</div>` at bottom on some pages
- Pull-to-refresh hint: some pages have a `<div class="ptr-indicator">↓ Pull to refresh</div>`

### CSS Patterns (inline `<style>` block)
- Flexbox layouts: `display: flex; align-items: flex-start; gap: 12px;` for avatar + content rows
- Circular avatars: `border-radius: 50%; width: 40px; height: 40px; object-fit: cover;`
- Card-like comment items: `background: #fff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);`
- Mobile-first base: single column, full width; desktop media query: max-width container, optional sidebar
- Color schemes: vary — light (#fff background), off-white (#f5f5f5), dark (#1a1a1a), blue-tinted (#f0f4ff)
- Typography: system-ui, -apple-system, sans-serif stack; 14px–16px base
- Like button animation: `transition: transform 0.15s; :active { transform: scale(0.9); }`
- Comment text: `word-break: break-word; overflow-wrap: anywhere;` for long URLs in mobile
- `@media (prefers-color-scheme: dark)` dark mode support on 30% of pages

### Class Name Patterns (vary)
- BEM strict: `.comment-feed`, `.comment-feed__item`, `.comment-feed__avatar`, `.comment-feed__body`, `.comment-feed__actions`
- Utility-first without a framework (custom utility classes): `.flex`, `.items-start`, `.gap-3`, `.rounded-full`, `.text-sm`, `.text-gray-500`
- Simple flat: `.comment`, `.comment-avatar`, `.comment-content`, `.comment-footer`, `.comment-likes`
- App-style: `.feed-item`, `.feed-item-avatar`, `.feed-item-body`, `.feed-item-meta`, `.feed-item-actions`
- CMS-adjacent: `.user-comment`, `.user-comment-avatar`, `.user-comment-text`, `.user-comment-time`

### Content Dimensions to Vary
- App context: social media app comment section, news app, product review app, community app (Discord-web-like), recipe app
- Comment length: 20% short (1 sentence), 60% medium (2–4 sentences), 20% long (5+ sentences or multi-paragraph)
- Emoji usage: vary from zero emoji to heavy emoji usage in comment text
- Mentions: some comments contain `@username` mentions styled as `<a class="mention">@username</a>`
- Hashtags: some communities use `<a class="hashtag">#topic</a>` in comments
- Media attachments: some comments show a thumbnail image attachment `<img class="comment-attachment">` below text
- 15% of pages: show a "Pinned comment" at the top with a pin icon
- 10% of pages: show a "Top fan" or "Author" badge next to certain usernames

### Responsive Behavior to Encode in CSS
- Mobile (base): avatar 36px, font 14px, single column, full-width input
- Tablet (768px+): avatar 44px, font 15px, input with send button inline
- Desktop (1024px+): max-width 720px centered, avatar 48px, font 16px
