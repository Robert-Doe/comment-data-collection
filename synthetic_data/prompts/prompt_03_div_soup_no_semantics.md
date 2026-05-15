# Prompt 03 — Pure Div-Soup, Zero Semantic Tags (2004–2009)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_03/`  
**Era:** ~2004–2009  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where the comment section is built entirely with `<div>` and `<span>` elements — the classic "divitis" era where developers abandoned tables for divs but had not yet adopted semantic HTML5. Zero `<article>`, `<section>`, `<header>`, `<footer>`, `<nav>`, `<time>`, `<aside>`, `<main>` tags anywhere on the page. Each of the 100 pages must vary across all dimensions below:

### The Core Constraint (must be respected for all 100 pages)
- Every structural element is a `<div>` or `<span>`
- The only non-div/span elements allowed: `<p>`, `<br>`, `<a>`, `<img>`, `<input>`, `<textarea>`, `<button>`, `<form>`, `<label>`, `<ul>`, `<li>`, `<h1>`–`<h3>`, `<strong>`, `<em>`, `<b>`, `<i>`
- NO semantic HTML5 elements anywhere

### Structural Dimensions to Vary
- Nesting depth of the wrapper divs: 2–6 levels deep before reaching the first comment
- Comment count: 2 to 18
- Reply structure: flat (no threading), 1 level of replies, or 2 levels of replies — vary across pages
- Reply indentation method: CSS `margin-left` or CSS `padding-left` (not table cells)
- Compose form: present or absent; if present, varies between simple textarea and multi-field form (name, email, website, message)
- Avatar presence: some pages show avatar `<img>` inside a `.avatar` div, some have colored placeholder divs, some have none

### CSS Patterns (inline `<style>` block — vary heavily)
- Some pages use pure class selectors: `.comment`, `.comment-body`, `.comment-meta`
- Some pages use deeply chained descendant selectors: `div.comments-wrap div.comment div.body p`
- Some pages use ID-based layout: `#comments`, `#comment-list`, `#comment-form`
- Color schemes: vary dramatically — dark backgrounds, light backgrounds, colorful borders
- Some pages have a `border-left: 3px solid #color` as the reply indentation visual cue
- Border styles: `border: 1px solid #ddd`, `border-bottom: 1px dashed #ccc`, `box-shadow` (on later era pages)
- Float-based layout (pre-flexbox): avatar div floated left, body div with `overflow: hidden` or `margin-left: 60px`

### Class Name Patterns (vary dramatically — this is important)
- Descriptive English: `.comment`, `.comment-author`, `.comment-date`, `.comment-text`, `.comment-reply`
- Abbreviated: `.cmt`, `.cmt-usr`, `.cmt-body`, `.cmt-ts`
- BEM-like (early, impure BEM): `.comment__header`, `.comment__body`, `.comment--reply`
- CMS-specific names: `.entry-comment`, `.hentry`, `.vcard`, `.fn`, `.url` (Microformats era)
- WordPress era: `.comment-list`, `.comment-body`, `.comment-author`, `.comment-metadata`, `.comment-content`, `.reply`
- Blogspot/Blogger: `.comment-block`, `.comment-header`, `.comment-footer`, `.comment-text`
- Drupal-style: `.field`, `.field--name-body`, `.views-row`, `.node-comment`
- Random/opaque: `.c1`, `.cu`, `.cd`, `.ct`, `.cr` (developer who just needed it to work)

### Content Dimensions to Vary
- Blog post topics: technology, parenting, cooking, finance, politics, travel, design
- Comment heading labels: "Leave a Comment", "Reader Comments", "What do you think?", "Join the discussion", "N Comments", "Be the first to comment"
- Date formats: "August 14, 2007 at 3:22 pm", "14 Aug 07", "2007-08-14 15:22"
- Some pages show Gravatar-style `<img>` tags with `src="https://www.gravatar.com/avatar/[hash]?s=48"`
- Some pages have "Notify me of followup comments via e-mail" checkbox
- Some pages have CAPTCHA placeholder: an `<img src="captcha.php">` followed by an input

### Adversarial Quirks
- 20% of pages: the word "comment" does NOT appear anywhere in class names or IDs — the section is structurally obvious but keyword-invisible
- 15% of pages: comment section is inside 5+ nested wrapper divs with non-descriptive names like `.wrapper`, `.inner`, `.content-area`, `.main-col`, `.block`
- 10% of pages: the compose textarea is outside/below the comment list entirely, separated by multiple divs
