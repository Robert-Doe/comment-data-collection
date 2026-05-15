# Prompt 12 — SPA-Rendered Comment Markup (React / Vue / Angular Output) (2015–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_12/`  
**Era:** ~2015–present  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing the **server-side rendered or static-generated output** of a React, Vue, or Angular comment component — i.e., what the DOM looks like AFTER the JS framework has run and hydrated the comment section. The key trait: the HTML carries the fingerprints of framework rendering — `data-reactroot`, `data-v-*` scoped attributes, `ng-*` attributes, hydration markers, or CSS modules class names. But the HTML itself is fully parseable as static markup. Each of the 100 pages must vary:

### Framework Fingerprint Variation (vary across 100 pages)
- **React (CRA / Next.js)**: `data-reactroot=""` on root, class names like `CommentSection_comments__3xK9p` (CSS Modules), or styled-components hashes `sc-bdnxRM`, or Tailwind utility classes, or Emotion CSS-in-JS `css-1a2b3c`
- **Vue 2**: `data-v-4a3b2c1d` scoped attribute on every element (Vue's SFC scoping), camelCase component names in HTML comments `<!-- <CommentList> -->`
- **Vue 3 / Nuxt**: similar `data-v-*` but more modern class names, `v-show` remnants as `display: none` inline style
- **Angular**: `_ngcontent-abc-c123` attributes on every element, `_nghost-abc-c123` on host element, `ng-star-inserted` on `*ngFor`-rendered elements, `ng-reflect-*` debug attributes
- **Svelte**: no framework attributes — compiled to clean HTML, but recognizable by `svelte-*` CSS class prefixes in the `<style>` block
- **Lit / Polymer**: `__litHtml`, `_$litPart$` markers, or `data-lit-*` attributes on some elements

### Structural Dimensions to Vary
- Comment count: 3 to 25
- Nesting: flat, 1-level, 2-level replies — vary
- Loading state representation: some pages show a "skeleton" placeholder div for the compose area
- Hydration markers: some pages show React hydration comments `<!--$-->`, `<!--/$-->` around suspense boundaries
- Error boundary: some pages show `<div data-reactroot class="error-boundary">Something went wrong loading comments</div>` (as a variant negative case but page still has comments)
- Virtual list: some pages show only 10 comments but with a `<div style="height: 4200px" class="virtual-scroll-spacer">` suggesting more exist

### CSS Module / Framework CSS Patterns (vary by framework)
- **CSS Modules (React)**: `.CommentList_container__2Hk9f`, `.CommentItem_author__xK3p`, `.CommentItem_body__9mRe`
- **Styled-components**: `<div class="sc-gsFSXq bkJxhg">` with cryptic class names; `<style data-styled="">` block in head
- **Emotion**: `<div class="css-1x23abc">` with a `<style data-emotion="css">` block
- **Tailwind**: verbose utility classes on every element: `flex items-start gap-3 p-4 border-b border-gray-200`
- **Vue scoped**: `.comment-item[data-v-3f4a5b]`, `.comment-body[data-v-3f4a5b]`
- **Angular**: `[_ngcontent-xyz-c42]` attribute selectors in `<style>` block

### Class Name Patterns (vary — these reveal the framework)
- CSS Modules hashes: semi-random suffix like `__3xK9p`, `__abc12`, `__xQrTs`
- Tailwind: `flex`, `flex-col`, `gap-2`, `p-4`, `rounded-lg`, `bg-white`, `shadow-sm`, `text-sm`, `text-gray-600`, `font-medium`
- Styled-components: purely cryptic, 2–4 character second class: `bkJxhg`, `iFtbLd`, `dKmNzP`
- Angular: `comment-section`, `comment-item`, `comment-header` — but with `_ngcontent-*` attribute alongside
- Svelte compiled: `.s-Xk3pQ9` prefix-style compiled class names

### Content Dimensions to Vary
- App types: Next.js blog, Nuxt.js community site, Angular enterprise CMS, Create React App forum, Svelte static site
- Next.js static props pattern: include a `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"comments":[...]}}}</script>` in the head (static data representation)
- Some pages show hydration mismatch comment: `<!-- HYDRATION_ERROR: text content does not match -->`
- React Suspense representation: `<!--$?--><template id="B:0"></template><!--/$-->` wrapping a loading section
- Some pages: have multiple component boundaries visible via HTML comments: `<!-- react-mount-point-unstable -->`
