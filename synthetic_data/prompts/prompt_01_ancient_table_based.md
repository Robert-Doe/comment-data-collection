# Prompt 01 — Ancient Table-Based Comment Boxes (Pre-2003)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_01/`  
**Era:** ~1997–2003  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section from the era of ~1997–2003, when web developers used HTML `<table>` elements for ALL layout (no CSS grid, no flexbox, no divs for layout). Each of the 100 pages must vary across ALL of the following dimensions — no two pages should feel identical:

### Structural Dimensions to Vary
- Number of comments: between 2 and 12
- Table nesting depth: 1 level (simple) to 3 levels deep (cell inside cell inside cell)
- Whether the page has a comment compose box or not (50/50)
- Compose box implementation: `<textarea>` inside a `<table>` cell, or a bare `<input type="text">` field
- Whether there are reply buttons (some pages have none at all)
- Whether replies are indented using `<td width="30">` spacer cells (the classic trick)
- Column layout: some use 2-column tables (avatar | text), some use 3-column (spacer | avatar | text)
- Avatar: sometimes an `<img>`, sometimes just a colored `<td bgcolor="">`, sometimes absent entirely
- Username: sometimes a bare text node, sometimes `<font>` tags, sometimes a `<b>` tag, sometimes an `<a>` tag

### HTML Characteristics (must be present to era-accurately reflect the time)
- Use `DOCTYPE HTML 4.01 Transitional` or no doctype at all (some pages)
- Presentational attributes: `bgcolor`, `cellpadding`, `cellspacing`, `border`, `valign`, `align`, `width` as pixel values or percentages
- `<font face="..." size="..." color="...">` tags for text styling
- `<b>`, `<i>`, `<u>` for emphasis — NO `<strong>` or `<em>`
- Inline `style=""` attributes should be absent or minimal (this era predates CSS adoption)
- Colors: use hex colors like `#336699`, `#CCCCCC`, `#FFFFEE`, `#003366` in `bgcolor` attributes
- NO semantic HTML: no `<article>`, `<section>`, `<aside>`, `<time>`, `<header>`, `<footer>`
- NO ARIA attributes whatsoever
- Use `<br>` not `<br />` (HTML 4 style)
- Some pages may use `<blockquote>` for reply indentation (a common pre-CSS trick)

### Content Dimensions to Vary
- Article/page topics: tech forums, gaming, sports, celebrity gossip, recipe blogs, travel — vary widely
- Comment text: mix short one-liners and long multi-sentence comments
- Date formats: "March 5 2002", "05/03/02", "Posted: 3-5-02 at 12:34 PM" — all inline text, no `<time>` tag
- Usernames: some anonymous ("Guest"), some numeric IDs ("User_4821"), some screen names
- Some pages have a "Posted by:" label prefix, others just show the username directly
- Some pages show post counts ("Posts: 247") next to the username

### Class Name Patterns (vary these)
- Some pages have NO class attributes at all
- Some use generic names: `tbl_comment`, `row_odd`, `row_even`, `td_user`, `td_post`
- Some use Hungarian-style: `tblComments`, `tdAvatar`, `tdBody`
- Some use legacy CMS names: `forumpost`, `postbody`, `posterinfo`

### Quirks to Include Randomly
- A `<marquee>` tag somewhere on 10% of pages
- `<!-- comment box begin -->` HTML comments delimiting sections
- Nested tables for "separator bars" between comments (a `<table width="100%" bgcolor="#666666" height="1">`)
- Some pages have "smilies" as `<img>` tags with `src="smilies/smile.gif"`
- A few pages have a hit counter image at the bottom: `<img src="counter.cgi">`

### Output Format
Produce a single complete HTML file. Use realistic placeholder text — real-sounding usernames, real-sounding comment content. Vary the comment section heading: some say "Comments (N)", some say "Discuss this article", some say "Forum Thread", some say "Guestbook", some say "Leave a Message".

Do NOT use Bootstrap, Tailwind, jQuery, React, Vue, or any modern library. No `<link rel="stylesheet">` to external files. All styling via table attributes and inline `<font>` tags.
