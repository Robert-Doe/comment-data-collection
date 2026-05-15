# Prompt 15 — Broken, Irregular, and Legacy-Patched Comment Sections (Adversarial / Noisy)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_15/`  
**Era:** Any — intentionally degraded  
**Label:** Positive (comment section present) — ADVERSARIAL set

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section that is **structurally irregular, partially broken, inconsistently built, or the result of years of poorly applied patches** by different developers over time. These pages simulate real-world legacy HTML that a detector must still correctly identify as containing a comment section despite the mess. Each of the 100 pages must vary across different types of structural degradation:

### Categories of Brokenness (mix and combine per page)

#### Category A — Mixed-Era Patching (most common real-world case)
- The outer wrapper is an HTML5 `<section>`, but inside it has old table-based comment rows
- Some comments use `<article>` correctly; others are bare `<div>` with no class; one is a `<li>` orphaned outside a list
- Some comments have timestamps as `<time>` with ISO datetime; others have the date as raw text inside a `<b>` tag
- A `<style>` block contains conflicting rules: `.comment { color: red; }` and then `.comment { color: black; }` 20 lines later
- Mix of `px`, `%`, `rem`, `em` units on the same property across different comment items

#### Category B — Unclosed / Malformed Tags
- Some `<div>` elements missing their closing `</div>` (browsers will auto-close, still parseable)
- An `<img>` tag missing the `alt` attribute (common legacy issue)
- A `<form>` tag without a `method` attribute or `action` attribute
- `<a>` tags with `href="#"` as placeholder that was never replaced
- Attributes without quotes: `<div class=comment-item>` (HTML4 style still parsed by browsers)
- Self-closing divs from a developer who confused HTML and XHTML: `<div class="sep" />`

#### Category C — Inline Style Chaos
- Each comment item has a completely different inline style, as if each was styled individually:
  - `<div style="background:#fff;padding:10px">`
  - `<div style="background-color: #f9f9f9; padding: 12px 16px; margin: 8px 0;">`
  - `<div style="background:lightyellow;border:1px solid #ccc">`
- Some comments have `!important` on random properties
- `style="color: #333 !important; font-size: 14px !important;"` — over-specified inline styles

#### Category D — Duplicate IDs
- `<div id="comment">` appearing multiple times (invalid HTML but real in legacy sites)
- `<div id="comments">` as the section wrapper AND `<a id="comments">` as a jump anchor elsewhere
- `<span id="author">` used on every comment (a developer who didn't understand unique IDs)

#### Category E — Structural Inconsistency (different template per comment)
- Comment 1: has avatar + username + date + text + reply button (full template)
- Comment 2: has username + text only (no avatar, no date, no button)
- Comment 3: has avatar + text + date (no username — just "Anonymous")
- Comment 4: is a `<blockquote>` with no wrapper at all, just the text
- Comments are not structurally parallel — a nightmare for structured extraction

#### Category F — Accessibility Regression
- Reply buttons are `<a href="#" onclick="void(0)">Reply</a>` with no ARIA label
- Like counts shown as `<img src="like-icon.png">12` (icon + text outside any element)
- Form labels not associated with inputs: `Label text` is a bare `<span>`, not a `<label for="">`
- Tab order broken: `tabindex="5"`, `tabindex="2"`, `tabindex="8"` in random order

#### Category G — Dead CSS / Leftover Classes
- Class names that no longer exist in the stylesheet: `.comment-new`, `.highlighted`, `.featured-comment` appear in HTML but have no rules
- Inline `style=""` that overrides everything: one comment item has `style="display: none !important;"` (accidentally hidden by a developer — show it anyway as it may still be in DOM)
- Classes from THREE different frameworks: one comment has Bootstrap `col-md-12`, another has Tailwind `flex gap-2`, another has custom `.cmt-body`

### Per-Page Variation Rules
- Each page should use a mix of 2–4 categories from above (not all categories in every page)
- Despite all brokenness, a human reader can still clearly identify the comment section
- Comment count: 3 to 15
- 30% of pages: the compose form itself is broken (textarea present but submit button missing, or vice versa)
- 20% of pages: the comment section heading is there but empty: `<h2 class="comments-title"></h2>`
- 15% of pages: a comment is partially duplicated (appears twice, second instance cut off mid-tag)

### What Must Still Be Present (despite the chaos)
- A recognizable pattern of repeated user-generated content units
- Some form of author identification (even if just "Anonymous" or a number)
- Some form of text content per unit
- The section must be distinguishable from navigation, ads, or page body content
