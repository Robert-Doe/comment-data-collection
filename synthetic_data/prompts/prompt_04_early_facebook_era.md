# Prompt 04 — Early Facebook-Era Inline Comment Boxes (2007–2011)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_04/`  
**Era:** ~2007–2011  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page mimicking the comment section interaction patterns that emerged during Facebook's early influence on the web (2007–2011). This era introduced inline comment boxes that appeared directly below content (news articles, blog posts, status updates), short comment inputs, like/thumbs-up counts, and the social identity (name + avatar = linked profile) pattern. Each of the 100 pages must vary across all dimensions below:

### Defining Characteristics of This Era
- Comment input is a small inline `<input type="text">` or a short `<textarea rows="2">` — NOT a full blog comment form
- Comments load/appear inline, not on a separate page
- Each comment shows: profile photo thumbnail (32px or 48px square), full name as a link, comment text, timestamp, and a like/thumbs count
- The "like" action: some pages show a clickable text link ("Like · 3"), some show a thumbs icon + count, some show a heart icon
- Reply is inline — "Reply" appears as a small text link beside the timestamp
- Comment count shown as a header: "47 Comments", "Add a comment...", "View all comments"

### Structural Variations (vary across 100 pages)
- Flat comments only (no threading) vs. 1-level of inline replies shown indented below a comment
- Reply count collapsed: "View 5 replies ▾" (show as static collapsed state with no JS needed)
- Number of comments visible: 3 to 20 (some pages show "Load more comments" at bottom)
- Input position: above comment list OR below comment list OR both
- "Share" / "Report" links: present on some pages, absent on others
- Timestamp format: "2 hours ago", "Yesterday at 3:42 PM", "March 8, 2009 at 11:23am"

### HTML Characteristics
- HTML5 doctype (`<!DOCTYPE html>`)
- Mix of `<div>` and early semantic tags — `<section id="comments">` or just `<div id="comments">`
- Profile images: `<img class="profile-pic" src="...">` with small fixed dimensions
- Username links: `<a href="/profile/username" class="...">Full Name</a>`
- Comment text: bare `<p>` or `<span>` inside a `.comment-body` or `.comment-text` div
- Like/thumbs: `<a class="like-btn">Like</a> · <span class="like-count">12</span>`
- Some pages use `<ul>` / `<li>` for the comment list; others use plain divs
- Occasional Microformat markup: `<span class="vcard"><a class="fn url" href="...">Name</a></span>`

### CSS Styling (inline `<style>` block)
- Light gray backgrounds for the comment area: `#f7f7f7`, `#efefef`
- Profile images: `border-radius: 3px` (early, not fully circular yet — circles come later)
- Blue link color for names: `#3b5998` (Facebook blue) or site-specific colors
- Thin border or box shadow around the comment section container
- Font: typically `Arial`, `Helvetica`, or `Tahoma` at 12px–13px
- Some pages use `font-family: 'Lucida Grande', sans-serif` (Mac/Apple era)

### Class Name Patterns (vary per page)
- Facebook-adjacent: `.comment`, `.comment-item`, `.UFIComment`, `.commentable_item`
- Blog/CMS style: `.fb-comment`, `.social-comment`, `.inline-comment`, `.comment-row`
- Generic: `.c`, `.cmt`, `.post-comment`, `.stream-item`, `.activity-item`
- Some pages use NO class names at all on the comment units — just positional selectors

### Content Dimensions to Vary
- Page types: news article, blog post, photo page, link share, status update, product announcement
- Topics: tech news, celebrity, sports, political opinion, food review, travel photo
- Comment tones: enthusiastic agreement, mild disagreement, emoji-heavy, informational, spam-like ("Great post! Visit my site!")
- Some pages show a "Top Comments" vs "Most Recent" sort toggle (static, no JS needed)
- 10% of pages: comments section is embedded inside an `<iframe>` wrapper div (static representation — just the inner content shown)
- 15% of pages: Facebook Social Plugin style — show a "X people like this" bar above the comments
