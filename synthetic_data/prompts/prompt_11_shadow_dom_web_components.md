# Prompt 11 — Shadow DOM / Web Component Encapsulated Comment Widgets (2016–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_11/`  
**Era:** ~2016–present  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where the comment section is implemented as a **Web Component** using custom elements and Shadow DOM. These pages represent the modern pattern where comment widgets are encapsulated in custom HTML elements like `<comment-section>`, `<comment-thread>`, `<discussion-widget>`, or `<user-comments>`. The Shadow DOM contains the actual comment markup, scoped styles, and slot elements. Each of the 100 pages must vary across all dimensions:

### Defining Characteristics
- A custom HTML element tag in the document: `<comment-section>`, `<discussion-thread>`, `<comments-widget>`, `<reply-thread>`, `<ugc-comments>` etc.
- A `<script>` block defining the custom element via `customElements.define()`
- Inside the script: `attachShadow({ mode: 'open' })` and `shadowRoot.innerHTML = \`...\`` containing the actual comment HTML
- The Shadow DOM HTML contains all the comments, styles, and compose form
- `<slot>` elements used in some pages for content projection
- `<template id="...">` elements with the comment unit markup on some pages

### Structural Variations (vary across 100 pages)
- Comment count: 3 to 20
- Nesting: flat, 1-level replies, 2-level replies — vary
- Shadow DOM mode: `open` vs `closed` (use `closed` on ~20% of pages)
- Multiple custom elements on some pages: outer `<comment-section>` contains multiple `<comment-item>` elements
- Slots: some pages use named slots (`<slot name="avatar">`, `<slot name="body">`) with light DOM content projected in
- Compose form: inside shadow DOM vs. outside as light DOM projected via slot
- `::slotted()` CSS selector used to style projected slot content on slot-using pages

### Custom Element Tag Names (vary across pages)
- `<comment-section>`, `<comment-thread>`, `<comment-list>`
- `<discussion-widget>`, `<discussion-board>`, `<discussion-thread>`
- `<user-comments>`, `<user-reactions>`, `<user-replies>`
- `<reply-thread>`, `<reply-section>`, `<reply-box>`
- `<ugc-section>`, `<ugc-comments>`, `<ugc-widget>`
- `<x-comments>`, `<app-comments>`, `<my-comments>` (framework-adjacent prefixes)
- `<wc-comment-section>` (explicit "web component" prefix style)

### HTML/JS Characteristics
- `customElements.define('comment-section', class extends HTMLElement { ... })`
- `connectedCallback()` lifecycle method setting up the shadow DOM
- `observedAttributes()` / `attributeChangedCallback()` on some pages (e.g., `theme="dark"`, `count="12"`)
- CSS custom properties (CSS variables) used for theming: `--comment-bg: #fff`, `--comment-border: #e0e0e0`, `--accent-color: #007bff`
- `:host` selector for styles applied to the custom element itself
- `:host([theme="dark"])` attribute-based theming on some pages
- Scoped styles inside Shadow DOM cannot leak out — intentionally exploit this (class names inside shadow can be as generic as `.item`, `.body`, `.meta` without conflicts)

### Class Name Patterns Inside Shadow DOM (intentionally simple — scoped)
- Very generic (safe inside shadow): `.item`, `.body`, `.meta`, `.avatar`, `.text`, `.actions`, `.reply`, `.form`
- Semi-descriptive: `.comment`, `.comment-body`, `.comment-meta`, `.comment-actions`
- BEM inside shadow: `.thread__item`, `.thread__body`, `.thread__meta`
- No class names at all on some pages — pure element selectors: `article { }`, `p { }`, `time { }` (safe inside shadow)

### CSS Custom Properties to Vary (for theming diversity)
- Light theme: `--bg: #ffffff; --text: #333333; --border: #e2e2e2; --accent: #0066cc`
- Dark theme: `--bg: #1e1e1e; --text: #d4d4d4; --border: #3a3a3a; --accent: #569cd6`
- Brand-colored: `--bg: #fff3e0; --accent: #ff6f00` (orange brand)
- Minimal/editorial: `--bg: #fafaf8; --text: #1a1a1a; --border: none; --accent: #000`

### Content Dimensions to Vary
- Attribute-driven configuration on the custom element: `<comment-section theme="dark" post-id="4821" max-depth="3">`
- Some pages show the custom element BEFORE JS loads — with a `<noscript>` or fallback light DOM content inside the tag
- Some pages have multiple custom element instances on one page (e.g., a comment section AND a related posts widget)
- Slotted content: some pages project `<p slot="empty-state">Be the first to comment</p>` as light DOM into the shadow
- Page topics: developer blog, SaaS product, e-commerce item page, documentation site, portfolio
