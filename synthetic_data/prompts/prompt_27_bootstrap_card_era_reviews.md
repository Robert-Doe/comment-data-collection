# Prompt 27 — Bootstrap Card Era Reviews (2013–2017)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_27/`  
**Era:** 2013–2017 (Bootstrap 2.x → 3.x → early 4.x, flat design, Material Design influence)  
**UGC type:** Product / service reviews — Bootstrap-styled card/panel layouts  
**Label:** Positive (UGC region present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page representing a review section from the Bootstrap era (2013–2017), when most small-to-midsize sites adopted Twitter Bootstrap and built review sections using `panel`, `media`, `well`, and `card` components. Star ratings appeared as Font Awesome icon stacks or glyphicons. This era is highly recognizable by its uniform grid system and component class names. Each of the 100 pages must vary across ALL of the following dimensions.

### Structural Dimensions to Vary
- Number of reviews: 6–20
- Bootstrap version signal: Bootstrap 2 uses `span4`, `span8`, `row-fluid`; Bootstrap 3 uses `col-md-4`, `col-md-8`, `panel`, `media`; Bootstrap 4 uses `card`, `d-flex`, `mr-3`
- Review card component: Bootstrap 3 `.panel.panel-default` with `.panel-heading` and `.panel-body`, OR Bootstrap 4 `.card` with `.card-body`
- Media object pattern for reviewer info: `.media` container with `.media-left` avatar and `.media-body` review text
- Star rating: `<i class="glyphicon glyphicon-star">` (Bootstrap 2/3) or `<i class="fa fa-star">` (Font Awesome, Bootstrap 4 era) — inline HTML only
- Aggregate rating: progress bar per star level (`<div class="progress"><div class="progress-bar" style="width:60%">`)
- "Write a Review" button: `.btn.btn-primary` or `.btn.btn-success`
- Sort/filter bar: `.btn-group` with "Most Recent | Most Helpful | Highest Rated" buttons
- Pagination: Bootstrap `.pagination` `<ul>` component with `<li class="active">`
- "Verified Purchase" badge: `.label.label-success` (Bootstrap 3) or `.badge` (Bootstrap 4)

### HTML/CSS Characteristics (Bootstrap era 2013–2017)
- DOCTYPE: `<!DOCTYPE html>`
- Bootstrap CDN link: `<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">` or Bootstrap 4 CDN equivalent — include as real link (page is static, CSS won't load but link is present for realism)
- Grid structure: `.container > .row > .col-md-X` wrapping the entire page and review section
- Font Awesome CDN link present on ~60% of pages: `<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css">`
- Custom CSS in `<style>` block: minimal overrides like `.review-avatar { border-radius: 50%; width: 50px; }` and `.star-rating { color: #F39C12; }`
- Semantic HTML: `<article>` per review on ~40% of pages, `<section class="reviews-section">` container on ~50%
- ARIA: `aria-label` on some interactive elements, but not comprehensively applied
- Flat design color palette: Bootstrap defaults (#337AB7 blue, #5CB85C green, #F0AD4E orange, #D9534F red) or customized flat colors
- jQuery and Bootstrap JS CDN links present in `<script>` tags at bottom (even though page is static, links are realistic)
- Avatar: `<img src="user-avatar.jpg" class="img-circle">` (Bootstrap 3) or `<img class="rounded-circle">` (Bootstrap 4)

### Content Dimensions to Vary
- Product/service categories: SaaS products, mobile apps, consumer electronics (2013–2017 era: fitness trackers, smart home devices, streaming sticks, e-readers), online courses, subscription services, restaurants, hotels
- Review length: tweet-length one-liner to 3-paragraph detailed assessment
- Bootstrap version distribution: ~30% Bootstrap 2, ~50% Bootstrap 3, ~20% early Bootstrap 4
- Schema.org: present on ~40% of pages (this era saw growing adoption)
- Date formats: "January 5, 2016", "Jan 2016", "5 days ago", "2016-01-05"
- "Pros" / "Cons" structured sub-sections on Epinions/G2-influenced pages

### Output Format
Single complete HTML file. Include full Bootstrap `<head>` CDN links. Show a product name, aggregate rating, and review count at the top of the reviews section. Then render the reviews using Bootstrap component markup. Vary the Bootstrap version (2/3/4) across pages — use appropriate class names for each version.
