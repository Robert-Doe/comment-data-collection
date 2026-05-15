# Prompt 05 — jQuery-Era Progressively Enhanced Comments (2008–2013)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_05/`  
**Era:** ~2008–2013  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section from the jQuery era (2008–2013), where developers built interactive comment sections using jQuery for DOM manipulation, AJAX form submission, and animation. These pages feature heavily annotated HTML (data attributes, event-hook classes, JS-initialized widgets) but still render meaningful static HTML. The key trait: the HTML structure is designed to be enhanced by jQuery — include `<script>` tags referencing jQuery CDN and inline JS that would wire up the interactions, but the base HTML must be fully parseable without JS. Each of the 100 pages must vary significantly:

### Defining Characteristics
- `<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.x.x/jquery.min.js">` in head or before closing body
- Inline `<script>` block with jQuery selectors: `$(document).ready(function() { ... })`
- AJAX comment submission pattern: form with `id="comment-form"` and a JS handler (show the code even if non-functional)
- "Show/Hide replies" toggle built with jQuery slideUp/slideDown
- Comment counter updated dynamically shown as: `<span id="comment-count">14</span> Comments`
- `data-*` attributes on comment elements: `data-id="123"`, `data-author="username"`, `data-timestamp="1287432000"`

### Structural Variations (vary across 100 pages)
- Reply nesting: 0 levels (flat), 1 level, 2 levels, 3 levels — vary across pages
- Vote/rating: some pages have upvote/downvote with `<span class="vote-count">` elements
- Comment form: single textarea only, textarea + name/email fields, or full form with optional website URL
- Inline validation feedback: `<span class="error-msg" style="display:none">` elements present for JS toggling
- Loading spinner placeholder: `<div class="loading-spinner" style="display:none"><img src="spinner.gif" /></div>`
- "Edit" functionality: some pages show an [Edit] link that would turn comment text into a textarea on click
- Pagination vs infinite scroll indicator: some pages have "Load 10 more" button at bottom

### HTML Characteristics
- HTML5 doctype
- Mix of div-based and early semantic structure
- Heavy use of `id` attributes for jQuery targeting: `#comment-list`, `#comment-form`, `#submit-btn`
- `data-*` attributes throughout
- Classes split between styling classes and behavior-hook classes: `.js-reply-btn`, `.js-vote-up`, `.js-delete-comment`
- Some pages use jQuery UI widgets: `.ui-widget`, `.ui-corner-all`, `.ui-state-default` on form elements
- Template comment blocks (hidden): `<div class="comment-template" style="display:none">...</div>`
- Some pages show a "preview" div: `<div id="comment-preview" style="display:none">`

### CSS (inline `<style>` block — vary themes)
- jQuery UI default theme colors on some pages
- Custom blue/gray/white color schemes
- Animated transitions indicated in CSS: `transition: all 0.3s ease`
- `.comment.new-comment` highlighted with a yellow background (`#ffffd0`) for "just posted" state
- Float layout (floated avatar, margin-left body) — flexbox not yet widely used
- Some pages use `display: table` / `display: table-cell` as a pre-flexbox layout trick
- Icon fonts: some pages reference a fake `<link href="icons.css">` and use `<i class="icon-reply">` etc.

### Class Name Patterns (vary)
- jQuery plugin style: `.jq-comments`, `.jq-comment-item`, `.jq-reply-form`, `.jq-vote`
- Hook-prefixed: `.js-submit`, `.js-toggle-replies`, `.js-like`, `.js-report`
- WordPress-compatible: `.commentlist`, `.comment`, `.byuser`, `.bypostauthor`, `.even`, `.odd`, `.depth-1`, `.depth-2`
- Generic descriptive: `.comment-wrapper`, `.comment-item`, `.comment-body`, `.comment-actions`

### Content Dimensions to Vary
- Page contexts: tech blog, recipe site, photography blog, travel journal, startup marketing site, news site
- Comment complexity: vary from 1-sentence comments to 3-paragraph detailed responses
- 15% of pages: include a comment marked as "Pinned" or "Author Response" with a special badge
- 10% of pages: show a "Comments are closed" state (form replaced with a notice) but existing comments still listed
- Some pages have comment author badges: "Editor", "Verified", "Top Commenter"
