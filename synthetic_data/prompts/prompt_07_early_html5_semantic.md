# Prompt 07 — First-Wave HTML5 Semantic Comment Sections (2010–2013)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_07/`  
**Era:** ~2010–2013  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section built by a developer who enthusiastically adopted HTML5 semantic elements — `<article>`, `<section>`, `<header>`, `<footer>`, `<time>`, `<aside>`, `<nav>`, `<figure>`, `<figcaption>`, `<mark>` — as soon as they became available. This is the "semantic purity" era where blogs and CMSs rewrote their templates to use proper HTML5 markup, often mixed with early CSS3. Each of the 100 pages must vary across the dimensions below:

### Defining Characteristics
- Every comment is an `<article>` element (correct HTML5 usage for independently-distributable content)
- The comment list is wrapped in `<section id="comments">` or `<section class="comments-section">`
- Timestamps use `<time datetime="2012-04-15T09:30:00Z">April 15, 2012 at 9:30 am</time>`
- Author name in `<address>` or `<cite>` element (or both)
- Avatar in `<figure>` + `<figcaption>` on some pages
- Compose form wrapped in `<section>` or `<aside>` below the comment list

### Structural Variations (vary across 100 pages)
- Reply nesting: 0 to 4 levels, using nested `<article>` inside `<article>` (HTML5 allows this)
- Comment count: 2 to 20
- `<header>` inside each comment article: always present vs. absent on some pages
- `<footer>` inside each comment article: contains reply link, edit link, like count — present or absent
- Microdata / RDFa / Microformats2: some pages add `itemscope itemtype="https://schema.org/Comment"` attributes; some use `class="h-entry p-author"` (Microformats2); some have neither
- `<aside>` for the author byline: some pages put author info in an aside element beside the comment body
- `<nav>` for pagination: present on some pages as `<nav class="comment-navigation">`

### HTML Characteristics
- `<!DOCTYPE html>` (HTML5)
- Proper `<html lang="en">`, `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- `<time>` with proper ISO 8601 `datetime` attribute on every date shown
- `<mark>` element used in some comments to highlight search terms or quoted text
- `<details>` / `<summary>` used on some pages to collapse long reply threads
- Schema.org microdata on some pages: `itemprop="author"`, `itemprop="datePublished"`, `itemprop="text"`
- CSS3 in `<style>` block: `border-radius`, `box-shadow`, `linear-gradient`, `transition`, `@media` queries
- CSS3 `::before` / `::after` pseudo-elements for decorative quote marks or reply indicators
- `<input type="url">` and `<input type="email">` in the compose form (HTML5 input types)

### Class Name Patterns (vary per page)
- Semantic-descriptive: `.comment`, `.comment__author`, `.comment__body`, `.comment__meta`, `.comment__actions`
- BEM: `.comments`, `.comments__list`, `.comments__item`, `.comments__item--reply`, `.comments__form`
- WordPress-theme names: `.commentlist`, `.comment`, `.comment-body`, `.comment-author`, `.comment-metadata`, `.comment-awaiting-moderation`
- Drupal 7/8: `.comment`, `.field--name-comment-body`, `.submitted`, `.user-picture`
- Custom CMS: `.entry-comments`, `.comment-thread`, `.comment-node`, `.comment-depth-1`

### Content Dimensions to Vary
- Blog post types: web development tutorial, photography blog, lifestyle/wellness, environmental news, academic commentary
- 20% of pages: include an `<aside>` "subscription" widget adjacent to the comments (newsletter signup)
- 15% of pages: moderator/author reply highlighted with `.bypostauthor` or `.comment--author-reply` styling
- Some pages: "Awaiting moderation" badge on one comment (`<p class="comment-awaiting-moderation">Your comment is awaiting moderation.</p>`)
- Comment IDs: `<article id="comment-142">` — always include these
- Some pages show Gravatar-generated avatars with proper `<img>` with `srcset` attribute

### CSS3 Nuances to Vary
- Some pages: dark mode support via `@media (prefers-color-scheme: dark)`
- Varied font stacks: Georgia serif blogs vs. system-ui modern stacks
- Some pages use CSS3 animations: reply form slides in with `transition: max-height 0.4s ease`
- Some pages: print stylesheet `@media print` that hides the compose form
