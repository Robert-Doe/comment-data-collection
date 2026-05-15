# Prompt 19 — AI-Assisted Modern Minimalist Comment UI (2022–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_19/`  
**Era:** ~2022–present  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section that was **built with AI assistance** (GitHub Copilot, Cursor, Claude, ChatGPT, v0.dev, Lovable, Bolt.new, or similar). These pages have specific fingerprints: they tend to be structurally very clean and correct, use modern CSS (container queries, CSS layers, logical properties), include thoughtful ARIA attributes, and often have an almost-too-perfect component structure. The HTML is semantically excellent but sometimes over-engineered. Each of the 100 pages must vary:

### Defining Characteristics of AI-Generated HTML
- Excellent ARIA semantics: `role="region"`, `aria-label="Comments section"`, `aria-live="polite"`, `aria-atomic="true"`, `aria-busy="false"`
- Logical CSS properties: `margin-inline-start` instead of `margin-left`, `padding-block` instead of `padding-top/bottom`, `border-inline-start` instead of `border-left`
- CSS custom properties used consistently and named descriptively: `--color-surface-comment`, `--spacing-comment-gap`, `--radius-avatar`, `--color-text-secondary`
- Container queries: `@container comments (min-width: 480px) { ... }`
- CSS layers: `@layer base, components, utilities;`
- `focus-visible` styling: `button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`
- Defensive CSS: `min-width: 0` on flex children to prevent overflow, `overflow-wrap: break-word` on text containers
- Modern color: `oklch()` or `color-mix()` in some pages
- Relative color syntax: `color: oklch(from var(--accent) calc(l * 0.8) c h)`

### Framework / Tool Variation (vary per page — affects the fingerprint)
- **v0.dev output**: Tailwind utility classes, shadcn/ui component patterns, `"use client"` comment stripped out, very clean BEM-adjacent naming
- **Copilot-completed custom CSS**: clean semantic HTML5, descriptive class names, complete ARIA attributes, consistent naming convention throughout
- **Claude-generated**: comprehensive ARIA, logical properties, CSS custom properties, progressive enhancement, skip links
- **Cursor AI**: tends toward TypeScript-friendly data attributes, component-boundary HTML comments, clean separation of concerns
- **Bolt.new / Stackblitz**: often generates with a UI framework but produces clean HTML5 output, sometimes includes framework-specific attributes
- **Lovable**: React-like component thinking in HTML, very consistent naming, sometimes over-componentized

### Structural Dimensions to Vary
- Comment count: 3 to 20
- Nesting: flat, 1-level, 2-level — all clean and consistent indentation
- Compose form: always present (AI tools usually include it); vary complexity:
  - Minimal: single textarea + button
  - Standard: name + email + message + submit
  - Rich: name + email + website + message + character counter + submit + cancel
  - Authenticated: just textarea (user already signed in, avatar shown)
- Character counter: `<span aria-live="polite"><span id="char-count">0</span>/500 characters</span>` — present on ~40% of pages
- Error state examples: some pages show an inline validation error: `<p role="alert" class="error-message">Please enter a name</p>`

### ARIA Attributes to Include (vary which are present per page)
- `role="region" aria-label="Comments section"` on the outer container
- `aria-live="polite" aria-atomic="false"` on the comment list (for dynamic updates)
- `aria-label="Reply to [username]"` on reply buttons (dynamically scoped)
- `aria-pressed="true/false"` on like/upvote toggle buttons
- `aria-expanded="true/false"` on collapse toggles
- `aria-controls="reply-form-123"` on reply buttons with `id="reply-form-123"` on the form
- `aria-busy="true"` on loading states
- `aria-describedby` linking comment text to the author info

### CSS Characteristics (inline `<style>` block)
- CSS custom properties at `:root` level: comprehensive design token system
- `@layer` declarations at the top
- Container queries for the comment section
- `@media (prefers-color-scheme: dark)` always included
- `@media (prefers-reduced-motion: reduce)` always included (AI tools are accessibility-aware)
- Logical properties throughout: `padding-inline`, `margin-block`, `border-start-start-radius`
- `:is()` and `:where()` CSS selectors
- `gap` instead of margins for spacing flex/grid children

### Class Name Patterns (vary by AI tool fingerprint)
- v0/shadcn: `.comment-section`, `.comment-card`, `.comment-header`, `.comment-body`, `.comment-footer`, `.comment-actions` (very clean, matches shadcn naming)
- Generic AI: `.comments`, `.comments__list`, `.comments__item`, `.comments__item-header`, `.comments__item-body`, `.comments__item-footer`, `.comments__form`
- Tailwind (v0): all utility classes, no custom class names except maybe `[&:not(:last-child)]:border-b`

### Content Dimensions to Vary
- Page types: SaaS product blog, developer documentation, personal portfolio, tech startup, open-source project
- Comment content: technical, thoughtful, well-formatted (AI tools generate "ideal" comment content)
- Some pages: comments include code blocks within them `<pre><code class="language-javascript">...</code></pre>`
- Some pages: show a "Reactions" section with emoji counts below comments (AI-designed modern UX pattern)
- 20% of pages: include a "Sort by" and "Filter" control above the list with `<select>` or button group
- 15% of pages: paginated with modern pagination component (numbered pages + prev/next)
