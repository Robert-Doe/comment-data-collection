# Prompt 06 — Third-Party Embed Wrappers: Disqus / Livefyre / IntenseDebate (2009–2018)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_06/`  
**Era:** ~2009–2018  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing comment sections that were served by or mimicking third-party comment platforms: **Disqus**, **Livefyre**, **IntenseDebate**, **Facebook Comments Plugin**, **Google+ Comments** (defunct), or **Spot.IM / OpenWeb**. These platforms injected iframes or rendered their own widget HTML into a host page. The key structural pattern: a host container element (`<div id="disqus_thread">` or similar) that the platform's JS would fill, surrounded by the host site's own page structure. Generate the full rendered comment widget HTML inline (as it would appear after the JS ran and the iframe/shadow was written). Each of the 100 pages must vary across all dimensions:

### Platform Variation (vary across the 100 pages)
- **Disqus** (most common): container `<div id="disqus_thread">`, inner HTML with Disqus's own class names
- **Disqus post-2015**: dark/light theme toggle button, "Best" / "Newest" / "Oldest" sort tabs
- **Livefyre**: stream-based real-time comments, `.fyre-comment`, `.fyre-stream`, `.fyre-editor`
- **IntenseDebate**: `.idc-container`, `.idc-column`, `.idc-thread`, `.idc-comment`
- **Facebook Comments Plugin**: rendered `<iframe>` HTML with `.pluginConnectButton`, `.UFICommentActorName`
- **Google+ Comments**: (deprecated pattern) `.Nd`, `.Y8`, `.OE` — Google's minified class names
- **Spot.IM / OpenWeb**: `.sp_commentsWidget`, `.sp-comment`, `.sp-user-avatar`

### Structural Dimensions to Vary
- Number of rendered comments: 4 to 25
- Nesting: flat only OR 1-level threaded replies
- Social login buttons shown above the compose box: vary which platforms shown (Facebook, Twitter, Google, email)
- Compose box: textarea with placeholder "Join the discussion..." or "What do you think?" or collapsed to a "Start the discussion" button
- Sort/filter controls: tabs for Best/Newest/Oldest — present on some, absent on others
- Upvote/downvote: Disqus-style upvote only, Reddit-style up+down, like-only, absent
- Share buttons per comment: present on some (Share to Twitter/Facebook), absent on others
- Flag/report link: present or absent
- Verification badge: some comments from "verified" users with a checkmark badge

### HTML Characteristics
- HTML5 doctype
- Host page wrapper: `<div id="disqus_thread">` or `<div class="comments-widget" data-platform="disqus">`
- Platform JS loader stub: `<script>var disqus_config = function() { this.page.url = '...'; };</script>` + noscript fallback
- `<noscript>` fallback showing "Please enable JavaScript to view comments powered by Disqus"
- Inner widget HTML: heavy use of platform-specific class names (see Platform Variation above)
- Avatar images: `<img src="https://disquscdn.com/uploads/users/...` or `https://graph.facebook.com/...`
- Timestamps rendered as `<a>` links to the comment permalink: `<a class="time-ago" href="...">3 hours ago</a>`
- Reactions/emoji: some platforms show emoji reaction bars below comments

### Class Name Patterns (vary by platform)
- Disqus: `#disqus_thread`, `.dsq-widget`, `.dsq-comment-header`, `.dsq-comment-body`, `.dsq-reply`
- Livefyre: `.fyre`, `.fyre-comment-wrapper`, `.fyre-user-name`, `.fyre-comment-article`
- IntenseDebate: `.idc-container`, `.idc-thread-sub`, `.idc-nopad`, `.idc-avatar`
- Facebook: `.UFIList`, `.UFIComment`, `.UFICommentActorName`, `.UFICommentBody`
- Generic embed: `.comments-embed`, `.widget-comments`, `.comment-plugin-wrapper`

### Content Dimensions to Vary
- Host page topics: news article, blog post, YouTube-style video description page, podcast episode page
- Comment tones: debate-heavy political comments, supportive community, spam-heavy (some obvious spam visible), professional discussion
- "N comments" header text variations: "47 Comments", "Discussion (12)", "Comments · 5"
- Some pages show a "promoted/sponsored comment" with a badge
- 10% of pages: embed shows "Comments are disabled for this article"
- 15% of pages: show a "Load more" pagination button at bottom with remaining count

### Unique Trait
These pages must include the platform's `<noscript>` fallback tag AND a `data-` attribute on the container indicating the platform. The host page around the widget should feel like a realistic news or blog site (navigation, article content above, footer below).
