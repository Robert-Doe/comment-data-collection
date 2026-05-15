# Prompt 17 — Multilingual & Global-Style Comment Sections (Non-English / RTL / CJK)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_17/`  
**Era:** Any  
**Label:** Positive (comment section present)

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where the comment section content and/or UI labels are in a **non-English language or script**, including right-to-left (RTL) languages, CJK (Chinese/Japanese/Korean), Arabic, Devanagari, Cyrillic, and others. These pages test whether a structural detector can identify comment sections regardless of language. Each of the 100 pages must vary across language, script, and structural patterns:

### Language / Script Distribution (vary across 100 pages — roughly equal distribution)
- **Arabic** (~15 pages): RTL, `dir="rtl"` on html or section, `lang="ar"`, Arabic comment text, Arabic UI labels ("تعليقات", "إضافة تعليق", "رد"), Arabic usernames
- **Hebrew** (~5 pages): RTL, `lang="he"`, Hebrew text (rtl layout)
- **Simplified Chinese** (~15 pages): `lang="zh-CN"`, CJK characters, labels like "评论", "发表评论", "回复", Chinese usernames
- **Traditional Chinese** (~5 pages): `lang="zh-TW"`, Traditional characters, "留言", "回應"
- **Japanese** (~10 pages): `lang="ja"`, Japanese mix of Hiragana/Katakana/Kanji, "コメント", "返信", "投稿する"
- **Korean** (~5 pages): `lang="ko"`, Hangul characters, "댓글", "답글", "작성자"
- **Russian / Cyrillic** (~10 pages): `lang="ru"`, Cyrillic, "Комментарии", "Ответить", "Добавить комментарий"
- **Hindi / Devanagari** (~5 pages): `lang="hi"`, Devanagari script, "टिप्पणियाँ", "उत्तर दें"
- **Spanish** (~5 pages): `lang="es"`, Latin alphabet, "Comentarios", "Responder", "Añadir comentario"
- **Portuguese** (~5 pages): `lang="pt"`, "Comentários", "Responder", "Deixar um comentário"
- **French** (~5 pages): `lang="fr"`, "Commentaires", "Répondre", "Laisser un commentaire"
- **German** (~5 pages): `lang="de"`, "Kommentare", "Antworten", "Kommentar hinterlassen"
- **Mixed multilingual** (~5 pages): UI in English but comment content in multiple languages (international community)

### RTL-Specific Requirements (Arabic and Hebrew pages)
- `<html dir="rtl" lang="ar">` or `dir="rtl"` on the comment section container
- `text-align: right` as default in CSS
- Avatar floated to the right instead of left
- Reply indentation goes right to left (margin-right instead of margin-left)
- Submit button alignment: right-aligned
- Date shown on the left (opposite of LTR layouts)
- Some pages mix RTL and LTR (bidi text) — a username in Latin script inside Arabic content

### CJK-Specific Requirements (Chinese/Japanese/Korean pages)
- `font-family: 'Noto Sans CJK', 'Microsoft YaHei', 'Hiragino Kaku Gothic', sans-serif` or similar CJK font stack
- `word-break: break-all` or `word-break: break-word` (CJK text has no spaces to break on)
- Very short comment "words" that are actually complete sentences (CJK character density)
- Some pages: vertical writing mode for Japanese (`writing-mode: vertical-rl` on some decorative elements)
- Username patterns: Chinese names (2–3 characters), Japanese names (mix scripts), Korean names

### Structural Dimensions to Vary
- Comment count: 3 to 20
- Nesting: flat, 1-level, 2-level replies
- Compose form: present (with culturally appropriate label language) or absent
- Avatar: present or absent; some CJK sites use very small avatars (24px); some use large profile cards
- Date formats: vary by culture — "2026年5月14日" (Japanese), "١٤ مايو ٢٠٢٦" (Arabic), "14/05/2026" (European)
- Like/thumbs: present or absent; Chinese sites often use ❤ or 赞 (zàn = "like")

### HTML Characteristics
- Proper `lang` attribute on `<html>` element for every page
- `<meta charset="UTF-8">` always present
- `dir="rtl"` on HTML or section for RTL languages
- Font stack appropriate to the language script
- Some pages: `hreflang` alternate link tags in `<head>` indicating other language versions
- Schema.org: `inLanguage` property on some pages: `<meta itemprop="inLanguage" content="ar">`

### Class Name Patterns
- Class names remain in English (common practice even on non-English sites)
- Some pages: class names transliterated from the local language (rare but real): `.pinglun-list` (Chinese 评论), `.kommentar-block` (German), `.commentaire-item` (French)
- Japanese tech developers often use English class names even on Japanese sites

### Content Notes
- Comment text should be realistic (not just placeholder Lorem Ipsum in the target script)
- Use culturally appropriate topics: for Arabic pages — news/politics/tech; for Japanese — anime/tech/lifestyle; for Russian — news/culture/technology
- Include realistic usernames in the target script (not just transliterated English names)
