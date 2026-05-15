# Prompt 18 — JAMstack / Headless CMS Comment Sections (2018–Present)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_18/`  
**Era:** ~2018–present  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing comment sections from the **JAMstack / headless CMS era** — sites built with Gatsby, Next.js, Nuxt, Eleventy, Hugo, Astro, SvelteKit, or similar static site generators where comment systems are plugged in as third-party services or built as serverless-backed API calls. These pages often have clean, minimal HTML with Tailwind or CSS modules, and the comment section is loaded asynchronously with a placeholder skeleton shown during load. Each of the 100 pages must vary:

### Platform / Integration Variation (vary across 100 pages)
- **Staticman**: comment data stored in GitHub repo as YAML/JSON, rendered at build time, form submits to Staticman API endpoint
- **Netlify Forms**: `<form name="comments" netlify>` or `<form netlify data-netlify="true">` — Netlify intercepts the form
- **Utterances / Giscus**: GitHub Issues or Discussions as comment backend — widget renders GitHub-styled comments
- **Commento**: privacy-focused open-source comments — clean minimal HTML, `.commento-root`, `.commento-main-area`
- **Hyvor Talk**: `.hyvor-talk-comments`, modern clean UI, emoji reactions, nested replies
- **Remark42**: Go-based self-hosted, `.remark42`, clean component-based HTML output
- **Custom serverless**: form POSTs to an AWS Lambda / Netlify Function / Vercel Edge Function; HTML is all custom
- **No third-party**: comment data baked into static HTML at build time (pre-rendered at build, no dynamic loading)

### Defining Characteristics of This Era
- Comments pre-rendered at build time: HTML is complete, no JS needed to show existing comments
- OR: loading skeleton shown + actual comments hydrated — show the hydrated state with comments visible
- Tailwind CSS utility classes as the dominant styling approach (on 40% of pages)
- CSS custom properties / design tokens: `var(--color-comment-bg)`, `var(--border-radius-card)`
- Clean semantic HTML: `<article>`, `<section>`, `<time>`, proper heading hierarchy
- Progressive enhancement: form works without JS (pure HTML form action)
- `aria-live="polite"` on comment list for dynamic updates
- Optimized images: `loading="lazy"`, `srcset`, `width` and `height` attributes on avatar images

### Structural Dimensions to Vary
- Comment count: 2 to 15 (JAMstack blogs typically have fewer comments)
- Nesting: flat most common; 1-level replies on some; some platforms (Giscus) show emoji reactions but flat text
- Skeleton loading state: 0–3 skeleton placeholder items visible (gray animated div blocks)
- Comment form: HTML form with `method="POST"` and static action URL, or present but empty ("Be the first to comment"), or absent (static archive)
- Reactions/emoji: GitHub-style emoji reactions (`👍 12 · ❤️ 4 · 🎉 2`) on some pages
- Dark mode: many JAMstack sites have dark mode toggle — show dark state on 30% of pages

### HTML Characteristics for Netlify/Staticman Forms
- `<form name="comments" method="POST" netlify>` — Netlify form with `netlify` attribute
- `<input type="hidden" name="form-name" value="comments">` inside Netlify forms
- `<input type="hidden" name="_gotcha" style="display:none">` (honeypot spam field)
- `<input type="hidden" name="redirect" value="/thank-you">` for post-submit redirect
- Staticman: `action="https://staticman.net/v3/entry/github/[user]/[repo]/[branch]/comments"` on form

### Tailwind Class Patterns (for Tailwind pages)
Vary across these Tailwind-styled comment patterns:
```
<article class="flex gap-4 py-6 border-b border-gray-200 dark:border-gray-700">
  <img class="w-10 h-10 rounded-full flex-shrink-0" src="..." alt="...">
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 mb-1">
      <span class="font-semibold text-gray-900 dark:text-gray-100 text-sm">Username</span>
      <time class="text-xs text-gray-500 dark:text-gray-400">3 days ago</time>
    </div>
    <p class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">Comment text here.</p>
  </div>
</article>
```

### CSS Module Patterns (for non-Tailwind pages)
- `.comments-section`, `.comment-item`, `.comment-author`, `.comment-content`, `.comment-date`
- `.comment-form`, `.comment-form__field`, `.comment-form__submit`
- Some pages: CSS-in-JS (Emotion/styled-components) with hashed class names

### Content Dimensions to Vary
- Blog types: developer blog, design blog, indie maker blog, open-source project blog, personal portfolio
- Comment topics: technical discussions about the post, tool recommendations, "Great post!", questions to the author
- Author response: 20% of pages show the blog author replying to comments (marked with "Author" badge)
- GitHub integration: Utterances/Giscus pages show GitHub avatars and link usernames to `github.com/username`
- Build date shown: some static sites show "Last built: May 14, 2026 at 09:32 UTC"
- Comment count: some show "3 comments" from the static build; note if comments added since build won't show
