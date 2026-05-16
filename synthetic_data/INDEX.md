# Synthetic UGC Bank — Master Index

**Goal:** 4,000 HTML pages covering the full spectrum of web UGC: comment sections (prompts 01–20) and diverse UGC types (prompts 21–40).  
**Structure:** 40 prompts × 100 pages each.  
**Droplet route:** `https://api.xsscommentdetection.me/synthetic/{prompt_id}/{page_id}.html`

---

## Prompt Directory

| ID | File | Theme | Era / Key Trait |
|----|------|-------|-----------------|
| 01 | [prompt_01](prompts/prompt_01_ancient_table_based.md) | Ancient table-layout comment boxes | Pre-2003, no CSS layout |
| 02 | [prompt_02](prompts/prompt_02_phpbb_vbulletin_era.md) | phpBB / vBulletin forum-style threads | 2001–2007, flat threads |
| 03 | [prompt_03](prompts/prompt_03_div_soup_no_semantics.md) | Pure div-soup, no semantic tags | 2004–2009, divitis |
| 04 | [prompt_04](prompts/prompt_04_early_facebook_era.md) | Early Facebook-style inline comment boxes | 2007–2010 |
| 05 | [prompt_05](prompts/prompt_05_jquery_progressive.md) | jQuery-era progressively enhanced comments | 2008–2013 |
| 06 | [prompt_06](prompts/prompt_06_disqus_third_party_embeds.md) | Third-party embed wrappers (Disqus/Livefyre/IntenseDebate) | 2009–2018 |
| 07 | [prompt_07](prompts/prompt_07_early_html5_semantic.md) | First-wave HTML5 semantic comment sections | 2010–2013 |
| 08 | [prompt_08](prompts/prompt_08_bootstrap_era.md) | Bootstrap 2 / 3 comment panels & media objects | 2012–2016 |
| 09 | [prompt_09](prompts/prompt_09_reddit_deep_nesting.md) | Reddit-style deeply nested threaded comments | 2010–present |
| 10 | [prompt_10](prompts/prompt_10_mobile_first_responsive.md) | Mobile-first responsive flat comment feeds | 2013–2017 |
| 11 | [prompt_11](prompts/prompt_11_shadow_dom_web_components.md) | Shadow DOM / Web Component encapsulated widgets | 2016–present |
| 12 | [prompt_12](prompts/prompt_12_spa_rendered_react_vue.md) | SPA-rendered comment markup (React/Vue/Angular output) | 2015–present |
| 13 | [prompt_13](prompts/prompt_13_no_reply_flat_lists.md) | Flat comment lists with zero reply affordance | Timeless / minimalist |
| 14 | [prompt_14](prompts/prompt_14_no_keywords_unmarked.md) | Comments with no semantic keywords or aria labels | Adversarial / hard negative |
| 15 | [prompt_15](prompts/prompt_15_broken_irregular_legacy.md) | Broken, irregular, and legacy-patched comment sections | Adversarial / noisy |
| 16 | [prompt_16](prompts/prompt_16_product_review_hybrid.md) | Product-review-adjacent comment hybrids (star ratings + text) | E-commerce era |
| 17 | [prompt_17](prompts/prompt_17_multilingual_global.md) | Multilingual & global-style comment sections | Non-English / RTL / CJK |
| 18 | [prompt_18](prompts/prompt_18_jamstack_headless_cms.md) | JAMstack / headless CMS comment sections | 2018–present |
| 19 | [prompt_19](prompts/prompt_19_ai_generated_modern.md) | AI-assisted modern minimalist comment UI | 2022–present |
| 20 | [prompt_20](prompts/prompt_20_without_textarea_no_compose.md) | Read-only comment sections — no compose/textarea at all | Archived / locked threads |

### Set 2 — Review & UGC Evolution (prompts 21–40)

Organized by structural era, mirroring how prompts 01–20 cover comment section evolution. Progresses from 1998 legacy HTML through the SPA era into AI-first and social commerce, then ends with adversarial hard cases.

