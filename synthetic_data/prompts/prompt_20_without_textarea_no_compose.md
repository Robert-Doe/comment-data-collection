# Prompt 20 — Read-Only Comment Sections: No Compose / No Textarea (Archived / Locked)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_20/`  
**Era:** Any  
**Label:** Positive (comment section present) — IMPORTANT edge case

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where a comment section is **fully visible and readable, but entirely read-only** — there is no textarea, no compose form, no reply button, no input field, no submit button. This tests whether a detector can correctly identify comment sections that have zero compose affordance. This pattern appears on: archived articles, locked threads, deleted-account pages, comment sections that were permanently closed, legacy CMS archives, read-only APIs, cached pages, and sites where comments were disabled after a controversy. Each of the 100 pages must vary:

### Reasons for Read-Only (vary across pages — affects surrounding context)
- **Thread locked**: explicit "Comments are closed" / "This thread has been locked" notice at top or bottom
- **Article archived**: "This article was published in 2008 and commenting has been disabled" banner
- **User deleted account**: "Commenting requires an account. [Log in] [Register]" — but NO compose area shown, just a redirect prompt
- **Admin disabled**: no explanation given — compose section simply does not exist
- **Cached/archived page**: Wayback Machine-style header banner indicating this is an archived snapshot
- **Comments quota reached**: "Maximum comments reached for this post" notice
- **Time-gated**: "Commenting closed after 30 days" or "Discussion period ended May 2023"
- **Legal hold**: "Comments have been disabled on this article pending legal review"
- **Pure archive**: No notice at all — comments just exist with no input mechanism

### Notice/Banner Variations (for locked pages — vary the styling and phrasing)
- Simple text: `<p class="comments-closed">Comments are closed.</p>`
- Styled box: `<div class="alert">This article is archived. Comments are no longer accepted.</div>`
- Icon + text: `<div class="notice"><svg>🔒</svg> <span>Discussion is closed</span></div>`
- No notice at all: compose form simply absent, no explanation
- Navigation suggestion: "Want to discuss? Head to our <a href='/forum'>community forum</a>."
- Social redirect: "Continue the conversation on <a href='#'>Twitter/X</a> or <a href='#'>our subreddit</a>."

### Comment Display Structures (vary these heavily — same richness as open sections)
- Full comment display: avatar + username + timestamp + full text + like count
- Minimal: just username + text (no avatar, no timestamp)
- Rich: avatar + username + timestamp + text + like count + reply count (but no interact button)
- Thread display: nested replies shown (but no "reply" button on any of them)
- With "N replies" collapsed indicator that is visible but non-interactive (no button — just text)
- Reaction counts visible but non-interactive: "👍 47 ❤️ 12 😂 8" as display-only

### Per-Era Implementation (vary the era of each read-only page)
- Pre-2003 table-based: old phpBB thread with "Thread Closed" icon image at top
- 2005-2009 div-soup: blog post with `<p style="color:red">Comments are closed</p>` at bottom
- 2010-2013 HTML5: semantic `<section id="comments">` with `<aside class="comments-closed-notice">` 
- 2014-2018 Bootstrap: `<div class="alert alert-warning">Comments have been disabled</div>`
- 2018-2022 Tailwind/modern: clean card-based comments, tasteful "discussion closed" banner
- 2022-present AI-generated: perfect ARIA, logical CSS, but compose form intentionally absent

### Comment Count Ranges (vary per page)
- Very few: 1–3 comments (almost empty thread that got locked)
- Medium: 5–15 comments (typical closed blog post)
- Many: 20–50 comments (high-traffic article whose comments were archived)
- Empty + notice: 0 comments, just the "comments are closed" notice (edge case — no comment units at all, but section exists)

### Structural Dimensions to Vary
- Comment count: 0 to 40 (0 is an edge case — include ~5 pages with 0 comments)
- Nesting: flat, 1-level replies visible, 2-level replies visible
- Like/vote counts: visible (display-only) or absent
- Avatar: present or absent
- Username links: clickable (to profile) or plain text (archived, no links work)
- Timestamps: shown or absent
- Schema.org markup: present or absent

### Adversarial Sub-Variants
- 10% of pages: a "login to comment" block replaces the compose form — `<div class="login-prompt"><a href="/login">Log in</a> to join the discussion</div>` — NOT a compose form
- 10% of pages: a social share section appears where the compose form would normally be (common pattern: "Share this instead of commenting")
- 15% of pages: the word "comment" does NOT appear in any class/id — combined with prompt 14's adversarial constraint

### What Must Be Absent (the core constraint for all 100 pages)
- NO `<textarea>` anywhere on the page
- NO `<input type="text">` for comment entry
- NO submit button for comment submission
- NO compose form or comment input of any kind
- Reply buttons: explicitly absent OR shown but visually disabled (`disabled` attribute or CSS `pointer-events: none`)
