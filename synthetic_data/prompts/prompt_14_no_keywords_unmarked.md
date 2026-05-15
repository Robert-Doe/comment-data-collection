# Prompt 14 — Comments With No Semantic Keywords or ARIA Labels (Adversarial / Hard)

**Target pages:** 100  
**Output dir:** `synthetic_data/pages/prompt_14/`  
**Era:** Any — intentionally keyword-stripped  
**Label:** Positive (comment section present) — ADVERSARIAL set

---

## LLM Generation Prompt

Generate a complete, self-contained HTML page where a clear, functional comment section exists — but **the word "comment" (and its synonyms: "reply", "discuss", "discussion", "feedback", "response", "thread", "post") does NOT appear anywhere in the HTML** — not in class names, IDs, placeholder text, labels, headings, aria-label attributes, or visible text content. The structure must still be obviously a comment section to a human reader, but a keyword-based detector would find no signal. This is the most challenging and important adversarial set. Each of the 100 pages must vary:

### The Core Adversarial Constraint
The following words must appear NOWHERE in the HTML output:
- `comment`, `comments`, `commented`, `commenting`
- `reply`, `replies`, `replied`, `replying`
- `discuss`, `discussion`, `discussions`
- `feedback`, `response`, `responses`
- `thread`, `threads`, `threaded`
- `post` (as in "post a comment") — OK if used as "blog post" in content text

Instead, use substitute vocabulary:
- Section headings: "Voices", "Thoughts", "What You're Saying", "Community", "Reactions", "Notes", "Perspectives", "The Conversation", "Your Take", "Engage", "Weigh In", "Share Your Mind", numbers only ("47"), or no heading
- Submit button: "Send", "Submit", "Publish", "Add", "Join", "Go", "→", "Contribute", "Speak Up", "Say It"
- Input placeholder: "What do you think?", "Say something...", "Share your perspective", "Add to the conversation", "Your thoughts...", "Speak your mind", or empty placeholder
- Author label: "Name", "Handle", "Who are you?", "Nickname", "Identity", "Alias", or just omit the label

### Class Name Constraints (no keyword leakage)
Do NOT use: `.comment`, `.reply`, `.discussion`, `.feedback`, `.thread`, `.response`  
DO use:
- Positional: `.entry`, `.item`, `.row`, `.unit`, `.node`, `.block`, `.cell`, `.piece`
- Abstract: `.voice`, `.thought`, `.note`, `.reaction`, `.perspective`, `.contribution`
- Purely structural: `.c1`, `.c2`, `.u`, `.i`, `.b`, `.m` (single-letter opaque names)
- Data-model names: `.message`, `.statement`, `.opinion`, `.take`, `.view`
- CMS-internal: `.ugc-item`, `.user-content`, `.member-post`, `.audience-entry`
- Developer shorthand: `.cmt` (but not `.comment`), `.rpl` (but not `.reply`)

### Structural Dimensions to Vary (comment section must still be structurally clear)
- Number of comment units: 3 to 20
- Each unit must clearly show: author identifier, text content, and some form of timestamp or sequence number
- Nesting: 0 levels (flat), 1 level (indented sub-entries), 2 levels — vary
- Compose form: present (with submit action) or absent — vary 50/50
- Reply action: present (labeled "↩", "Re:", "Add to this", "Continue") or absent

### Era / Style to Vary
Apply different visual styles and eras across the 100 pages:
- Table-based pre-2003 style (but no "comment" word in any attribute)
- Div-soup 2006 style (opaque class names)
- HTML5 semantic 2012 style (article/section/time but no "comment" attributes)
- Flexbox mobile-first 2016 style
- Tailwind 2022 style (utility classes only — no custom class names at all)
- Web component style with `<user-voices>` or `<community-board>` custom elements

### Content Dimensions to Vary (text content must also avoid keywords)
- Heading text: "The Floor Is Yours", "47 Voices", "What You're Saying", "The Room", "Open Mic", "Chime In", "Your Perspective", "Audience", "The Gallery", "Reception"
- Page topics: art piece, news editorial, product page, community announcement, event recap, scientific finding
- Author identification: some pages show usernames, some show first-name only, some show "Anonymous", some show numbered identities ("User 42", "Participant 7")

### What Makes This Hard for a Detector
- No "comment" keyword anywhere
- No "reply" keyword anywhere
- No obvious ARIA roles like `role="comment"` 
- The structural patterns (repeated units of author + text + time) must carry the signal — not vocabulary
- 20% of pages: also remove timestamps — author + text only, no time signal
- 15% of pages: avatar images are absent — pure text units only
