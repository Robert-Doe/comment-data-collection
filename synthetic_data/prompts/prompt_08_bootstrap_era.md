# Prompt 08 — Bootstrap 2 / 3 Comment Panels & Media Objects (2012–2016)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_08/`  
**Era:** ~2012–2016  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a comment section built with **Twitter Bootstrap** (versions 2, 3, or early 4). These pages use Bootstrap's grid system, panels/cards, media objects, form controls, buttons, and utility classes extensively. The comment section structure follows Bootstrap's component patterns. Include the Bootstrap CDN `<link>` in the head. Each of the 100 pages must vary across all dimensions:

### Bootstrap Version Variation (vary across 100 pages)
- **Bootstrap 2.x**: uses `.row-fluid`, `.span4`, `.span8` grid columns; `.alert`, `.label` components
- **Bootstrap 3.x** (most common): uses `.col-md-*`, `.panel`, `.panel-body`, `.panel-heading`, `.media`, `.media-body`, `.media-left`, `.media-right`, `.list-group`, `.list-group-item`
- **Bootstrap 4 early**: uses `.card`, `.card-body`, `.card-header`, `.d-flex`, `.mr-3`, `.mt-3`, flex utilities
- Mix of Bootstrap 2 and 3 classes on some pages (a developer mid-migration)

### Key Bootstrap Components Used
- **Media Object** (`.media` / `.media-body`): most natural Bootstrap pattern for avatar + comment
- **Panel** (Bootstrap 3) or **Card** (Bootstrap 4): wrapping each comment
- **List Group** (`.list-group` / `.list-group-item`): for flat comment lists
- **Form controls**: `.form-control` on textarea, `.btn .btn-primary` on submit, `.form-group` wrappers
- **Glyphicons** (Bootstrap 3): `<span class="glyphicon glyphicon-comment">`, `glyphicon-thumbs-up`, `glyphicon-reply`
- **Font Awesome** (alternative to Glyphicons on some pages): `<i class="fa fa-reply">`, `fa-thumbs-up`
- **Badges**: `<span class="badge">12</span>` for like counts or reply counts
- **Labels**: `<span class="label label-default">Author</span>` or `<span class="label label-primary">Verified</span>`
- **Alert boxes**: `<div class="alert alert-info">` for "Comments are moderated" notices

### Structural Variations (vary across 100 pages)
- Comment count: 3 to 18
- Grid layout for comment section: full width OR inside `.col-md-8` with a `.col-md-4` sidebar
- Reply nesting: flat only, 1-level, or 2-level with indented Bootstrap media objects
- Compose form: full Bootstrap form (`.form-group` for each field) or minimal textarea only
- Panel variant: `.panel-default`, `.panel-primary`, `.panel-info` — vary per page
- Comment actions: Bootstrap `.btn-xs` or `.btn-sm` buttons for Reply/Like/Report per comment
- Pagination: Bootstrap `.pagination` component at bottom — present on some pages

### Class Name Patterns
- Pure Bootstrap: `.media`, `.media-body`, `.media-left`, `.media-heading`, `.pull-left`, `.pull-right`
- Bootstrap + custom: `.media.comment-item`, `.panel.comment-panel`, `.list-group.comment-list`
- Theme names: `.bs-comment`, `.bootstrap-comment`, `.bs-thread`
- Site-specific prefix: `.blog-comment`, `.article-comment`, `.story-comment`
- Some pages add NO custom classes — pure Bootstrap class combinations only

### Content Dimensions to Vary
- Site type: technology blog, startup landing page, news site, e-learning platform, SaaS product blog
- Some pages: show a Bootstrap `.navbar` at top (realistic page context)
- Bootstrap collapse for replies: `<a data-toggle="collapse" href="#replies-23">4 replies</a><div id="replies-23" class="collapse">`
- Some pages: Bootstrap tab component for "All Comments / Top Comments / My Comments"
- Some pages: Bootstrap modal for the compose form (triggered by "Add Comment" button)
- 10% of pages: Bootstrap 3 `.thumbnail` component used for avatar display
- 15% of pages: Bootstrap `.progress` bar showing comment sentiment or rating distribution

### CDN References to Include
- Bootstrap CSS: `https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css`
- Bootstrap JS: `https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js`
- jQuery (required for Bootstrap 3 JS): `https://code.jquery.com/jquery-2.2.4.min.js`
- Or Bootstrap 4: `https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css`
- Font Awesome (on some pages): `https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css`
