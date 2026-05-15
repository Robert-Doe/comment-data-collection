# Prompt 13 — Flat Comment Lists With Zero Reply Affordance (Timeless / Minimalist)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_13/`  
**Era:** Timeless — appears across all eras  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where the comment section is a **purely flat, linear list of comments with no reply, nesting, threading, or hierarchy whatsoever**. There are no "Reply" buttons, no indented sub-comments, no reply counts, no threaded tree structure of any kind. Comments are just a sequential list. This pattern appears on: guestbooks, simple news sites, closed-thread forums, archived blog posts, minimalist platforms, and locked discussions. Each of the 100 pages must vary:

### Core Constraint (must be respected for all 100 pages)
- Zero reply buttons, reply links, or reply affordance anywhere
- Zero nested comment structures
- Zero threading indicators
- A pure, linear sequence: Comment 1, Comment 2, Comment 3... Comment N

### Structural Dimensions to Vary
- **List implementation**: 
  - `<ul>` / `<li>` list
  - `<ol>` / `<li>` numbered list
  - Plain `<div>` per comment
  - `<article>` per comment
  - `<dl>` / `<dt>` (username) / `<dd>` (text) definition list (an archaic but real pattern)
  - `<table>` rows (one row per comment — seen on old guestbooks)
  - `<p>` tags with bold username prefix: `<p><b>Alice:</b> Great post!</p>`
- **Comment count**: 2 to 30
- **Compose form**: present (at top, at bottom, or absent entirely — 3 variants)
- **Compose form type**: simple name + message only; full contact form; email-only guestbook; just a textarea with no name field; completely absent
- **Separator**: between comments — `<hr>`, border-bottom, empty margin space, alternating bg colors, or none

### Era Simulation (vary era of each page to maximize diversity)
- Pre-2003 style: table-based guestbook, `<font>` tags, `bgcolor` attributes
- 2005–2009 style: div-based with inline CSS, no semantic tags
- 2010–2013 style: HTML5 `<article>` per comment, `<time>` tag
- 2014–2018 style: flexbox layout, circular avatars, card design
- 2019–present style: minimal, clean typography, very subtle separators

### Class Name Patterns (maximally diverse)
- Guestbook: `.guestbook-entry`, `.gb-entry`, `.gb-name`, `.gb-message`, `.gb-date`
- Simple blog: `.comment`, `.comment-author`, `.comment-body`, `.comment-date`
- Forum archive: `.post`, `.post-author`, `.post-content`, `.post-time`
- Minimal/no-class: bare element selectors only in `<style>` block — `li { }`, `article { }`
- Numbered list: `<ol class="comments">` with just `<li>` children
- Totally classless: no class attributes anywhere — pure HTML structure

### Comment Heading Variety (vary these labels)
- "Guestbook" / "Sign Our Guestbook"
- "Comments (N)" 
- "Reader Feedback"
- "Discussion"
- "What others are saying"
- "N people commented"
- "Community notes"
- "Responses"
- "Reactions"
- "Letters to the editor"
- No heading at all — comments start immediately

### Content Dimensions to Vary
- Topics: recipe page, travel article, obituary page, memorial page, announcement post, product page, event page, prayer/condolence book, news article, tutorial
- Comment tone: congratulatory, condolence, informational, enthusiastic, critical, neutral
- Short vs. long: vary from 1-sentence to 3-paragraph comments
- 20% of pages: include one "pinned" or "featured" comment at top (visually distinct, no reply button still)
- Some pages: show a CAPTCHA image above the compose button
- Some pages: show a "Comment Policy" text above or below the compose form
- Some pages: show comment approval notice — "Your comment has been received and is awaiting approval"

### Adversarial Variants (for model robustness)
- 15% of pages: comment section is labeled with entirely non-standard terms ("Thoughts", "Notes", "Entries", "Submissions", "Voices") — no "comment" word in any class/id/label
- 10% of pages: the compose form is completely absent — a locked/read-only archive with only existing comments
- 10% of pages: only ONE comment is present (edge case — minimum viable comment section)
