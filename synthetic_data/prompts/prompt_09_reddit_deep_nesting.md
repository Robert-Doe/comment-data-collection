# Prompt 09 — Reddit-Style Deeply Nested Threaded Comments (2010–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_09/`  
**Era:** ~2010–present  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing Reddit-style or Hacker News-style deeply nested threaded comment sections. These are characterized by recursive comment nesting (comments contain their own reply sub-threads), collapse/expand controls, vote scores, and indentation as the primary visual hierarchy signal. Each of the 100 pages must vary significantly across all dimensions:

### Platform Variation (vary across 100 pages)
- **Old Reddit (pre-2018)**: table-based layout, `.comment`, `.entry`, `.tagline`, `.usertext-body`, `data-fullname` attributes
- **New Reddit (2018+)**: Shadow DOM-adjacent, `<shreddit-comment>` custom elements or div-based equivalents, `.Comment`, Redesign class names
- **Hacker News style**: ultra-minimal, single `<table>` with `<tr class="comtr">`, `.commtext`, `.comhead`, `.togg` collapse link, pixel-based indentation via `<td width="N">`
- **Lemmy / Kbin (Fediverse Reddit-like)**: more semantic HTML5, `<article class="comment">`, `.comment-branch`, `.comment-form`
- **Custom Reddit-inspired**: a developer's own implementation of threaded comments with their own class names and structure

### Structural Dimensions to Vary (CRITICAL — this is the core trait)
- **Nesting depth**: vary from 2 levels to 9 levels deep across the 100 pages
- **Number of top-level comments**: 2 to 10
- **Total comment count**: 8 to 50 (summing all levels)
- **Collapse mechanism**: `<a class="expand" onclick="...">[-]</a>` link prefix (HN/old Reddit style) OR a toggle button OR `<details>`/`<summary>` elements (modern style)
- **Indentation method**: 
  - Fixed-width `<td>` spacer cells (HN style)
  - `margin-left: Npx` per level (Reddit style)
  - `padding-left: Npx` per level
  - `border-left: 2px solid color` indent line (modern style) — vary the color per nesting level
- **Score display**: `+247 / -18` (up + down) OR net score only `229 points` OR hidden score on new posts OR no score at all
- **Collapsed threads**: 10–30% of sub-threads shown in collapsed state: `<div class="comment collapsed">` with only the header visible

### HTML Characteristics
- Recursive HTML structure: comment div contains a `<div class="replies">` or `<ul class="children">` which contains more comment divs
- Each comment has: score, username, timestamp, collapse toggle, comment text, action links (reply, share, report, save, hide)
- `data-*` attributes: `data-comment-id`, `data-depth="3"`, `data-score="47"`, `data-author="username"`
- `data-fullname="t1_abc123"` on old Reddit-style
- `data-context` showing the parent chain for deep linked comments
- `aria-hidden="true"` on collapsed content
- `tabindex` attributes for keyboard navigation

### Class Name Patterns (vary by platform)
- Old Reddit: `.comment`, `.entry`, `.tagline`, `.author`, `.score`, `.usertext`, `.buttons`, `.child`, `.midcol`
- New Reddit: `.Comment`, `.CommentHeader`, `.CommentContent`, `.CommentFooter`, `.RepliesSection`
- HN: `.comtr`, `.comhead`, `.commtext`, `.togg`, `.hnuser`, `.score`, `.ind`
- Lemmy: `.comment-node`, `.comment-branch`, `.comment-content`, `.comment-meta`, `.vote-buttons`
- Custom: `.thread-comment`, `.thread-comment__depth-N`, `.thread-comment__replies`, `.thread-comment__collapse`

### Content Dimensions to Vary
- Subreddit/community topics: programming, science, gaming, news, philosophy, cooking, fitness, finance
- Comment quality: vary from thoughtful multi-paragraph responses to single-word replies ("This."), to deleted comments (`[deleted]`, `[removed]`)
- Gilded/awarded comments: some comments show award icons (gold, silver, wholesome) as `<span>` elements
- Flair: some usernames have flair text: `<span class="flair">Moderator</span>` or `<span class="userFlair-text">CS PhD</span>`
- Cross-posting context: some pages show the OP's comment marked as `[S]` (OP flair)
- 15% of pages: a "Continue this thread →" link at max depth instead of rendering deeper
- 10% of pages: "Load more comments (248)" button at the bottom

### Indentation Color Variation (for border-left style pages)
Vary the accent color of each nesting level's border:
Level 1: `#ff4500` (Reddit orange), Level 2: `#0079d3` (Reddit blue), Level 3: `#46d160`, Level 4: `#ff585b`, Level 5+: gray
OR use a single color across all levels (simpler implementations).
