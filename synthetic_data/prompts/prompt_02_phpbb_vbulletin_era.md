# Prompt 02 — phpBB / vBulletin Forum-Style Comment Threads (2001–2007)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_02/`  
**Era:** ~2001–2007  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page mimicking the comment/thread section from phpBB, vBulletin, SMF (Simple Machines Forum), Invision Power Board, or similar PHP-era forum software of 2001–2007. Each of the 100 pages must differ meaningfully across the following dimensions:

### Forum Software Variation (choose one per page, vary across the 100)
- phpBB 1.x / 2.x style (flat table rows, bold usernames top-left, post body right cell)
- vBulletin 2 / 3 style (gradient header bars, "postbit" layout with user info panel left)
- SMF style (topic view with alternating row colors, user avatar top of left column)
- Invision Power Board style (post wrapped in a box with colored header showing username)
- Generic custom PHP forum (no identifiable brand, but same structural patterns)

### Structural Dimensions to Vary
- Number of posts/comments: 3 to 15
- Post layout: 2-column (user info | post body) OR 1-column stacked
- User info panel contents: mix and match avatar image, join date, post count, rank/title, location, signature separator
- Reply box: present (textarea + submit + formatting toolbar buttons) or absent (read-only/archived thread)
- Thread pagination: some pages show pagination ("Page 1 of 3 — Next »") at top and/or bottom
- Moderator controls: some pages show [Edit] [Delete] [Quote] buttons per post, others don't
- Thread title shown above: sometimes "Topic: [Title]", sometimes just `<h1>` or `<h2>`
- Quote blocks: some comments contain quoted text from a previous post, inside a visual quote box using `<blockquote>` or a nested table

### HTML Characteristics
- DOCTYPE HTML 4.01 Transitional or XHTML 1.0 Transitional
- Heavy use of `<table>` layout — this era's PHP CMSs output table-based HTML
- `<td class="...">` with class names like `postbody`, `posterinfo`, `postdate`, `posttitle`, `postfoot`
- Inline styles mixed with linked stylesheets — include a `<style>` block in `<head>`
- `<b>` and `<strong>` both appear (transitional era)
- `bgcolor` table attributes still common alongside CSS
- Some `<span class="...">` for username color, rank color
- No `<article>`, `<section>`, `<time>` — but `<abbr title="timestamp">` sometimes used for dates
- Smilies as `<img>` tags: `<img src="images/smilies/icon_smile.gif" alt=":)" />`

### Class Name Patterns (vary per page)
- phpBB style: `postbody`, `row1`, `row2`, `gen`, `genmed`, `genbig`, `themecat`, `forumline`
- vBulletin style: `alt1`, `alt2`, `postbit`, `postbitlegacy`, `content`, `userinfo`, `postdetails`
- SMF style: `windowbg`, `windowbg2`, `titlebg`, `poster`, `postarea`, `post_wrapper`
- Generic: `forum-post`, `post-content`, `user-info`, `post-meta`

### Content Dimensions to Vary
- Forum topics: PC gaming, anime, DIY electronics, Linux/Unix help, cooking, sports teams, fan fiction
- Post counts: "Posts: 1,847" — numbers should vary realistically
- Join dates: "Joined: Feb 2003", "Member since: October 2001"
- Signatures: some users have text signatures, some have small image signatures (using `<img>`)
- Some posts are "Guest" posts (no account, just a name field)
- IP addresses shown in mod view: "IP: 192.168.x.x" on some pages

### Quirks to Include
- Thread "locked" icon or "This thread has been closed" banner on ~15% of pages
- "Last edited by [username] on [date]" footnote on some posts
- Poll section above the thread on ~10% of pages (simple table-based poll layout)
- Reputation/thanks system icon row: ⭐ or [+Rep] buttons on some posts
- Online/offline status indicator dot next to username on some pages
- Forum breadcrumb at top: "Forum Index > Category > Subforum > Thread Title"