| ID | File | Theme | Era / Key Trait |
|----|------|-------|-----------------|
| 21 | [prompt_21](prompts/prompt_21_legacy_table_star_reviews.md) | Legacy table-based star reviews | 1998–2004, HTML 4.01, img GIF stars, no schema |
| 22 | [prompt_22](prompts/prompt_22_early_forum_product_threads.md) | Early forum product discussion threads | 2002–2008, phpBB/vBulletin, quote blocks, user rank |
| 23 | [prompt_23](prompts/prompt_23_web2_ajax_review_widgets.md) | Web 2.0 AJAX-era review widgets | 2005–2010, XMLHttpRequest divs, border-radius, jQuery stubs |
| 24 | [prompt_24](prompts/prompt_24_hreview_microformat_era.md) | hReview / hAtom microformat reviews | 2005–2011, class="hreview", vcard, abbr title dates |
| 25 | [prompt_25](prompts/prompt_25_early_mobile_wap_reviews.md) | Early mobile / WAP-simplified reviews | 2007–2012, XHTML-MP, m.site.com, minimal CSS |
| 26 | [prompt_26](prompts/prompt_26_schema_org_microdata_reviews.md) | Schema.org microdata review pages | 2011–2016, itemscope/itemprop, rich snippets era |
| 27 | [prompt_27](prompts/prompt_27_bootstrap_card_era_reviews.md) | Bootstrap card era reviews | 2013–2017, panel/card components, glyphicons, Font Awesome |
| 28 | [prompt_28](prompts/prompt_28_third_party_review_embeds.md) | Third-party review widget embeds | 2012–2019, Bazaarvoice/PowerReviews/Yotpo, namespaced CSS |
| 29 | [prompt_29](prompts/prompt_29_amp_review_pages.md) | AMP (Accelerated Mobile Pages) reviews | 2016–2021, amp-list, amp-img, AMP boilerplate |
| 30 | [prompt_30](prompts/prompt_30_spa_rendered_reviews.md) | SPA-rendered review sections | 2016–2022, React/Vue/Angular SSR, data-reactroot, ng-version |
| 31 | [prompt_31](prompts/prompt_31_jamstack_ssg_reviews.md) | JAMstack / SSG static review pages | 2018–2024, Gatsby/Next.js/Astro, Tailwind, build artifacts |
| 32 | [prompt_32](prompts/prompt_32_ai_generated_review_summaries.md) | AI-generated review summaries | 2022–present, LLM synthesis block + individual reviews |
| 33 | [prompt_33](prompts/prompt_33_video_first_ugc_reviews.md) | Video-first UGC reviews | 2020–present, TikTok Shop thumbnails, social commerce |
| 34 | [prompt_34](prompts/prompt_34_social_commerce_reviews.md) | Social commerce hybrid reviews | 2020–present, Shopify/Okendo/Loox, photo UGC strip, DTC |
| 35 | [prompt_35](prompts/prompt_35_adversarial_pure_rating_no_text.md) | Adversarial: pure rating / no text | Hard case — structure present, text absent or minimal |
| 36 | [prompt_36](prompts/prompt_36_adversarial_no_identifiers.md) | Adversarial: zero-identifier review blocks | Hard case — no class/id/aria/schema, raw HTML only |
| 37 | [prompt_37](prompts/prompt_37_adversarial_review_spam_seo.md) | Adversarial: review spam / SEO-padded | Hard case — real structure, fake/spammy content |
| 38 | [prompt_38](prompts/prompt_38_adversarial_gated_paywalled_reviews.md) | Adversarial: paywalled / login-gated reviews | Hard case — CSS blur/overlay, truncated, access-barred |
| 39 | [prompt_39](prompts/prompt_39_adversarial_dark_obfuscated_reviews.md) | Adversarial: dark pattern / obfuscated markup | Hard case — hashed classes, fragmented DOM, misleading roles |
| 40 | [prompt_40](prompts/prompt_40_headless_commerce_api_reviews.md) | Headless commerce / API-first reviews | 2020–present, Shopify Hydrogen/Remix, RSC, streaming SSR |

---

## Page Bank Status

| Prompt | Pages Generated | Droplet Route |
|--------|----------------|---------------|
| 01 | 0 / 100 | `/synthetic/prompt_01/` |
| 02 | 0 / 100 | `/synthetic/prompt_02/` |
| 03 | 0 / 100 | `/synthetic/prompt_03/` |
| 04 | 0 / 100 | `/synthetic/prompt_04/` |
| 05 | 0 / 100 | `/synthetic/prompt_05/` |
| 06 | 0 / 100 | `/synthetic/prompt_06/` |
| 07 | 0 / 100 | `/synthetic/prompt_07/` |
| 08 | 0 / 100 | `/synthetic/prompt_08/` |
| 09 | 0 / 100 | `/synthetic/prompt_09/` |
| 10 | 0 / 100 | `/synthetic/prompt_10/` |
| 11 | 0 / 100 | `/synthetic/prompt_11/` |
| 12 | 0 / 100 | `/synthetic/prompt_12/` |
| 13 | 0 / 100 | `/synthetic/prompt_13/` |
| 14 | 0 / 100 | `/synthetic/prompt_14/` |
| 15 | 0 / 100 | `/synthetic/prompt_15/` |
| 16 | 0 / 100 | `/synthetic/prompt_16/` |
| 17 | 0 / 100 | `/synthetic/prompt_17/` |
| 18 | 0 / 100 | `/synthetic/prompt_18/` |
| 19 | 0 / 100 | `/synthetic/prompt_19/` |
| 20 | 0 / 100 | `/synthetic/prompt_20/` |
| 21 | 0 / 100 | `/synthetic/prompt_21/` |
| 22 | 0 / 100 | `/synthetic/prompt_22/` |
| 23 | 0 / 100 | `/synthetic/prompt_23/` |
| 24 | 0 / 100 | `/synthetic/prompt_24/` |
| 25 | 0 / 100 | `/synthetic/prompt_25/` |
| 26 | 0 / 100 | `/synthetic/prompt_26/` |
| 27 | 0 / 100 | `/synthetic/prompt_27/` |
| 28 | 0 / 100 | `/synthetic/prompt_28/` |
| 29 | 0 / 100 | `/synthetic/prompt_29/` |
| 30 | 0 / 100 | `/synthetic/prompt_30/` |
| 31 | 0 / 100 | `/synthetic/prompt_31/` |
| 32 | 0 / 100 | `/synthetic/prompt_32/` |
| 33 | 0 / 100 | `/synthetic/prompt_33/` |
| 34 | 0 / 100 | `/synthetic/prompt_34/` |
| 35 | 0 / 100 | `/synthetic/prompt_35/` |
| 36 | 0 / 100 | `/synthetic/prompt_36/` |
| 37 | 0 / 100 | `/synthetic/prompt_37/` |
| 38 | 0 / 100 | `/synthetic/prompt_38/` |
| 39 | 0 / 100 | `/synthetic/prompt_39/` |
| 40 | 0 / 100 | `/synthetic/prompt_40/` |

**Total:** 0 / 4,000

---

## Notes
- Each page is a self-contained HTML file with inline styles (no external deps)
- Pages are served statically from `/synthetic/` route on the DigitalOcean droplet
- Each page should be scannable by the existing `scanner.js` pipeline
- Labels: all pages in `synthetic_data/pages/` are **positive** (comment section present = true)
