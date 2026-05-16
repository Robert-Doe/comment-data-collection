# Prompt 22 — Early Forum-Style Product Discussion Threads (2002–2008)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_22/`  
**Era:** 2002–2008 (phpBB 2.x, UBBthreads, vBulletin 3, early SMF — product-specific sub-forums)  
**UGC type:** Forum discussion threads used as product reviews / recommendations  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a product discussion thread in the style of a phpBB 2.x / UBBthreads / vBulletin 3 forum from 2002–2008. These are NOT dedicated review sites — they are product-category sub-forums where users ask "Is X worth buying?" and others reply with first-hand opinions. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of posts: 6–24
- Thread structure: linear flat reply list (phpBB default) vs. page-split with "Page 1 of 3" pagination UI
- Sticky "Important" post at top on some threads (moderator pinned)
- "Quote" blocks from parent post inside reply: `<table><tr><td class="quote">...</td></tr></table>` with "Originally posted by username:" prefix
- Post count badge: "Posts: 2,847" shown in left-column user card
- User rank image: `<img src="rank_veteran.gif">` badge under username on some
- "Thanks" button count shown post-footer on vBulletin-era pages
- Signature block separated by `<hr>` at bottom of post body on some users
- Edit notice: "Last edited by username on 04/12/2006 at 10:32 PM" in italics at post bottom
- Thread-top "subject" breadcrumb: Forum → Sub-forum → Thread title

### HTML Characteristics (era-accurate 2002–2008)
- DOCTYPE: `HTML 4.01 Transitional` or none
- Layout: two-column `<table>` per post — left `<td>` is user card, right `<td>` is post body
- Post separator: horizontal rule or bgcolor row `<tr bgcolor="#C0C0C0">`
- `<font>` tags for username styling, timestamp, and rank text
- `bgcolor` on alternating rows or post headers: `#E8E8F0`, `#F4F4F8`, `#DDEEFF`
- NO CSS framework, NO `<article>` or `<section>`, NO ARIA
- Quote blocks styled with `background-color: #F0F0F0; border-left: 3px solid #999999`
- Timestamp format: "Posted: April 12, 2006 10:32 PM" or "04/12/06 10:32 PM"
- Icons: `<img src="icon_post.gif">` or `<img src="posticon_new.gif">` in post header
- "Report post" and "Edit post" text links in post footer

### Content Dimensions to Vary
- Product categories: digital cameras (Canon EOS 300D, Nikon D70), MP3 players (iPod vs. Creative Zen), graphics cards (GeForce FX 5900, Radeon 9800 Pro), laptops, broadband routers, printers
- Thread prompts: "Is the [product] worth buying?", "Just got [product] — impressions", "[Product] vs [Competitor] — which should I get?", "Anyone else having [problem] with [product]?"
- Reply styles: technical spec comparisons, "I've had mine for 6 months and...", anecdotes, recommendations, "Check out [other product] instead"
- Forum style variants: tech hardware forum, photography community, gaming hardware forum, general consumer electronics board
- User seniority: "Junior Member" (< 100 posts), "Senior Member" (1000+), "Veteran" (5000+), "Moderator"

### Output Format
Single complete HTML file. Include the forum chrome: site header with forum name and logo placeholder, navigation breadcrumb, thread title, then the posts. Use realistic fictional usernames, product names from that era, and opinions. NO Bootstrap, NO jQuery, NO modern CSS.
