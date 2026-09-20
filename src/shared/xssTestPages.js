'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const catalogPath = path.resolve(__dirname, 'xss-test-pages', 'catalog.json');
const publicMountPath = '/test/pages';
const pageSize = 200;
const reactGroupSize = 12;
const liveDefaultRoom = 'global';
const liveStoreMaxCommentsPerRoom = 200;
const liveAllowedSinks = new Set([
  'innerHTML',
  'insertAdjacentHTML',
  'rangeFragment',
  'templateClone',
  'shadowDom',
  'iframeSrcdoc',
  'webComponent',
  'shadyDom',
  'angularSanitized',
]);

let cachedCatalog = null;
let cachedMtimeMs = 0;
let cachedReactGroups = null;
let cachedReactGroupsKey = '';
let liveStoreWriteQueue = Promise.resolve();

const frameworkSurfaces = [
  {
    id: 'react',
    label: 'React',
    sinkLabel: 'dangerouslySetInnerHTML',
    description: 'Client fetch plus React-style unsafe HTML comment islands.',
  },
  {
    id: 'vue',
    label: 'Vue',
    sinkLabel: 'v-html',
    description: 'Client fetch plus Vue-style v-html comment rendering.',
  },
  {
    id: 'angular-trusted',
    label: 'Angular Trusted HTML',
    sinkLabel: 'bypassSecurityTrustHtml',
    description: 'Client fetch plus Angular-style trusted HTML bypass rendering.',
  },
  {
    id: 'angular-sanitized',
    label: 'Angular Sanitized Control',
    sinkLabel: '[innerHTML] sanitizer',
    description: 'Client fetch plus Angular-style sanitized innerHTML control path.',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    sinkLabel: '{@html}',
    description: 'Client fetch plus Svelte-style raw HTML block rendering.',
  },
  {
    id: 'lit',
    label: 'Lit',
    sinkLabel: 'unsafeHTML',
    description: 'Client fetch plus Lit-style unsafeHTML directive rendering.',
  },
  {
    id: 'web-components',
    label: 'Web Components',
    sinkLabel: 'custom elements and shadow roots',
    description: 'Client fetch into custom elements with open shadow roots.',
  },
  {
    id: 'shady-dom',
    label: 'ShadyDOM / Polymer-style',
    sinkLabel: 'ShadyDOM-style distribution',
    description: 'Client fetch into custom-element light DOM and ShadyDOM-style scoped containers.',
  },
  {
    id: 'server-components',
    label: 'Server Components Handoff',
    sinkLabel: 'server component data plus client island',
    description: 'Server-rendered app shell with client island hydration from stored comment data.',
  },
];

const frameworkSurfaceById = new Map(frameworkSurfaces.map((surface) => [surface.id, surface]));

const scenarios = [
  {
    kind: 'news',
    site: 'Civic Ledger',
    section: 'Local',
    title: 'Council weighs shorter approval window for neighborhood permits',
    dek: 'Residents are using the public comment thread to compare timelines, fees, and inspection notes.',
    author: 'Mara Voss',
    body: [
      'The planning committee is considering a shorter review window for small exterior projects after a backlog left homeowners waiting through the summer.',
      'City staff said the new queue would separate routine repairs from larger variance requests, with public objections still routed to a weekly review meeting.',
    ],
    commentsTitle: 'Reader Discussion',
    before: [
      ['Luis R.', 'This would help if the inspection calendar is visible. The uncertainty is the hard part.'],
      ['Nina Patel', 'Please keep the appeal period. Faster should not mean fewer chances to fix bad notices.'],
    ],
    after: [
      ['Caleb D.', 'The fee waiver for storm repairs should stay in the proposal.'],
      ['Anika W.', 'I hope they publish the queue data monthly so we can see whether it actually improves.'],
    ],
  },
  {
    kind: 'commerce',
    site: 'Northline Gear',
    section: 'Reviews',
    title: 'Trailpack 28L field notes',
    dek: 'Customer reviews focus on commuter storage, weekend use, and material wear after several months.',
    author: 'Review Desk',
    body: [
      'The latest batch adds a stiffer laptop sleeve and a revised sternum strap. The bag still aims at daily commuters who want room for short trips.',
      'Most reviewers mention the side bottle pocket and back panel ventilation before anything else.',
    ],
    commentsTitle: 'Customer Reviews',
    before: [
      ['Morgan', 'The side zip is the reason I kept it. I can reach a notebook without opening the whole bag.'],
      ['Priya', 'Rain cover worked during two wet bike rides. The zipper pulls are louder than expected.'],
    ],
    after: [
      ['Rae', 'The 28L size fits under the train seat if it is not overpacked.'],
      ['Theo', 'Would like one more muted color, but the strap update is solid.'],
    ],
  },
  {
    kind: 'forum',
    site: 'Build Board',
    section: 'Q&A',
    title: 'How are teams handling preview deployments for docs branches?',
    dek: 'A maintainer asks for practical advice on review links and stale branch cleanup.',
    author: 'elena.dev',
    body: [
      'We are moving our documentation to branch previews and need a cleanup policy that does not surprise reviewers.',
      'The current idea is a seven day TTL after merge, plus a manual pin for release candidates.',
    ],
    commentsTitle: 'Replies',
    before: [
      ['patchlevel', 'Use labels for pinned previews. It makes the cleanup job boring and auditable.'],
      ['samir', 'We post the preview URL back to the PR and expire it after the branch is deleted.'],
    ],
    after: [
      ['kline', 'If docs have screenshots, keep release previews longer. People link to them from support tickets.'],
      ['marta', 'A nightly report for stale previews helped us more than automatic deletion at first.'],
    ],
  },
  {
    kind: 'support',
    site: 'Parcel Desk',
    section: 'Support',
    title: 'Shipment hold after address correction',
    dek: 'A customer support case with staff notes and a public reply thread.',
    author: 'Case #48219',
    body: [
      'The package was placed on hold after the delivery address was corrected from a business suite to a residential unit.',
      'Support asked the recipient to confirm access instructions before the second delivery attempt is scheduled.',
    ],
    commentsTitle: 'Case Activity',
    before: [
      ['Support', 'We have updated the delivery note and requested a new route scan from the carrier.'],
      ['Customer', 'The lobby code is correct. Please leave it with reception if the courier arrives before 5.'],
    ],
    after: [
      ['Support', 'Second attempt is now queued for tomorrow afternoon.'],
      ['Customer', 'Thanks. I added the buzzer name to the account as well.'],
    ],
  },
  {
    kind: 'travel',
    site: 'Waypoint Journal',
    section: 'Itinerary',
    title: 'A three day rail loop through the lakes district',
    dek: 'Readers compare station transfers, luggage lockers, and late cafe options.',
    author: 'Jon Bell',
    body: [
      'The route keeps each train segment under ninety minutes and leaves enough time for evening walks near the water.',
      'The one tight transfer is the second morning connection, where the platforms are close but signage is easy to miss.',
    ],
    commentsTitle: 'Traveler Notes',
    before: [
      ['Iris', 'Locker row B was open when we arrived at 9:20. It filled up by lunch.'],
      ['Kenji', 'The last return train was quiet, but the platform cafe closed earlier than posted.'],
    ],
    after: [
      ['Maya', 'Book the lake ferry ahead if you are going on a weekend.'],
      ['Owen', 'The northbound platform has better elevator access for larger bags.'],
    ],
  },
  {
    kind: 'media',
    site: 'Frame Notes',
    section: 'Watch',
    title: 'Behind the edit: city timelapse sequence',
    dek: 'The production team answers viewer questions about gear, color, and location access.',
    author: 'Studio Team',
    body: [
      'The sequence was shot from four public rooftops over two evenings, then matched in post using the same neutral grade.',
      'A short breakdown of the stabilization pass will be added after the weekend.',
    ],
    commentsTitle: 'Viewer Comments',
    before: [
      ['Lena', 'The second rooftop angle is the cleanest. Nice job keeping the skyline level.'],
      ['Arun', 'Would love to see the raw-to-grade comparison for the blue hour clips.'],
    ],
    after: [
      ['Drew', 'The transition at 1:14 hides the speed ramp really well.'],
      ['Noa', 'Please cover your export settings in the next breakdown.'],
    ],
  },
  {
    kind: 'market',
    site: 'Craft Exchange',
    section: 'Listing',
    title: 'Restored walnut desk with brass pulls',
    dek: 'Buyers are asking about dimensions, pickup timing, and finish care.',
    author: 'June H.',
    body: [
      'The desk was refinished last month with a low-sheen hardwax oil. The drawers slide cleanly and the original pulls were polished, not replaced.',
      'Pickup is available on the east side, with elevator access and a loading bay during weekday mornings.',
    ],
    commentsTitle: 'Questions',
    before: [
      ['Alex', 'Can the legs be removed for transport? My stairwell has a tight landing.'],
      ['Seller', 'The legs are bolted on and can be removed with a socket wrench.'],
    ],
    after: [
      ['Marin', 'Is the back finished or meant to sit against a wall?'],
      ['Seller', 'The back is finished, but the cable opening is visible.'],
    ],
  },
  {
    kind: 'issues',
    site: 'Release Track',
    section: 'Issue',
    title: 'Export dialog loses selected filters after refresh',
    dek: 'Maintainers discuss reproduction steps and whether the bug affects saved views.',
    author: 'qa-ops',
    body: [
      'When the export dialog is opened from a filtered table and the browser refreshes, the visible table keeps its filters but the export payload resets.',
      'The bug appears only when the saved view was loaded from a shared link.',
    ],
    commentsTitle: 'Thread',
    before: [
      ['rivas', 'Confirmed on the staging build. The query string is correct, but the dialog state initializes too early.'],
      ['mlee', 'Saved private views do not reproduce this for me. Shared links do.'],
    ],
    after: [
      ['nadia', 'I added this to the patch milestone because it can leak unrelated rows into exports.'],
      ['qa-ops', 'Regression test should cover refresh and direct deep-link load.'],
    ],
  },
  {
    kind: 'learning',
    site: 'Course Hub',
    section: 'Lesson',
    title: 'Week 4 lab: measuring layout stability',
    dek: 'Students compare notes on browser traces and report their lab measurements.',
    author: 'Instructor',
    body: [
      'This lab asks students to capture a performance trace, identify layout shifts, and explain the user-visible cause of each one.',
      'Submissions are due after the live review session so teams can revise their measurements.',
    ],
    commentsTitle: 'Class Discussion',
    before: [
      ['Talia', 'My biggest shift came from the font swap. Preloading fixed most of it.'],
      ['Ben', 'Images without width and height were the issue in our trace.'],
    ],
    after: [
      ['Instructor', 'Both examples are good. Include the before and after trace markers in your writeup.'],
      ['Jules', 'Should we count shifts that happen after a button click?'],
    ],
  },
  {
    kind: 'food',
    site: 'Pantry Log',
    section: 'Recipe',
    title: 'Sheet pan chickpeas with lemon yogurt',
    dek: 'Home cooks leave notes on spice levels, substitutions, and make-ahead timing.',
    author: 'Nora Vale',
    body: [
      'The chickpeas roast until crisp at the edges while the onions soften underneath. A cool lemon yogurt balances the smoked paprika.',
      'The recipe holds well for lunch if the yogurt is packed separately.',
    ],
    commentsTitle: 'Cook Notes',
    before: [
      ['Mila', 'Added fennel seed and it worked. Next time I will double the onions.'],
      ['Grant', 'Greek yogurt was too thick until I loosened it with a splash of water.'],
    ],
    after: [
      ['Nora', 'Good call on thinning the yogurt. I updated the note.'],
      ['Ash', 'Roasted cauliflower fits on the same pan if the florets are small.'],
    ],
  },
  {
    kind: 'events',
    site: 'Venue Wire',
    section: 'Events',
    title: 'Outdoor film night moves to the west lawn',
    dek: 'Attendees coordinate seating, parking, and vendor options after the venue change.',
    author: 'Events Team',
    body: [
      'The screening will move to the west lawn because the main courtyard is under repair. Tickets remain valid and gates open at the same time.',
      'Food vendors will be placed along the north path to keep the lawn entrances clear.',
    ],
    commentsTitle: 'Attendee Comments',
    before: [
      ['Cass', 'Is the west gate open for bikes, or should we use the main entrance?'],
      ['Events Team', 'Bike parking will be beside the west gate. Staff will direct arrivals.'],
    ],
    after: [
      ['Rohan', 'Please add extra signage from the garage. It is confusing after dark.'],
      ['Mina', 'Blankets still allowed? The lawn gets cold by the second feature.'],
    ],
  },
  {
    kind: 'research',
    site: 'Lab Notebook',
    section: 'Methods',
    title: 'Pilot notes from a comment-region labeling pass',
    dek: 'Researchers compare annotation disagreements and page capture quirks.',
    author: 'Data Team',
    body: [
      'The first pass found that nested reply threads were the main source of disagreement between reviewers.',
      'Pages with lazy-loaded comments need a longer settle window before the candidate extractor runs.',
    ],
    commentsTitle: 'Reviewer Notes',
    before: [
      ['S. Kim', 'The depth labels need an example for collapsed replies.'],
      ['Aria', 'I marked widgets as negative if no user text was visible after expansion.'],
    ],
    after: [
      ['J. Ortiz', 'Can we add a separate flag for comment forms without existing comments?'],
      ['Data Team', 'Yes, that will help us separate sinks from populated threads.'],
    ],
  },
];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function compactText(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function csvEscape(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function normalizeLiveRoom(value) {
  const room = String(value || liveDefaultRoom)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return room || liveDefaultRoom;
}

function resolveLiveStorePath(options = {}) {
  const artifactRoot = options.artifactRoot
    ? path.resolve(options.artifactRoot)
    : path.resolve(process.cwd(), 'output', 'artifacts');
  return path.join(artifactRoot, 'xss-test-pages', 'live-comments.json');
}

function safeLiveSession(value) {
  const session = compactText(value, 96).replace(/[^\w:.-]+/g, '-');
  return session || 'anonymous';
}

function liveSessionFromRequest(req) {
  return safeLiveSession(
    (req.body && req.body.session_id)
      || req.get('x-xss-live-session')
      || req.query.session
      || 'anonymous',
  );
}

function liveEventId(prefix = 'live') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortDigest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function livePayloadMetadata(bodyHtml, source = 'live-submission') {
  const payload = String(bodyHtml || '');
  const events = Array.from(payload.matchAll(/\bon[a-zA-Z0-9:-]+(?=\s*=)/g))
    .map((match) => match[0].toLowerCase())
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort();
  const tagMatch = payload.match(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/);
  const lower = payload.toLowerCase();
  const sinkTypes = [];
  if (/<\s*script\b/.test(lower)) sinkTypes.push('script-tag');
  if (/\bon[a-z0-9:-]+\s*=/.test(lower)) sinkTypes.push('inline-event-handler');
  if (/\bjavascript\s*:/.test(lower)) sinkTypes.push('javascript-url');
  if (/<\s*(svg|math|img|video|audio|iframe|object|embed)\b/.test(lower)) sinkTypes.push('active-markup');
  if (/\bsrcdoc\s*=/.test(lower)) sinkTypes.push('srcdoc');
  if (/\bfetch\s*\(|sendbeacon\s*\(|new\s+image\s*\(/.test(lower)) sinkTypes.push('network-callback');
  return {
    id: `${source}-${shortDigest(payload || source)}`,
    number: null,
    source,
    title: events.length ? events.join(', ') : 'Live stored payload',
    tag: tagMatch ? tagMatch[1].toLowerCase() : '',
    events,
    sink_types: Array.from(new Set(sinkTypes)),
  };
}

function normalizeLiveStore(value) {
  const rooms = value && typeof value === 'object' && value.rooms && typeof value.rooms === 'object'
    ? value.rooms
    : {};
  return {
    schema_version: 1,
    updated_at: value && value.updated_at ? String(value.updated_at) : '',
    rooms,
  };
}

async function readLiveStore(storePath) {
  try {
    const raw = await fs.promises.readFile(storePath, 'utf8');
    return normalizeLiveStore(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === 'ENOENT') return normalizeLiveStore(null);
    if (error instanceof SyntaxError) return normalizeLiveStore(null);
    throw error;
  }
}

async function writeLiveStore(storePath, store) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const next = {
    ...normalizeLiveStore(store),
    updated_at: new Date().toISOString(),
  };
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await fs.promises.rename(tempPath, storePath);
}

function updateLiveStore(storePath, updater) {
  liveStoreWriteQueue = liveStoreWriteQueue
    .catch(() => {})
    .then(async () => {
      const store = await readLiveStore(storePath);
      const result = await updater(store);
      await writeLiveStore(storePath, store);
      return result;
    });
  return liveStoreWriteQueue;
}

function getLiveRoomRecord(store, room) {
  const normalized = normalizeLiveRoom(room);
  if (!store.rooms[normalized] || typeof store.rooms[normalized] !== 'object') {
    store.rooms[normalized] = { comments: [], events: [] };
  }
  const record = store.rooms[normalized];
  if (!Array.isArray(record.comments)) record.comments = [];
  if (!Array.isArray(record.events)) record.events = [];
  return record;
}

async function readLiveRoom(storePath, room) {
  const store = await readLiveStore(storePath);
  const record = getLiveRoomRecord(store, room);
  return {
    comments: record.comments.slice(-liveStoreMaxCommentsPerRoom),
  };
}

async function appendLiveComment(storePath, room, comment) {
  return updateLiveStore(storePath, (store) => {
    const record = getLiveRoomRecord(store, room);
    record.comments.push(comment);
    if (record.comments.length > liveStoreMaxCommentsPerRoom) {
      record.comments = record.comments.slice(-liveStoreMaxCommentsPerRoom);
    }
    return comment;
  });
}

function loadCatalog() {
  let stat;
  try {
    stat = fs.statSync(catalogPath);
  } catch (_) {
    return {
      schema_version: 1,
      generated_at: '',
      sources: [],
      render_modes: [],
      counts: { total: 0, by_source: {}, by_render_mode: {} },
      entries: [],
      byId: new Map(),
      byNumber: new Map(),
    };
  }

  if (cachedCatalog && cachedMtimeMs === stat.mtimeMs) {
    return cachedCatalog;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  const byId = new Map();
  const byNumber = new Map();
  for (const entry of entries) {
    byId.set(String(entry.id), entry);
    byNumber.set(Number(entry.number), entry);
  }
  cachedCatalog = {
    ...catalog,
    entries,
    byId,
    byNumber,
  };
  cachedMtimeMs = stat.mtimeMs;
  return cachedCatalog;
}

function getBaseUrl(req) {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim() || 'http';
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  return `${proto}://${host}${publicMountPath}`;
}

function pageHref(entry) {
  return `${publicMountPath}/${entry.number}`;
}

function resolveEntry(catalog, rawId) {
  const id = String(rawId || '').replace(/\.html$/i, '').trim();
  if (!id) return null;
  if (/^(?:page-)?0*\d+$/i.test(id)) {
    const number = Number(id.replace(/^(?:page-)?0*/i, '') || '0');
    return catalog.byNumber.get(number) || null;
  }
  return catalog.byId.get(id) || null;
}

function filterEntries(catalog, query) {
  let entries = catalog.entries;
  const source = String(query.source || '').trim().toLowerCase();
  const mode = String(query.mode || '').trim().toLowerCase();
  const q = String(query.q || '').trim().toLowerCase();
  if (source) {
    entries = entries.filter((entry) => String(entry.source || '').toLowerCase() === source);
  }
  if (mode) {
    entries = entries.filter((entry) => String(entry.render_mode || '').toLowerCase() === mode);
  }
  if (q) {
    entries = entries.filter((entry) => [
      entry.id,
      entry.number,
      entry.source,
      entry.category,
      entry.group,
      entry.title,
      entry.description,
      entry.tag,
      (entry.events || []).join(' '),
      (entry.sink_types || []).join(' '),
      entry.payload,
    ].some((value) => String(value || '').toLowerCase().includes(q)));
  }
  return entries;
}

function renderSourceOptions(catalog, selected) {
  const sources = Object.keys((catalog.counts && catalog.counts.by_source) || {}).sort();
  return ['<option value="">All sources</option>']
    .concat(sources.map((source) => {
      const isSelected = source === selected ? ' selected' : '';
      return `<option value="${escapeAttribute(source)}"${isSelected}>${escapeHtml(source)}</option>`;
    }))
    .join('');
}

function renderModeOptions(catalog, selected) {
  const modes = Object.keys((catalog.counts && catalog.counts.by_render_mode) || {}).sort();
  return ['<option value="">All render modes</option>']
    .concat(modes.map((mode) => {
      const isSelected = mode === selected ? ' selected' : '';
      return `<option value="${escapeAttribute(mode)}"${isSelected}>${escapeHtml(mode)}</option>`;
    }))
    .join('');
}

function primaryGroupLabel(entry) {
  const events = Array.isArray(entry && entry.events) ? entry.events.filter(Boolean) : [];
  if (events.length) return events[0];
  const sinks = Array.isArray(entry && entry.sink_types) ? entry.sink_types.filter(Boolean) : [];
  if (sinks.length) return sinks[0];
  if (entry && entry.tag) return `<${entry.tag}>`;
  return entry && entry.category ? entry.category : 'markup';
}

function groupEntriesForReact(catalog) {
  const catalogKey = `${catalog.generated_at || ''}|${catalog.entries.length}`;
  if (cachedReactGroups && cachedReactGroupsKey === catalogKey) {
    return cachedReactGroups;
  }

  const buckets = new Map();
  const entries = catalog.entries.slice().sort((left, right) => {
    const leftKey = `${left.source || ''}|${primaryGroupLabel(left)}|${left.tag || ''}|${left.number || 0}`;
    const rightKey = `${right.source || ''}|${primaryGroupLabel(right)}|${right.tag || ''}|${right.number || 0}`;
    return leftKey.localeCompare(rightKey, 'en');
  });

  for (const entry of entries) {
    const label = primaryGroupLabel(entry);
    const source = entry.source || 'catalog';
    const key = `${source}|${label}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        source,
        label,
        entries: [],
      };
      buckets.set(key, bucket);
    }
    bucket.entries.push(entry);
  }

  const groups = [];
  const sortedBuckets = Array.from(buckets.values()).sort((left, right) => {
    const sourceOrder = String(left.source || '').localeCompare(String(right.source || ''), 'en');
    if (sourceOrder !== 0) return sourceOrder;
    return String(left.label || '').localeCompare(String(right.label || ''), 'en');
  });

  for (const bucket of sortedBuckets) {
    const chunks = [];
    for (let index = 0; index < bucket.entries.length; index += reactGroupSize) {
      chunks.push(bucket.entries.slice(index, index + reactGroupSize));
    }
    chunks.forEach((chunk, chunkIndex) => {
      const number = groups.length + 1;
      const labelSlug = String(bucket.label || 'payloads')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'payloads';
      const sourceSlug = String(bucket.source || 'catalog')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'catalog';
      const suffix = chunks.length > 1 ? `-${chunkIndex + 1}` : '';
      const sinkTypes = Array.from(new Set(chunk.flatMap((entry) => Array.isArray(entry.sink_types) ? entry.sink_types : []))).sort();
      const tags = Array.from(new Set(chunk.map((entry) => entry.tag).filter(Boolean))).sort();
      groups.push({
        number,
        id: `group-${String(number).padStart(4, '0')}-${sourceSlug}-${labelSlug}${suffix}`,
        source: bucket.source,
        label: bucket.label,
        title: `${bucket.label} stored comments`,
        chunk: chunkIndex + 1,
        chunk_count: chunks.length,
        sink_types: sinkTypes,
        tags,
        entries: chunk,
      });
    });
  }

  cachedReactGroups = groups;
  cachedReactGroupsKey = catalogKey;
  return groups;
}

function resolveReactGroup(catalog, rawId) {
  const id = String(rawId || '').replace(/\.html$/i, '').trim();
  if (!id) return null;
  const groups = groupEntriesForReact(catalog);
  if (/^(?:group-)?0*\d+$/i.test(id)) {
    const number = Number(id.replace(/^(?:group-)?0*/i, '') || '0');
    return groups[number - 1] || null;
  }
  return groups.find((group) => group.id === id) || null;
}

function getFrameworkSurface(rawId) {
  return frameworkSurfaceById.get(String(rawId || '').trim().toLowerCase()) || null;
}

function defaultFrameworkSurface() {
  return frameworkSurfaceById.get('react');
}

function reactGroupHref(group, surface = defaultFrameworkSurface()) {
  return `${publicMountPath}/${surface.id}/${group.number}`;
}

function storedSinkForEntry(entry, index) {
  const sinks = [
    'dangerouslySetInnerHTML',
    'innerHTML',
    'insertAdjacentHTML',
    'rangeFragment',
    'templateClone',
    'shadowDom',
    'iframeSrcdoc',
    'profileBio',
  ];
  if (entry && entry.render_mode === 'iframe-srcdoc') return 'iframeSrcdoc';
  if (entry && entry.render_mode === 'shadow-dom') return 'shadowDom';
  return sinks[index % sinks.length];
}

function attackerName(entry, index) {
  const tag = entry && entry.tag ? entry.tag.toUpperCase() : 'HTML';
  const event = Array.isArray(entry && entry.events) && entry.events.length ? entry.events[0].replace(/^on/i, '') : 'payload';
  return `${tag} ${event} user ${index + 1}`;
}

function buildReactStoredComments(group) {
  const scenario = scenarios[(group.number - 1) % scenarios.length];
  const normalBefore = [
    {
      id: `group-${group.number}-normal-1`,
      author: scenario.before[0][0],
      role: 'member',
      content_type: 'text',
      body_text: scenario.before[0][1],
      sink: 'textContent',
      stored: true,
      created_at: '2026-09-18T17:18:00.000Z',
    },
    {
      id: `group-${group.number}-normal-2`,
      author: scenario.before[1][0],
      role: 'member',
      content_type: 'text',
      body_text: scenario.before[1][1],
      sink: 'textContent',
      stored: true,
      created_at: '2026-09-18T17:24:00.000Z',
    },
  ];
  const payloadComments = group.entries.map((entry, index) => ({
    id: `stored-${entry.number}`,
    author: attackerName(entry, index),
    role: index % 3 === 0 ? 'new account' : 'member',
    content_type: 'html',
    body_html: entry.payload,
    sink: storedSinkForEntry(entry, index),
    stored: true,
    source: 'stored-comment-api',
    created_at: new Date(Date.UTC(2026, 8, 18, 18, index, 0)).toISOString(),
    payload: {
      id: entry.id,
      number: entry.number,
      source: entry.source,
      title: entry.title,
      tag: entry.tag,
      events: entry.events || [],
      sink_types: entry.sink_types || [],
    },
  }));
  const normalAfter = [
    {
      id: `group-${group.number}-normal-3`,
      author: scenario.after[0][0],
      role: 'moderator',
      content_type: 'text',
      body_text: scenario.after[0][1],
      sink: 'textContent',
      stored: true,
      created_at: '2026-09-18T18:48:00.000Z',
    },
  ];
  return normalBefore.concat(payloadComments, normalAfter);
}

function buildLiveSeedComments(room) {
  const normalizedRoom = normalizeLiveRoom(room);
  const badImagePath = `${publicMountPath}/assets/live-missing-${normalizedRoom}.png`;
  const seedPayloads = [
    {
      id: 'seed-img-onerror',
      author: 'server cached image user',
      sink: 'innerHTML',
      body_html: `<img src="${badImagePath}" loading="eager" decoding="sync" onerror="alert('live-img-onerror')"><span>Image attachment failed to load.</span>`,
    },
    {
      id: 'seed-svg-onload',
      author: 'server svg preview user',
      sink: 'insertAdjacentHTML',
      body_html: `<svg width="160" height="34" onload="alert('live-svg-onload')" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="34" fill="#eef2f7"/><text x="8" y="22" font-size="14">inline svg preview</text></svg>`,
    },
    {
      id: 'seed-template-img-onerror',
      author: 'server template user',
      sink: 'templateClone',
      body_html: `<section><strong>Template-rendered attachment</strong><img src="${badImagePath}?template=1" onerror="alert('live-template-onerror')"></section>`,
    },
    {
      id: 'seed-shadow-img-onerror',
      author: 'server shadow user',
      sink: 'shadowDom',
      body_html: `<p>Shadow-root comment import</p><img src="${badImagePath}?shadow=1" onerror="alert('live-shadow-onerror')">`,
    },
    {
      id: 'seed-web-component',
      author: 'server custom element user',
      sink: 'webComponent',
      body_html: `<img src="${badImagePath}?component=1" onerror="alert('live-web-component-onerror')"><span>web component body</span>`,
    },
    {
      id: 'seed-shady-dom',
      author: 'server shady dom user',
      sink: 'shadyDom',
      body_html: `<img src="${badImagePath}?shady=1" onerror="alert('live-shady-onerror')"><span>distributed light DOM body</span>`,
    },
    {
      id: 'seed-iframe-srcdoc',
      author: 'server embed user',
      sink: 'iframeSrcdoc',
      body_html: `<body onload="alert('live-iframe-onload')"><img src='${badImagePath}?iframe=1' onerror="alert('live-iframe-img-onerror')">iframe stored body</body>`,
    },
    {
      id: 'seed-angular-sanitized',
      author: 'server sanitizer control',
      sink: 'angularSanitized',
      body_html: `<img src="${badImagePath}?sanitized=1" onerror="alert('sanitized-control')"><span>sanitized control copy remains visible</span>`,
    },
  ];

  const normal = [
    {
      id: `live-${normalizedRoom}-normal-1`,
      author: 'Case manager',
      role: 'staff',
      content_type: 'text',
      body_text: 'The imported thread below is fetched from the server-side stored comment feed.',
      sink: 'textContent',
      stored: true,
      source: 'server-seeded-live-fixture',
      created_at: '2026-09-20T07:00:00.000Z',
      session_id: 'server-fixture',
    },
    {
      id: `live-${normalizedRoom}-normal-2`,
      author: 'Reviewer',
      role: 'member',
      content_type: 'text',
      body_text: 'The first payload batch is already stored before the client renders the page.',
      sink: 'textContent',
      stored: true,
      source: 'server-seeded-live-fixture',
      created_at: '2026-09-20T07:01:00.000Z',
      session_id: 'server-fixture',
    },
  ];

  return normal.concat(seedPayloads.map((payload, index) => ({
    id: `live-${normalizedRoom}-${payload.id}`,
    author: payload.author,
    role: index % 2 === 0 ? 'member' : 'new account',
    content_type: 'html',
    body_html: payload.body_html,
    sink: payload.sink,
    stored: true,
    source: 'server-seeded-live-fixture',
    created_at: new Date(Date.UTC(2026, 8, 20, 7, 2 + index, 0)).toISOString(),
    session_id: 'server-fixture',
    payload: livePayloadMetadata(payload.body_html, payload.id),
  })));
}

function reactGroupSummary(group, surface = defaultFrameworkSurface()) {
  return {
    number: group.number,
    id: group.id,
    surface: {
      id: surface.id,
      label: surface.label,
      sink_label: surface.sinkLabel,
    },
    url_path: reactGroupHref(group, surface),
    source: group.source,
    label: group.label,
    title: group.title,
    chunk: group.chunk,
    chunk_count: group.chunk_count,
    payload_count: group.entries.length,
    tags: group.tags,
    sink_types: group.sink_types,
    first_payload_number: group.entries[0] ? group.entries[0].number : null,
    last_payload_number: group.entries[group.entries.length - 1] ? group.entries[group.entries.length - 1].number : null,
  };
}

function renderIndex(req, catalog, allEntries = false) {
  const filtered = filterEntries(catalog, req.query || {});
  const page = Math.max(1, Number(req.query.page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = allEntries ? 0 : (currentPage - 1) * pageSize;
  const end = allEntries ? filtered.length : start + pageSize;
  const visible = filtered.slice(start, end);
  const query = new URLSearchParams();
  for (const key of ['source', 'mode', 'q']) {
    if (req.query[key]) query.set(key, req.query[key]);
  }
  const queryPrefix = query.toString() ? `?${query.toString()}&` : '?';
  const source = String(req.query.source || '').trim().toLowerCase();
  const mode = String(req.query.mode || '').trim().toLowerCase();
  const q = String(req.query.q || '').trim();
  const title = allEntries ? 'All XSS Test Pages' : 'XSS Test Pages';
  const sources = Array.isArray(catalog.sources) ? catalog.sources : [];
  const sourceSummary = sources.map((item) => {
    const lastUpdated = item.last_updated ? `, last updated ${escapeHtml(item.last_updated)}` : '';
    return `<li>${escapeHtml(item.name || item.url || 'source')}: ${escapeHtml(item.unique_payload_count || 0)} unique payloads${lastUpdated}</li>`;
  }).join('');
  const rows = visible.map((entry) => `
    <tr>
      <td class="num"><a href="${pageHref(entry)}">${escapeHtml(entry.number)}</a></td>
      <td><a href="${pageHref(entry)}">${escapeHtml(entry.title || entry.id)}</a><span>${escapeHtml(entry.category || '')}</span></td>
      <td>${escapeHtml(entry.source || '')}</td>
      <td>${escapeHtml(entry.render_mode || '')}</td>
      <td>${escapeHtml(compactText(entry.payload, 160))}</td>
    </tr>`).join('');
  const prevLink = currentPage > 1
    ? `<a class="button" href="${publicMountPath}/${queryPrefix}page=${currentPage - 1}">Previous</a>`
    : '<span class="button disabled">Previous</span>';
  const nextLink = currentPage < totalPages
    ? `<a class="button" href="${publicMountPath}/${queryPrefix}page=${currentPage + 1}">Next</a>`
    : '<span class="button disabled">Next</span>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#18212f; --muted:#667085; --line:#d7dde8; --soft:#f5f7fb; --accent:#0f766e; --warn:#b45309; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#f8fafc; }
    header { background:#ffffff; border-bottom:1px solid var(--line); }
    .wrap { max-width:1180px; margin:0 auto; padding:24px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    p { margin:0 0 14px; color:var(--muted); line-height:1.45; }
    .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:18px; }
    .stat { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .stat strong { display:block; font-size:22px; color:var(--ink); }
    .source-list { margin:16px 0 0; padding-left:20px; color:var(--muted); }
    form { display:grid; grid-template-columns:minmax(180px,1fr) minmax(180px,1fr) minmax(240px,2fr) auto; gap:10px; margin:20px 0; }
    input, select, button, .button { border:1px solid var(--line); border-radius:6px; background:#fff; color:var(--ink); padding:9px 11px; font:inherit; min-height:38px; }
    button, .button { display:inline-flex; align-items:center; justify-content:center; text-decoration:none; background:#0f766e; border-color:#0f766e; color:#fff; cursor:pointer; }
    .button.secondary { background:#fff; color:#0f766e; }
    .button.disabled { opacity:.45; pointer-events:none; background:#e5e7eb; border-color:#e5e7eb; color:#475467; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:14px; }
    th { background:#edf2f7; font-size:12px; text-transform:uppercase; color:#475467; letter-spacing:.04em; }
    td span { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
    td.num { width:72px; font-weight:700; }
    td:last-child { font-family:Consolas, Monaco, monospace; font-size:12px; color:#334155; word-break:break-word; }
    .pager { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:14px; color:var(--muted); }
    @media (max-width:760px) {
      .wrap { padding:18px; }
      .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
      form { grid-template-columns:1fr; }
      table { display:block; overflow:auto; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>${escapeHtml(title)}</h1>
      <p>Each endpoint renders one payload inside a realistic user-generated comment or review surface. Use <code>?auto=0</code> to disable synthetic event triggering and <code>?delay=500</code> to control dynamic hydration timing.</p>
      <div class="stats">
        <div class="stat"><strong>${escapeHtml(catalog.counts && catalog.counts.total || catalog.entries.length)}</strong>Total URLs</div>
        <div class="stat"><strong>${escapeHtml((catalog.counts && catalog.counts.by_source && catalog.counts.by_source.portswigger) || 0)}</strong>PortSwigger</div>
        <div class="stat"><strong>${escapeHtml((catalog.counts && catalog.counts.by_source && catalog.counts.by_source['payloads-html']) || 0)}</strong>Local file</div>
        <div class="stat"><strong>${escapeHtml(Object.keys((catalog.counts && catalog.counts.by_render_mode) || {}).length)}</strong>Render modes</div>
      </div>
      ${sourceSummary ? `<ul class="source-list">${sourceSummary}</ul>` : ''}
    </div>
  </header>
  <main class="wrap">
    <form action="${publicMountPath}" method="get">
      <select name="source">${renderSourceOptions(catalog, source)}</select>
      <select name="mode">${renderModeOptions(catalog, mode)}</select>
      <input name="q" value="${escapeAttribute(q)}" placeholder="Search title, tag, event, payload">
      <button type="submit">Filter</button>
    </form>
    <div class="actions">
      <a class="button secondary" href="${publicMountPath}/urls.csv">Download URL CSV</a>
      <a class="button secondary" href="${publicMountPath}/catalog.json">Open catalog JSON</a>
      <a class="button secondary" href="${publicMountPath}/all">Show all links</a>
      <a class="button secondary" href="${publicMountPath}/live">Live stored feed</a>
      <a class="button secondary" href="${publicMountPath}/react">Dynamic grouped comment apps</a>
    </div>
    <table>
      <thead><tr><th>#</th><th>Vector</th><th>Source</th><th>Render</th><th>Payload Preview</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No payloads match the current filters.</td></tr>'}</tbody>
    </table>
    <div class="pager">
      <div>${escapeHtml(filtered.length)} matching payloads${allEntries ? '' : `, page ${currentPage} of ${totalPages}`}</div>
      ${allEntries ? `<a class="button secondary" href="${publicMountPath}">Back to paged index</a>` : `<div>${prevLink}${nextLink}</div>`}
    </div>
  </main>
</body>
</html>`;
}

function getScenario(entry) {
  return scenarios[(Math.max(1, Number(entry.number) || 1) - 1) % scenarios.length];
}

function initials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';
}

function renderComment(name, text, index) {
  return `<article class="comment">
    <div class="avatar tone-${index % 5}">${escapeHtml(initials(name))}</div>
    <div class="comment-panel">
      <div class="comment-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(index + 2)}h ago</span></div>
      <div class="comment-body">${escapeHtml(text)}</div>
    </div>
  </article>`;
}

function isPageBreakingPayload(payload) {
  return /<\s*(plaintext|xmp|textarea|title|style|noscript|noembed|noframes)\b/i.test(String(payload || ''));
}

function effectiveRenderMode(entry) {
  const mode = String(entry.render_mode || 'csr-innerHTML');
  if (mode === 'static-ssr' && isPageBreakingPayload(entry.payload)) {
    return 'csr-innerHTML';
  }
  return mode;
}

function renderCaptureHarness() {
  return `<script>
(function () {
  var events = [];
  function record(type, detail) {
    var item = {
      type: type,
      detail: String(detail == null ? '' : detail).slice(0, 400),
      at: new Date().toISOString()
    };
    events.push(item);
    window.__xssTestLastEvent = item;
    var log = document.getElementById('xss-event-log');
    if (log) {
      log.textContent = events.slice(-6).map(function (entry) {
        return entry.at.split('T')[1].replace('Z', '') + ' ' + entry.type + ' ' + entry.detail;
      }).join('\\n');
    }
  }
  window.__xssTestEvents = events;
  window.__xssTestRecord = record;
  ['alert', 'confirm', 'prompt', 'print', 'open'].forEach(function (name) {
    var original = window[name];
    window['__xssOriginal_' + name] = original;
    window[name] = function () {
      record(name, Array.prototype.slice.call(arguments).join(' '));
      return name === 'confirm' ? true : null;
    };
  });
  if (navigator && typeof navigator.sendBeacon === 'function') {
    navigator.__xssOriginalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url) {
      record('sendBeacon', url);
      return true;
    };
  }
  if (typeof window.fetch === 'function') {
    window.__xssOriginalFetch = window.fetch;
    window.fetch = function (url) {
      var target = typeof url === 'string' ? url : (url && url.url);
      record('fetch', target);
      try {
        if (new URL(target, window.location.href).origin === window.location.origin) {
          return window.__xssOriginalFetch.apply(window, arguments);
        }
      } catch (_) {}
      return Promise.resolve(new Response('', { status: 204 }));
    };
  }
  window.addEventListener('error', function (event) {
    record('error', event.message || 'script error');
  });
  function eventForAttribute(attributeName) {
    return String(attributeName || '').replace(/^on/i, '').replace(/\\(.+\\)$/, '');
  }
  function makeEvent(name) {
    var options = { bubbles: true, cancelable: true, composed: true };
    try {
      if (/^(click|dblclick|mouse|contextmenu|auxclick|drag|drop)/i.test(name)) return new MouseEvent(name, options);
      if (/^pointer/i.test(name) && typeof PointerEvent === 'function') return new PointerEvent(name, options);
      if (/^key/i.test(name)) return new KeyboardEvent(name, Object.assign({ key: 'Enter' }, options));
      if (/^(copy|cut|paste)/i.test(name) && typeof ClipboardEvent === 'function') return new ClipboardEvent(name, options);
      if (/^beforeinput$/i.test(name) && typeof InputEvent === 'function') return new InputEvent(name, Object.assign({ data: 'x' }, options));
      return new Event(name, options);
    } catch (_) {
      return new Event(name, options);
    }
  }
  function dispatchSafe(target, name) {
    if (!target || !name) return;
    try {
      target.dispatchEvent(makeEvent(name));
    } catch (error) {
      record('dispatch-error', name + ': ' + (error && error.message ? error.message : error));
    }
  }
  window.__domKeeperArmPayloads = function (root) {
    var scope = root || document;
    var nodes = [];
    if (scope.nodeType === 1) nodes.push(scope);
    if (scope.querySelectorAll) {
      nodes = nodes.concat(Array.prototype.slice.call(scope.querySelectorAll('*')));
    }
    window.setTimeout(function () {
      nodes.forEach(function (node) {
        if (!node.getAttributeNames) return;
        node.getAttributeNames().forEach(function (attributeName) {
          if (/^on/i.test(attributeName)) dispatchSafe(node, eventForAttribute(attributeName));
        });
        if (node.autofocus && typeof node.focus === 'function') {
          try { node.focus(); } catch (_) {}
        }
        if (node.hasAttribute && node.hasAttribute('href') && /^javascript:/i.test(node.getAttribute('href') || '')) {
          dispatchSafe(node, 'click');
        }
        if (node.scrollHeight && node.clientHeight && node.scrollHeight > node.clientHeight) {
          try { node.scrollTop = node.scrollHeight; } catch (_) {}
          dispatchSafe(node, 'scroll');
          dispatchSafe(node, 'scrollend');
        }
      });
      ['hashchange', 'popstate', 'pageshow', 'pagehide', 'beforeprint', 'afterprint', 'message'].forEach(function (name) {
        dispatchSafe(window, name);
      });
      record('armed', nodes.length + ' nodes');
    }, 80);
  };
}());
</script>`;
}

function renderIframeDocument(payload) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><script>
window.alert=function(v){parent.postMessage({type:'xss-test-alert',detail:String(v)},'*')};
window.print=function(){parent.postMessage({type:'xss-test-print',detail:'print'},'*')};
navigator.sendBeacon=function(url){parent.postMessage({type:'xss-test-beacon',detail:String(url)},'*');return true};
</script></head><body><main class="embedded-comment">${payload}</main><script>
setTimeout(function(){document.querySelectorAll('*').forEach(function(node){if(!node.getAttributeNames)return;node.getAttributeNames().forEach(function(attr){if(/^on/i.test(attr)){try{node.dispatchEvent(new Event(attr.slice(2),{bubbles:true,cancelable:true}))}catch(_){}}})})},80);
</script></body></html>`;
}

function renderHydrationScript(entry, mode) {
  const payload = entry.payload || '';
  const delayBase = 120 + ((Number(entry.number) || 1) % 5) * 80;
  return `<script>
(function () {
  var payload = ${safeJson(payload)};
  var mode = ${safeJson(mode)};
  var requestedDelay = Number(new URLSearchParams(window.location.search).get('delay'));
  var delay = Number.isFinite(requestedDelay) && requestedDelay >= 0 ? requestedDelay : ${delayBase};
  var auto = new URLSearchParams(window.location.search).get('auto') !== '0';
  function arm(root) {
    if (auto && window.__domKeeperArmPayloads) window.__domKeeperArmPayloads(root);
  }
  function hydrate() {
    var slot = document.getElementById('xss-payload-slot');
    if (!slot) return;
    slot.removeAttribute('data-pending');
    if (mode === 'csr-insertAdjacentHTML') {
      slot.textContent = '';
      slot.insertAdjacentHTML('beforeend', payload);
      arm(slot);
      return;
    }
    if (mode === 'csr-range-fragment') {
      slot.textContent = '';
      var range = document.createRange();
      range.selectNode(slot);
      slot.appendChild(range.createContextualFragment(payload));
      arm(slot);
      return;
    }
    if (mode === 'csr-template-clone') {
      var template = document.createElement('template');
      template.innerHTML = '<div class="ugc-fragment">' + payload + '</div>';
      slot.replaceChildren(template.content.cloneNode(true));
      arm(slot);
      return;
    }
    if (mode === 'spa-route-hydration') {
      var state = {
        comments: [
          { author: 'Followup', html: payload },
          { author: 'Moderator', html: 'Queued for review by the site team.' }
        ]
      };
      if (!window.location.hash) {
        window.history.replaceState({ panel: 'comments' }, '', window.location.pathname + window.location.search + '#comments');
      }
      slot.innerHTML = state.comments.map(function (comment) {
        return '<section class="spa-reply"><b>' + comment.author + '</b><div>' + comment.html + '</div></section>';
      }).join('');
      arm(slot);
      return;
    }
    if (mode === 'shadow-dom') {
      slot.textContent = '';
      var host = document.createElement('div');
      host.className = 'shadow-comment-host';
      slot.appendChild(host);
      var shadow = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = '.shadow-body{font:14px Arial,sans-serif;color:#18212f}.shadow-label{font-size:12px;color:#667085;margin-bottom:6px}';
      var body = document.createElement('div');
      body.className = 'shadow-body';
      body.innerHTML = payload;
      shadow.appendChild(style);
      shadow.appendChild(body);
      arm(shadow);
      return;
    }
    if (mode === 'iframe-srcdoc') {
      slot.textContent = '';
      var frame = document.createElement('iframe');
      frame.className = 'comment-frame';
      frame.title = 'Embedded comment attachment';
      frame.srcdoc = ${safeJson(renderIframeDocument(payload))};
      slot.appendChild(frame);
      window.addEventListener('message', function (event) {
        if (event && event.data && /^xss-test/.test(event.data.type || '') && window.__xssTestRecord) {
          window.__xssTestRecord(event.data.type, event.data.detail);
        }
      });
      return;
    }
    slot.innerHTML = payload;
    arm(slot);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(hydrate, delay); });
  } else {
    window.setTimeout(hydrate, delay);
  }
}());
</script>`;
}

function renderStaticArmScript() {
  return `<script>
(function () {
  function arm() {
    var auto = new URLSearchParams(window.location.search).get('auto') !== '0';
    var slot = document.getElementById('xss-payload-slot');
    if (auto && slot && window.__domKeeperArmPayloads) window.__domKeeperArmPayloads(slot);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
}());
</script>`;
}

function renderPayloadComment(entry) {
  const mode = effectiveRenderMode(entry);
  const isStatic = mode === 'static-ssr';
  const pending = isStatic ? '' : ' data-pending="true"';
  const payloadSlot = isStatic
    ? `<div id="xss-payload-slot" class="comment-body ugc-content" data-xss-render-mode="${escapeAttribute(mode)}">${entry.payload}</div>${renderStaticArmScript()}`
    : `<div id="xss-payload-slot" class="comment-body ugc-content" data-xss-render-mode="${escapeAttribute(mode)}"${pending}>Opening thread update...</div>${renderHydrationScript(entry, mode)}`;
  return `<article class="comment payload-comment" data-xss-test-payload-id="${escapeAttribute(entry.id)}" data-xss-test-number="${escapeAttribute(entry.number)}" data-xss-source="${escapeAttribute(entry.source)}">
    <div class="avatar tone-x">UG</div>
    <div class="comment-panel">
      <div class="comment-meta"><strong>${escapeHtml(payloadAuthor(entry))}</strong><span>${escapeHtml(mode)}</span></div>
      ${payloadSlot}
    </div>
  </article>`;
}

function payloadAuthor(entry) {
  const tag = entry.tag ? `<${entry.tag}>` : 'markup';
  const event = Array.isArray(entry.events) && entry.events.length ? entry.events[0] : (entry.sink_types && entry.sink_types[0]) || 'payload';
  return `${tag} ${event}`;
}

function renderTestPage(req, entry) {
  const scenario = getScenario(entry);
  const mode = effectiveRenderMode(entry);
  const canonical = `${getBaseUrl(req)}/${entry.number}`;
  const before = scenario.before.map((comment, index) => renderComment(comment[0], comment[1], index)).join('');
  const after = scenario.after.map((comment, index) => renderComment(comment[0], comment[1], index + scenario.before.length + 1)).join('');
  const body = scenario.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const related = scenarios
    .filter((item) => item.kind !== scenario.kind)
    .slice(0, 4)
    .map((item, index) => `<li><a href="${publicMountPath}/${(((entry.number + index + 11) - 1) % Math.max(1, loadCatalog().entries.length)) + 1}">${escapeHtml(item.title)}</a></li>`)
    .join('');
  const sinkLabels = (entry.sink_types || []).map((sink) => `<span>${escapeHtml(sink)}</span>`).join('');
  const eventLabels = (entry.events || []).map((event) => `<span>${escapeHtml(event)}</span>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <title>${escapeHtml(scenario.title)}</title>
  ${renderCaptureHarness()}
  <style>
    :root { color-scheme: light; --ink:#172033; --muted:#667085; --line:#d5dbe6; --paper:#fff; --soft:#f5f7fb; --accent:#0f766e; --accent2:#7c3aed; --warm:#b45309; --blue:#1d4ed8; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#f7f8fb; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .sitebar { background:#101828; color:#fff; border-bottom:4px solid var(--accent); }
    .sitebar-inner { max-width:1120px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:14px 20px; }
    .brand { font-weight:800; font-size:18px; letter-spacing:0; }
    nav { display:flex; gap:14px; flex-wrap:wrap; font-size:14px; }
    nav a { color:#e5e7eb; }
    .layout { max-width:1120px; margin:0 auto; padding:26px 20px 42px; display:grid; grid-template-columns:minmax(0, 1fr) 300px; gap:24px; align-items:start; }
    main, aside { min-width:0; }
    .article-shell { background:var(--paper); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .article-top { padding:26px 28px 18px; border-bottom:1px solid var(--line); background:linear-gradient(135deg,#ffffff,#f3f7fa 70%,#eef8f6); }
    .section { color:var(--accent); font-weight:800; text-transform:uppercase; font-size:12px; letter-spacing:.08em; }
    h1 { margin:8px 0 10px; font-size:34px; line-height:1.08; letter-spacing:0; }
    .dek { color:#4b5565; font-size:17px; line-height:1.45; max-width:760px; }
    .byline { margin-top:16px; display:flex; gap:10px; align-items:center; color:var(--muted); font-size:14px; }
    .article-body { padding:24px 28px 8px; }
    .article-body p { margin:0 0 16px; line-height:1.65; color:#263244; }
    .meta-strip { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; padding:0 28px 24px; }
    .meta-strip div { background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:10px; font-size:13px; color:#475467; }
    .comments { margin-top:18px; background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:22px; }
    .comments h2 { margin:0 0 16px; font-size:22px; letter-spacing:0; }
    .comment { display:grid; grid-template-columns:44px minmax(0,1fr); gap:12px; margin-bottom:14px; }
    .avatar { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:13px; flex:0 0 auto; }
    .tone-0 { background:#0f766e; } .tone-1 { background:#7c3aed; } .tone-2 { background:#b45309; } .tone-3 { background:#1d4ed8; } .tone-4 { background:#be123c; } .tone-x { background:#111827; }
    .comment-panel { min-width:0; border:1px solid var(--line); border-radius:8px; padding:12px 14px; background:#fff; }
    .comment-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--muted); font-size:13px; margin-bottom:7px; }
    .comment-meta strong { color:#1f2937; font-size:14px; }
    .comment-body { color:#263244; line-height:1.5; word-break:break-word; overflow-wrap:anywhere; }
    .payload-comment .comment-panel { border-color:#a7b2c3; background:#fffdfa; }
    .ugc-content[data-pending] { color:#667085; font-style:italic; }
    .spa-reply { border-top:1px solid #e4e7ec; padding-top:8px; margin-top:8px; }
    .shadow-comment-host { border:1px dashed #98a2b3; border-radius:6px; padding:10px; background:#f8fafc; }
    .comment-frame { width:100%; min-height:130px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }
    aside { display:grid; gap:14px; }
    .sidebox { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    .sidebox h3 { margin:0 0 10px; font-size:15px; letter-spacing:0; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; }
    .chips span { display:inline-flex; border:1px solid #cbd5e1; background:#f8fafc; border-radius:999px; padding:4px 8px; font-size:12px; color:#475467; }
    .sidebox ul { margin:0; padding-left:18px; color:#475467; }
    .sidebox li { margin-bottom:8px; font-size:14px; line-height:1.35; }
    .event-log { white-space:pre-wrap; min-height:72px; max-height:180px; overflow:auto; font:12px Consolas, Monaco, monospace; background:#0b1220; color:#d1fae5; border-radius:6px; padding:10px; }
    .test-links { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .test-links a { display:inline-flex; align-items:center; min-height:34px; padding:7px 10px; border-radius:6px; border:1px solid var(--line); background:#fff; font-size:13px; }
    @media (max-width:860px) {
      .layout { grid-template-columns:1fr; padding:18px 14px 32px; }
      .sitebar-inner { padding:12px 14px; align-items:flex-start; flex-direction:column; }
      .article-top, .article-body { padding-left:18px; padding-right:18px; }
      h1 { font-size:28px; }
      .meta-strip { grid-template-columns:1fr; padding-left:18px; padding-right:18px; }
      .comments { padding:16px; }
    }
  </style>
</head>
<body class="scenario-${escapeAttribute(scenario.kind)}" data-xss-test-page="${escapeAttribute(entry.number)}" data-xss-render-mode="${escapeAttribute(mode)}">
  <header class="sitebar">
    <div class="sitebar-inner">
      <div class="brand">${escapeHtml(scenario.site)}</div>
      <nav aria-label="Section navigation">
        <a href="${publicMountPath}">Index</a>
        <a href="${publicMountPath}/urls.csv">URL CSV</a>
        <a href="${publicMountPath}/${Math.max(1, entry.number - 1)}">Previous</a>
        <a href="${publicMountPath}/${entry.number + 1}">Next</a>
      </nav>
    </div>
  </header>
  <div class="layout">
    <main>
      <article class="article-shell">
        <div class="article-top">
          <div class="section">${escapeHtml(scenario.section)}</div>
          <h1>${escapeHtml(scenario.title)}</h1>
          <p class="dek">${escapeHtml(scenario.dek)}</p>
          <div class="byline"><span>By ${escapeHtml(scenario.author)}</span><span>Updated this week</span></div>
        </div>
        <div class="article-body">${body}</div>
        <div class="meta-strip">
          <div><strong>${escapeHtml(entry.source)}</strong><br>Payload source</div>
          <div><strong>${escapeHtml(entry.tag || 'mixed')}</strong><br>Primary tag</div>
          <div><strong>${escapeHtml(mode)}</strong><br>Rendering path</div>
        </div>
      </article>
      <section class="comments" aria-label="${escapeAttribute(scenario.commentsTitle)}">
        <h2>${escapeHtml(scenario.commentsTitle)}</h2>
        ${before}
        ${renderPayloadComment(entry)}
        ${after}
      </section>
    </main>
    <aside>
      <section class="sidebox">
        <h3>Payload Metadata</h3>
        <div class="chips">
          <span>#${escapeHtml(entry.number)}</span>
          <span>${escapeHtml(entry.source)}</span>
          <span>${escapeHtml(entry.category || 'uncategorized')}</span>
          ${eventLabels}
          ${sinkLabels}
        </div>
        <div class="test-links">
          <a href="${publicMountPath}/${escapeAttribute(entry.id)}">ID URL</a>
          <a href="${publicMountPath}/${entry.number}/payload.json">JSON</a>
          <a href="${publicMountPath}/${entry.number}?auto=0">No auto trigger</a>
        </div>
      </section>
      <section class="sidebox">
        <h3>Captured Events</h3>
        <div id="xss-event-log" class="event-log">Waiting for payload activity...</div>
      </section>
      <section class="sidebox">
        <h3>Related Pages</h3>
        <ul>${related}</ul>
      </section>
    </aside>
  </div>
</body>
</html>`;
}

function renderFrameworkIndex(req, catalog, surface = defaultFrameworkSurface()) {
  const groups = groupEntriesForReact(catalog);
  const page = Math.max(1, Number(req.query.page) || 1);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = groups.slice(start, start + pageSize);
  const rows = visible.map((group) => `
    <tr>
      <td class="num"><a href="${reactGroupHref(group, surface)}">${escapeHtml(group.number)}</a></td>
      <td><a href="${reactGroupHref(group, surface)}">${escapeHtml(group.title)}</a><span>${escapeHtml(surface.label)} · ${escapeHtml(group.source)} · chunk ${escapeHtml(group.chunk)} of ${escapeHtml(group.chunk_count)}</span></td>
      <td>${escapeHtml(group.entries.length)}</td>
      <td>${escapeHtml(group.tags.slice(0, 8).join(', ') || 'mixed')}</td>
      <td>${escapeHtml(group.sink_types.join(', ') || 'inline html')}</td>
    </tr>`).join('');
  const prevLink = currentPage > 1
    ? `<a class="button" href="${publicMountPath}/${surface.id}?page=${currentPage - 1}">Previous</a>`
    : '<span class="button disabled">Previous</span>';
  const nextLink = currentPage < totalPages
    ? `<a class="button" href="${publicMountPath}/${surface.id}?page=${currentPage + 1}">Next</a>`
    : '<span class="button disabled">Next</span>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(surface.label)} Stored-XSS Comment Apps</title>
  <style>
    :root { color-scheme:light; --ink:#18212f; --muted:#667085; --line:#d7dde8; --soft:#f5f7fb; --accent:#0f766e; --blue:#1d4ed8; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#f8fafc; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .wrap { max-width:1180px; margin:0 auto; padding:24px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    p { margin:0 0 14px; color:var(--muted); line-height:1.45; }
    .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:18px; }
    .stat { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .stat strong { display:block; font-size:22px; color:var(--ink); }
    .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:18px 0; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:38px; border:1px solid var(--accent); border-radius:6px; padding:8px 11px; background:var(--accent); color:#fff; text-decoration:none; font:inherit; }
    .button.secondary { background:#fff; color:var(--accent); }
    .button.disabled { opacity:.45; pointer-events:none; background:#e5e7eb; border-color:#e5e7eb; color:#475467; }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:14px; }
    th { background:#edf2f7; font-size:12px; text-transform:uppercase; color:#475467; letter-spacing:.04em; }
    td span { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
    td.num { width:72px; font-weight:700; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .pager { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:14px; color:var(--muted); }
    @media (max-width:760px) {
      .wrap { padding:18px; }
      .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
      table { display:block; overflow:auto; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>${escapeHtml(surface.label)} Stored-XSS Comment Apps</h1>
      <p>${escapeHtml(surface.description)} Sink model: <code>${escapeHtml(surface.sinkLabel)}</code>.</p>
      <div class="stats">
        <div class="stat"><strong>${escapeHtml(groups.length)}</strong>Grouped app pages</div>
        <div class="stat"><strong>${escapeHtml(catalog.entries.length)}</strong>Payload comments</div>
        <div class="stat"><strong>${escapeHtml(reactGroupSize)}</strong>Max payloads per app</div>
        <div class="stat"><strong>${escapeHtml(surface.id)}</strong>URL family</div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <div class="actions">
      <a class="button secondary" href="${publicMountPath}">Single-payload pages</a>
      <a class="button secondary" href="${publicMountPath}/live">Live stored feed</a>
      <a class="button secondary" href="${publicMountPath}/frameworks">Framework families</a>
      <a class="button secondary" href="${publicMountPath}/${surface.id}/groups.json">Groups JSON</a>
      <a class="button secondary" href="${publicMountPath}/${surface.id}/urls.csv">Download grouped URL CSV</a>
    </div>
    <table>
      <thead><tr><th>#</th><th>App Group</th><th>Payloads</th><th>Tags</th><th>Sink Types</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pager">
      <div>${escapeHtml(groups.length)} groups, page ${escapeHtml(currentPage)} of ${escapeHtml(totalPages)}</div>
      <div>${prevLink}${nextLink}</div>
    </div>
  </main>
</body>
</html>`;
}

function renderFrameworkFamiliesIndex(req, catalog) {
  const groups = groupEntriesForReact(catalog);
  const rows = frameworkSurfaces.map((surface) => `
    <tr>
      <td><a href="${publicMountPath}/${surface.id}">${escapeHtml(surface.label)}</a><span>${escapeHtml(surface.description)}</span></td>
      <td>${escapeHtml(surface.id)}</td>
      <td>${escapeHtml(surface.sinkLabel)}</td>
      <td>${escapeHtml(groups.length)}</td>
      <td><a href="${publicMountPath}/${surface.id}/urls.csv">CSV</a> · <a href="${publicMountPath}/${surface.id}/groups.json">JSON</a></td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Stored-XSS Framework Families</title>
  <style>
    :root { color-scheme:light; --ink:#18212f; --muted:#667085; --line:#d7dde8; --soft:#f5f7fb; --accent:#0f766e; --blue:#1d4ed8; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#f8fafc; }
    .wrap { max-width:1180px; margin:0 auto; padding:24px; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    p { margin:0 0 14px; color:var(--muted); line-height:1.45; }
    .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:18px; }
    .stat { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .stat strong { display:block; font-size:22px; color:var(--ink); }
    table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:8px; overflow:hidden; margin-top:20px; }
    th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:14px; }
    th { background:#edf2f7; font-size:12px; text-transform:uppercase; color:#475467; letter-spacing:.04em; }
    td span { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    @media (max-width:760px) { .wrap { padding:18px; } .stats { grid-template-columns:repeat(2,minmax(0,1fr)); } table { display:block; overflow:auto; } }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>Stored-XSS Framework Families</h1>
      <p>Each family uses the same grouped stored-comment fixtures with a different rendering model and URL prefix.</p>
      <div class="stats">
        <div class="stat"><strong>${escapeHtml(frameworkSurfaces.length)}</strong>Framework families</div>
        <div class="stat"><strong>${escapeHtml(groups.length)}</strong>Groups per family</div>
        <div class="stat"><strong>${escapeHtml(groups.length * frameworkSurfaces.length)}</strong>Total grouped app pages</div>
        <div class="stat"><strong>${escapeHtml(catalog.entries.length)}</strong>Payload comments per family</div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <p><a href="${publicMountPath}">Single-payload index</a> · <a href="${publicMountPath}/live">Live stored feed</a> · <a href="${publicMountPath}/react">React family</a></p>
    <table>
      <thead><tr><th>Family</th><th>URL Prefix</th><th>Sink Model</th><th>Pages</th><th>Exports</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

function renderReactAppScript(config) {
  return `<script>
(function () {
  var config = ${safeJson(config)};
  var surface = config.surface || { id: 'react', label: 'React', sinkLabel: 'dangerouslySetInnerHTML' };
  var state = { comments: [], payloadComments: [], selectedPayloadIndex: 0 };
  var auto = new URLSearchParams(window.location.search).get('auto') !== '0';
  var delayParam = Number(new URLSearchParams(window.location.search).get('delay'));
  var delay = Number.isFinite(delayParam) && delayParam >= 0 ? delayParam : 350;

  function $(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value); }
  function initial(name) {
    return text(name).split(/\\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'U';
  }
  function setStatus(value) {
    var node = $('app-status');
    if (node) node.textContent = value;
  }
  function arm(root) {
    if (auto && window.__domKeeperArmPayloads) window.__domKeeperArmPayloads(root);
  }
  function iframeDoc(html) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><base target="_top"></head><body><main class="stored-comment">' + html + '</main></body></html>';
  }
  function sanitizeAngularHtml(html) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    Array.prototype.slice.call(template.content.querySelectorAll('script, iframe, object, embed, applet, meta, base, link')).forEach(function (node) {
      node.remove();
    });
    Array.prototype.slice.call(template.content.querySelectorAll('*')).forEach(function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attribute) {
        if (/^on/i.test(attribute.name) || /javascript:/i.test(attribute.value || '') || attribute.name === 'srcdoc') {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }
  function defineStoredCommentElement() {
    if (window.customElements && !window.customElements.get('stored-xss-comment')) {
      window.customElements.define('stored-xss-comment', class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot || surface.id === 'shady-dom') return;
          var shadow = this.attachShadow({ mode: 'open' });
          var style = document.createElement('style');
          style.textContent = ':host{display:block}.body{font:14px Arial,sans-serif;color:#18212f}.body *{max-width:100%}';
          var body = document.createElement('div');
          body.className = 'body';
          body.innerHTML = this.getAttribute('payload-html') || '';
          shadow.appendChild(style);
          shadow.appendChild(body);
          arm(shadow);
        }
      });
    }
  }
  function renderUnsafe(target, comment) {
    var html = text(comment.body_html);
    var sink = comment.sink || 'innerHTML';
    if (surface.id === 'react') sink = sink === 'innerHTML' ? 'dangerouslySetInnerHTML' : sink;
    if (surface.id === 'vue') sink = 'v-html';
    if (surface.id === 'svelte') sink = 'svelte-html';
    if (surface.id === 'lit') sink = 'lit-unsafeHTML';
    if (surface.id === 'angular-trusted') sink = 'angular-trusted-html';
    if (surface.id === 'angular-sanitized') sink = 'angular-sanitized-html';
    if (surface.id === 'server-components') target.setAttribute('data-rsc-hydration', 'client-island');
    target.setAttribute('data-comment-sink', sink);
    target.setAttribute('data-framework-surface', surface.id);
    if (comment.content_type === 'text') {
      target.textContent = text(comment.body_text);
      return;
    }
    if (surface.id === 'angular-sanitized') {
      target.innerHTML = sanitizeAngularHtml(html);
      arm(target);
      return;
    }
    if (surface.id === 'web-components') {
      defineStoredCommentElement();
      target.textContent = '';
      var custom = document.createElement('stored-xss-comment');
      custom.setAttribute('payload-html', html);
      target.appendChild(custom);
      return;
    }
    if (surface.id === 'shady-dom') {
      window.ShadyDOM = window.ShadyDOM || { inUse: true, handlesDynamicScoping: true };
      target.textContent = '';
      var host = document.createElement('stored-xss-comment');
      host.setAttribute('data-shady-host', '');
      var distributed = document.createElement('div');
      distributed.className = 'shady-distributed-comment';
      distributed.setAttribute('data-shady-root', '');
      distributed.innerHTML = html;
      host.appendChild(distributed);
      target.appendChild(host);
      arm(host);
      return;
    }
    if (sink === 'insertAdjacentHTML') {
      target.textContent = '';
      target.insertAdjacentHTML('beforeend', html);
      arm(target);
      return;
    }
    if (sink === 'rangeFragment') {
      target.textContent = '';
      var range = document.createRange();
      range.selectNode(target);
      target.appendChild(range.createContextualFragment(html));
      arm(target);
      return;
    }
    if (sink === 'templateClone') {
      var template = document.createElement('template');
      template.innerHTML = '<div class="stored-template-body">' + html + '</div>';
      target.replaceChildren(template.content.cloneNode(true));
      arm(target);
      return;
    }
    if (sink === 'shadowDom') {
      target.textContent = '';
      var host = document.createElement('div');
      host.className = 'comment-shadow-host';
      target.appendChild(host);
      var shadow = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = '.shadow-comment{font:14px Arial,sans-serif;color:#18212f}.shadow-comment *{max-width:100%}';
      var body = document.createElement('div');
      body.className = 'shadow-comment';
      body.innerHTML = html;
      shadow.appendChild(style);
      shadow.appendChild(body);
      arm(shadow);
      return;
    }
    if (sink === 'iframeSrcdoc') {
      target.textContent = '';
      var frame = document.createElement('iframe');
      frame.className = 'stored-comment-frame';
      frame.title = 'Stored comment attachment';
      frame.srcdoc = iframeDoc(html);
      target.appendChild(frame);
      return;
    }
    if (sink === 'profileBio') {
      target.innerHTML = '<section class="profile-bio"><b>Imported profile bio</b><div>' + html + '</div></section>';
      arm(target);
      return;
    }
    target.innerHTML = html;
    arm(target);
  }
  function renderComments() {
    var root = $('comment-feed');
    if (!root) return;
    root.textContent = '';
    state.comments.forEach(function (comment, index) {
      var article = document.createElement('article');
      article.className = 'comment-card' + (comment.content_type === 'html' ? ' attack-comment' : '');
      article.setAttribute('data-stored-comment-id', comment.id || '');
      if (comment.payload && comment.payload.id) article.setAttribute('data-payload-id', comment.payload.id);
      var avatar = document.createElement('div');
      avatar.className = 'avatar tone-' + (index % 6);
      avatar.textContent = initial(comment.author);
      var panel = document.createElement('div');
      panel.className = 'comment-panel';
      var meta = document.createElement('div');
      meta.className = 'comment-meta';
      var author = document.createElement('strong');
      author.textContent = text(comment.author);
      var badge = document.createElement('span');
      badge.textContent = comment.content_type === 'html' ? text(comment.sink) : 'stored text';
      meta.appendChild(author);
      meta.appendChild(badge);
      var body = document.createElement('div');
      body.className = 'comment-body';
      panel.appendChild(meta);
      panel.appendChild(body);
      article.appendChild(avatar);
      article.appendChild(panel);
      root.appendChild(article);
      renderUnsafe(body, comment);
    });
    updatePayloadForm();
  }
  function updatePayloadForm() {
    var payloads = state.payloadComments;
    var select = $('payload-picker');
    var textarea = $('stored-comment-body');
    if (!select || !textarea) return;
    select.textContent = '';
    payloads.forEach(function (comment, index) {
      var option = document.createElement('option');
      option.value = String(index);
      option.textContent = '#' + comment.payload.number + ' ' + (comment.payload.events || []).join(', ') + ' ' + (comment.payload.tag || '');
      select.appendChild(option);
    });
    if (payloads.length) {
      var selected = payloads[Math.min(state.selectedPayloadIndex, payloads.length - 1)];
      select.value = String(Math.min(state.selectedPayloadIndex, payloads.length - 1));
      textarea.value = selected.body_html || '';
    }
  }
  function onPayloadChange(event) {
    state.selectedPayloadIndex = Math.max(0, Number(event.target.value) || 0);
    updatePayloadForm();
  }
  async function loadComments() {
    setStatus('Fetching stored comments...');
    var response = await fetch(config.commentsUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('comments fetch failed: ' + response.status);
    var data = await response.json();
    state.comments = data.comments || [];
    state.payloadComments = state.comments.filter(function (comment) { return comment.content_type === 'html'; });
    setStatus('Fetched ' + state.comments.length + ' stored comments from ' + data.storage.source + '.');
    renderComments();
  }
  async function submitStoredComment(event) {
    event.preventDefault();
    var textarea = $('stored-comment-body');
    var selected = state.payloadComments[Math.min(state.selectedPayloadIndex, Math.max(0, state.payloadComments.length - 1))] || {};
    var response = await fetch(config.submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        author: $('stored-comment-author') ? $('stored-comment-author').value : 'attacker',
        body_html: textarea ? textarea.value : '',
        sink: selected.sink || 'innerHTML',
        payload_id: selected.payload ? selected.payload.id : ''
      })
    });
    if (!response.ok) throw new Error('stored submit failed: ' + response.status);
    var data = await response.json();
    state.comments.push(data.comment);
    setStatus('Stored form submission appended as ' + data.comment.id + '.');
    renderComments();
  }
  function init() {
    var select = $('payload-picker');
    var form = $('stored-comment-form');
    if (select) select.addEventListener('change', onPayloadChange);
    if (form) form.addEventListener('submit', function (event) {
      submitStoredComment(event).catch(function (error) { setStatus(error.message || String(error)); });
    });
    window.setTimeout(function () {
      loadComments().catch(function (error) { setStatus(error.message || String(error)); });
    }, delay);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
</script>`;
}

function renderLiveStoredScript(config) {
  return `<script>
(function () {
  var config = ${safeJson(config)};
  var state = { comments: [] };
  var delayParam = Number(new URLSearchParams(window.location.search).get('delay'));
  var delay = Number.isFinite(delayParam) && delayParam >= 0 ? delayParam : 80;

  function $(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value); }
  function initial(name) {
    return text(name).split(/\\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'U';
  }
  function sessionId() {
    var key = 'domkeeper-live-session';
    var value = '';
    try { value = window.localStorage.getItem(key) || ''; } catch (_) {}
    if (!value) {
      value = 'live-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { window.localStorage.setItem(key, value); } catch (_) {}
    }
    window.__xssLiveSession = value;
    document.documentElement.setAttribute('data-xss-live-session', value);
    var node = $('session-id');
    if (node) node.textContent = value;
    return value;
  }
  function setStatus(value) {
    var node = $('live-status');
    if (node) node.textContent = value;
  }
  function arm(_root) {}
  function sanitizeAngularHtml(html) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    Array.prototype.slice.call(template.content.querySelectorAll('script, iframe, object, embed, applet, meta, base, link')).forEach(function (node) {
      node.remove();
    });
    Array.prototype.slice.call(template.content.querySelectorAll('*')).forEach(function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attribute) {
        if (/^on/i.test(attribute.name) || /javascript:/i.test(attribute.value || '') || attribute.name === 'srcdoc') {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }
  function defineLiveElement() {
    if (window.customElements && !window.customElements.get('live-stored-comment')) {
      window.customElements.define('live-stored-comment', class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          var shadow = this.attachShadow({ mode: 'open' });
          var style = document.createElement('style');
          style.textContent = ':host{display:block}.body{font:14px Arial,sans-serif;color:#18212f}.body *{max-width:100%}';
          var body = document.createElement('div');
          body.className = 'body';
          body.innerHTML = this.getAttribute('payload-html') || '';
          shadow.appendChild(style);
          shadow.appendChild(body);
          arm(shadow);
        }
      });
    }
  }
  function iframeDoc(html) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><base target="_top"></head><body><main class="stored-comment">' + html + '</main></body></html>';
  }
  function renderHtml(target, comment) {
    var html = text(comment.body_html);
    var sink = comment.sink || 'innerHTML';
    target.setAttribute('data-comment-sink', sink);
    target.setAttribute('data-live-source', comment.source || '');

    if (comment.content_type === 'text') {
      target.textContent = text(comment.body_text);
      return;
    }
    if (sink === 'angularSanitized') {
      target.innerHTML = sanitizeAngularHtml(html);
      arm(target);
      return;
    }
    if (sink === 'insertAdjacentHTML') {
      target.textContent = '';
      target.insertAdjacentHTML('beforeend', html);
      arm(target);
      return;
    }
    if (sink === 'rangeFragment') {
      target.textContent = '';
      var range = document.createRange();
      range.selectNode(target);
      target.appendChild(range.createContextualFragment(html));
      arm(target);
      return;
    }
    if (sink === 'templateClone') {
      var template = document.createElement('template');
      template.innerHTML = '<div class="stored-template-body">' + html + '</div>';
      target.replaceChildren(template.content.cloneNode(true));
      arm(target);
      return;
    }
    if (sink === 'shadowDom') {
      target.textContent = '';
      var host = document.createElement('div');
      host.className = 'comment-shadow-host';
      target.appendChild(host);
      var shadow = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = '.shadow-comment{font:14px Arial,sans-serif;color:#18212f}.shadow-comment *{max-width:100%}';
      var body = document.createElement('div');
      body.className = 'shadow-comment';
      body.innerHTML = html;
      shadow.appendChild(style);
      shadow.appendChild(body);
      arm(shadow);
      return;
    }
    if (sink === 'iframeSrcdoc') {
      target.textContent = '';
      var frame = document.createElement('iframe');
      frame.className = 'stored-comment-frame';
      frame.title = 'Stored comment attachment';
      frame.srcdoc = iframeDoc(html);
      target.appendChild(frame);
      return;
    }
    if (sink === 'webComponent') {
      defineLiveElement();
      target.textContent = '';
      var custom = document.createElement('live-stored-comment');
      custom.setAttribute('payload-html', html);
      target.appendChild(custom);
      return;
    }
    if (sink === 'shadyDom') {
      window.ShadyDOM = window.ShadyDOM || { inUse: true, handlesDynamicScoping: true };
      target.textContent = '';
      var host = document.createElement('live-stored-comment');
      host.setAttribute('data-shady-host', '');
      var distributed = document.createElement('div');
      distributed.className = 'shady-distributed-comment';
      distributed.setAttribute('data-shady-root', '');
      distributed.innerHTML = html;
      host.appendChild(distributed);
      target.appendChild(host);
      arm(host);
      return;
    }
    target.innerHTML = html;
    arm(target);
  }
  function createButton(label, action, comment) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'comment-action';
    button.setAttribute('data-action', action);
    button.setAttribute('data-comment-id', comment.id || '');
    button.textContent = label;
    return button;
  }
  function createSemanticReplyForm(comment) {
    var form = document.createElement('form');
    form.className = 'reply-form';
    form.setAttribute('data-reply-target', comment.id || '');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });
    var label = document.createElement('label');
    label.textContent = 'Reply';
    var textarea = document.createElement('textarea');
    textarea.name = 'reply';
    textarea.placeholder = 'Write a reply';
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Post reply';
    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(submit);
    return form;
  }
  function addSemanticFeatures(panel, comment, index) {
    var actions = document.createElement('footer');
    actions.className = 'comment-actions';
    actions.appendChild(createButton('Comment', 'comment', comment));
    actions.appendChild(createButton('Like', 'like', comment));
    actions.appendChild(createButton('Reply', 'reply', comment));
    actions.appendChild(createButton('Share', 'share', comment));
    actions.appendChild(createButton('Report', 'report', comment));
    panel.appendChild(actions);
    panel.appendChild(createSemanticReplyForm(comment));
    if (index % 3 === 0) {
      var replies = document.createElement('section');
      replies.className = 'reply-list';
      replies.setAttribute('aria-label', 'Replies');
      var reply = document.createElement('article');
      reply.className = 'reply-card';
      var replyAuthor = document.createElement('strong');
      replyAuthor.textContent = 'Thread moderator';
      var replyBody = document.createElement('p');
      replyBody.textContent = 'Thanks for adding the context. This thread stays attached to the stored comment.';
      reply.appendChild(replyAuthor);
      reply.appendChild(replyBody);
      replies.appendChild(reply);
      panel.appendChild(replies);
    }
  }
  function createSemanticComment(comment, index) {
    var article = document.createElement('article');
    article.className = 'comment-card semantic-comment' + (comment.content_type === 'html' ? ' attack-comment' : '');
    article.setAttribute('data-stored-comment-id', comment.id || '');
    article.setAttribute('data-session-id', comment.session_id || '');
    var avatar = document.createElement('div');
    avatar.className = 'avatar tone-' + (index % 6);
    avatar.textContent = initial(comment.author);
    var panel = document.createElement('div');
    panel.className = 'comment-panel';
    var meta = document.createElement('header');
    meta.className = 'comment-meta';
    var author = document.createElement('strong');
    author.textContent = text(comment.author);
    var badge = document.createElement('span');
    badge.textContent = comment.content_type === 'html' ? text(comment.sink) : 'stored text';
    meta.appendChild(author);
    meta.appendChild(badge);
    var body = document.createElement('div');
    body.className = 'comment-body';
    panel.appendChild(meta);
    panel.appendChild(body);
    article.appendChild(avatar);
    article.appendChild(panel);
    renderHtml(body, comment);
    addSemanticFeatures(panel, comment, index);
    return article;
  }
  function createLegacyComment(comment, index) {
    var row = document.createElement('div');
    row.className = 'legacy-comment-row' + (comment.content_type === 'html' ? ' legacy-attack' : '');
    row.setAttribute('data-cid', comment.id || '');
    row.setAttribute('data-session', comment.session_id || '');
    var head = document.createElement('div');
    head.className = 'legacy-head';
    var avatar = document.createElement('span');
    avatar.className = 'legacy-avatar tone-' + (index % 6);
    avatar.textContent = initial(comment.author);
    var name = document.createElement('span');
    name.className = 'legacy-name';
    name.textContent = text(comment.author);
    var badge = document.createElement('span');
    badge.className = 'legacy-badge';
    badge.textContent = comment.content_type === 'html' ? text(comment.sink) : 'text';
    head.appendChild(avatar);
    head.appendChild(name);
    head.appendChild(badge);
    var body = document.createElement('div');
    body.className = 'legacy-body';
    var tools = document.createElement('div');
    tools.className = 'legacy-tools';
    ['comment', 'reply', 'vote', 'flag'].forEach(function (action) {
      var item = document.createElement('span');
      item.className = 'legacy-tool legacy-' + action;
      item.setAttribute('data-action', action);
      item.textContent = action;
      tools.appendChild(item);
    });
    var replyBox = document.createElement('div');
    replyBox.className = 'legacy-reply-box';
    replyBox.setAttribute('contenteditable', 'true');
    replyBox.setAttribute('data-placeholder', 'reply here');
    var nested = document.createElement('div');
    nested.className = 'legacy-nested-replies';
    if (index % 4 === 0) {
      var nestedItem = document.createElement('div');
      nestedItem.className = 'legacy-reply';
      nestedItem.textContent = 'legacy reply attached to this row';
      nested.appendChild(nestedItem);
    }
    row.appendChild(head);
    row.appendChild(body);
    row.appendChild(tools);
    row.appendChild(replyBox);
    row.appendChild(nested);
    renderHtml(body, comment);
    return row;
  }
  function renderSemanticComments() {
    var root = $('semantic-live-feed');
    if (!root) return;
    root.textContent = '';
    state.comments.forEach(function (comment, index) {
      root.appendChild(createSemanticComment(comment, index));
    });
  }
  function renderLegacyComments() {
    var root = $('legacy-live-feed');
    if (!root) return;
    root.textContent = '';
    state.comments.forEach(function (comment, index) {
      root.appendChild(createLegacyComment(comment, index));
    });
  }
  function renderComments() {
    renderSemanticComments();
    renderLegacyComments();
  }
  async function loadComments() {
    var session = sessionId();
    setStatus('Fetching stored comments for room ' + config.room + '...');
    var response = await fetch(config.commentsUrl, {
      headers: {
        Accept: 'application/json',
        'X-XSS-Live-Session': session
      }
    });
    if (!response.ok) throw new Error('comments fetch failed: ' + response.status);
    var data = await response.json();
    state.comments = data.comments || [];
    setStatus('Fetched ' + state.comments.length + ' stored comments from ' + data.storage.source + '.');
    renderComments();
  }
  async function submitComment(event) {
    event.preventDefault();
    var session = sessionId();
    var textarea = $('live-comment-body');
    var author = $('live-comment-author');
    var sink = $('live-comment-sink');
    var response = await fetch(config.submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-XSS-Live-Session': session
      },
      body: JSON.stringify({
        session_id: session,
        author: author ? author.value : '',
        sink: sink ? sink.value : 'innerHTML',
        body_html: textarea ? textarea.value : ''
      })
    });
    if (!response.ok) throw new Error('stored submit failed: ' + response.status);
    var data = await response.json();
    state.comments.push(data.comment);
    setStatus('Persisted ' + data.comment.id + ' for room ' + config.room + '.');
    renderComments();
  }
  function initForm() {
    var textarea = $('live-comment-body');
    var form = $('live-comment-form');
    var author = $('live-comment-author');
    if (textarea && !textarea.value) textarea.value = config.defaultPayload || '';
    if (author && !author.value) author.value = 'visitor ' + sessionId().slice(-6);
    if (form) {
      form.addEventListener('submit', function (event) {
        submitComment(event).catch(function (error) { setStatus(error.message || String(error)); });
      });
    }
  }
  function init() {
    sessionId();
    initForm();
    window.setTimeout(function () {
      loadComments().catch(function (error) { setStatus(error.message || String(error)); });
    }, delay);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
</script>`;
}

function renderLiveStoredPage(req, room = liveDefaultRoom) {
  const normalizedRoom = normalizeLiveRoom(room);
  const baseUrl = getBaseUrl(req);
  const roomPath = `${publicMountPath}/live/${normalizedRoom}`;
  const commentsUrl = `${roomPath}/comments.json${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  const submitUrl = `${roomPath}/comments`;
  const defaultPayload = `<img src="${publicMountPath}/assets/live-submitted-${normalizedRoom}.png" onerror="alert('submitted-live-xss')"><span>submitted stored image payload</span>`;
  const config = {
    room: normalizedRoom,
    commentsUrl,
    submitUrl,
    defaultPayload,
  };
  const sinkOptions = Array.from(liveAllowedSinks).map((sink) => {
    const selected = sink === 'innerHTML' ? ' selected' : '';
    return `<option value="${escapeAttribute(sink)}"${selected}>${escapeHtml(sink)}</option>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${escapeAttribute(`${baseUrl}/live/${normalizedRoom}`)}">
  <title>Live Stored Comment Feed</title>
  <style>
    :root { color-scheme:light; --ink:#172033; --muted:#667085; --line:#d5dbe6; --paper:#fff; --soft:#f5f7fb; --accent:#0f766e; --blue:#1d4ed8; --violet:#7c3aed; --rose:#be123c; --amber:#b45309; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#eef2f7; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .app-shell { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
    .sidebar { background:#111827; color:#fff; padding:22px 18px; }
    .brand { font-weight:800; font-size:18px; margin-bottom:22px; }
    .nav-link { display:block; color:#e5e7eb; padding:9px 10px; border-radius:6px; margin-bottom:4px; }
    .nav-link.active { background:#1f2937; color:#fff; }
    .main { min-width:0; }
    .topbar { min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 26px; background:#fff; border-bottom:1px solid var(--line); }
    .topbar strong { font-size:15px; }
    .workspace { max-width:1180px; margin:0 auto; padding:24px; display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; }
    .panel { background:var(--paper); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .panel-head { padding:18px 20px; border-bottom:1px solid var(--line); background:#fff; }
    .panel-head h1, .panel-head h2 { margin:0 0 6px; font-size:24px; letter-spacing:0; }
    .panel-head p { margin:0; color:var(--muted); line-height:1.45; }
    .story-body { padding:20px; color:#263244; line-height:1.65; }
    .story-body p { margin:0 0 14px; }
    #semantic-live-feed, #legacy-live-feed { padding:18px; }
    .comment-card { display:grid; grid-template-columns:42px minmax(0,1fr); gap:12px; margin-bottom:14px; }
    .avatar { width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:12px; }
    .tone-0 { background:var(--accent); } .tone-1 { background:var(--violet); } .tone-2 { background:var(--amber); } .tone-3 { background:var(--blue); } .tone-4 { background:var(--rose); } .tone-5 { background:#475467; }
    .comment-panel { min-width:0; border:1px solid var(--line); border-radius:8px; background:#fff; padding:12px 14px; }
    .attack-comment .comment-panel { border-color:#a7b2c3; background:#fffdfa; }
    .comment-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--muted); font-size:12px; margin-bottom:8px; }
    .comment-meta strong { color:#1f2937; font-size:14px; }
    .comment-body { color:#263244; line-height:1.5; overflow-wrap:anywhere; word-break:break-word; }
    .comment-body img, .comment-body svg { max-width:100%; height:auto; }
    .comment-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid #eef2f7; }
    .comment-action { width:auto; margin:0; padding:6px 9px; min-height:32px; border-color:#cbd5e1; background:#fff; color:#344054; font-size:12px; }
    .reply-form { margin-top:10px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:end; }
    .reply-form label { grid-column:1 / -1; margin:0; }
    .reply-form textarea { min-height:58px; font:13px Arial, Helvetica, sans-serif; }
    .reply-form button { width:auto; min-height:36px; margin:0; padding:8px 12px; }
    .reply-list { margin-top:10px; padding-left:14px; border-left:3px solid #d5dbe6; }
    .reply-card { padding:8px 0; color:#344054; }
    .reply-card p { margin:4px 0 0; }
    .stored-comment-frame { width:100%; min-height:120px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }
    .comment-shadow-host, live-stored-comment { display:block; border:1px dashed #98a2b3; border-radius:6px; padding:10px; background:#f8fafc; }
    .shady-distributed-comment { padding:8px; border-left:3px solid var(--amber); background:#fff8ed; }
    .legacy-region { margin-top:18px; }
    .legacy-comment-row { border:1px solid #d5dbe6; border-radius:8px; background:#fff; padding:12px; margin-bottom:12px; }
    .legacy-attack { background:#fffdfa; border-color:#a7b2c3; }
    .legacy-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; color:#667085; font-size:12px; }
    .legacy-avatar { width:30px; height:30px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:11px; }
    .legacy-name { color:#1f2937; font-weight:700; }
    .legacy-badge { margin-left:auto; }
    .legacy-body { color:#263244; line-height:1.5; overflow-wrap:anywhere; word-break:break-word; }
    .legacy-body img, .legacy-body svg { max-width:100%; height:auto; }
    .legacy-tools { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; color:#1d4ed8; font-size:12px; }
    .legacy-tool { cursor:pointer; border-bottom:1px dotted #1d4ed8; }
    .legacy-reply-box { min-height:36px; margin-top:10px; padding:8px; border:1px dashed #cbd5e1; border-radius:6px; background:#f8fafc; color:#475467; }
    .legacy-reply-box:empty::before { content:attr(data-placeholder); color:#98a2b3; }
    .legacy-nested-replies { margin:10px 0 0 18px; border-left:3px solid #e5e7eb; padding-left:10px; color:#475467; font-size:13px; }
    .side-stack { display:grid; gap:14px; }
    .side-card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    .side-card h3 { margin:0 0 10px; font-size:15px; letter-spacing:0; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; }
    .chips span { display:inline-flex; border:1px solid #cbd5e1; background:#f8fafc; border-radius:999px; padding:4px 8px; font-size:12px; color:#475467; }
    .status { border-radius:6px; background:#0b1220; color:#d1fae5; padding:10px; font:12px Consolas, Monaco, monospace; white-space:pre-wrap; overflow:auto; }
    .status { min-height:42px; }
    label { display:block; font-size:12px; font-weight:700; color:#344054; margin:10px 0 5px; }
    input, select, textarea, button { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px 10px; font:inherit; background:#fff; color:var(--ink); }
    textarea { min-height:150px; resize:vertical; font:12px Consolas, Monaco, monospace; }
    button { margin-top:10px; background:var(--accent); border-color:var(--accent); color:#fff; cursor:pointer; }
    @media (max-width:940px) {
      .app-shell { grid-template-columns:1fr; }
      .sidebar { display:none; }
      .workspace { grid-template-columns:1fr; padding:16px; }
      .topbar { padding:12px 16px; align-items:flex-start; flex-direction:column; }
    }
  </style>
</head>
<body data-xss-live-room="${escapeAttribute(normalizedRoom)}">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">CommentOps</div>
      <a class="nav-link active" href="${roomPath}">Live stored feed</a>
      <a class="nav-link" href="${publicMountPath}">Payload index</a>
      <a class="nav-link" href="${publicMountPath}/frameworks">Framework families</a>
      <a class="nav-link" href="${publicMountPath}/react/1">React grouped page</a>
    </aside>
    <section class="main">
      <header class="topbar">
        <strong>Live Room: ${escapeHtml(normalizedRoom)}</strong>
        <span>Session <code id="session-id">pending</code></span>
      </header>
      <div class="workspace">
        <main>
          <article class="panel">
            <div class="panel-head">
              <h1>Stored Comment Stream</h1>
              <p>Fetched from <code>${escapeHtml(commentsUrl)}</code> and rendered during client startup.</p>
            </div>
            <div class="story-body">
              <p>Incident notes, attachment previews, profile imports, and embedded replies share the same persisted room.</p>
            </div>
          </article>
          <section class="panel" aria-label="Live stored comments">
            <div class="panel-head">
              <h2>Semantic Comment Thread</h2>
              <p>Seeded payload comments and visitor submissions render with articles, headers, buttons, reply forms, and nested replies.</p>
            </div>
            <div id="semantic-live-feed"><div class="story-body">Loading stored comments...</div></div>
          </section>
          <section class="panel legacy-region">
            <div class="panel-head">
              <h2>Legacy Comment Stream</h2>
              <p>The same stored feed is mirrored into div-only rows with class-based comment, reply, vote, and flag controls.</p>
            </div>
            <div id="legacy-live-feed"><div class="story-body">Loading legacy comments...</div></div>
          </section>
        </main>
        <aside class="side-stack">
          <section class="side-card">
            <h3>Room URLs</h3>
            <div class="chips">
              <span>${escapeHtml(roomPath)}</span>
              <span>${escapeHtml(commentsUrl)}</span>
            </div>
          </section>
          <section class="side-card">
            <h3>Persist Stored Comment</h3>
            <form id="live-comment-form">
              <label for="live-comment-author">Author</label>
              <input id="live-comment-author" autocomplete="off">
              <label for="live-comment-sink">Render sink</label>
              <select id="live-comment-sink">${sinkOptions}</select>
              <label for="live-comment-body">Stored body</label>
              <textarea id="live-comment-body" spellcheck="false"></textarea>
              <button type="submit">Save to Room</button>
            </form>
          </section>
          <section class="side-card">
            <h3>Status</h3>
            <div id="live-status" class="status">Waiting for client fetch...</div>
          </section>
        </aside>
      </div>
    </section>
  </div>
  ${renderLiveStoredScript(config)}
</body>
</html>`;
}

function renderFrameworkAppPage(req, group, surface = defaultFrameworkSurface()) {
  const scenario = scenarios[(group.number - 1) % scenarios.length];
  const baseUrl = getBaseUrl(req);
  const commentsUrl = `${publicMountPath}/${surface.id}/${group.number}/comments.json${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  const submitUrl = `${publicMountPath}/${surface.id}/${group.number}/comments`;
  const eventLabels = [group.label].concat(group.sink_types).filter(Boolean).map((label) => `<span>${escapeHtml(label)}</span>`).join('');
  const config = {
    surface: {
      id: surface.id,
      label: surface.label,
      sinkLabel: surface.sinkLabel,
      description: surface.description,
    },
    group: reactGroupSummary(group, surface),
    commentsUrl,
    submitUrl,
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <link rel="canonical" href="${escapeAttribute(`${baseUrl}/${surface.id}/${group.number}`)}">
  <title>${escapeHtml(group.title)} · ${escapeHtml(surface.label)} Stored Comment App</title>
  ${renderCaptureHarness()}
  <style>
    :root { color-scheme:light; --ink:#172033; --muted:#667085; --line:#d5dbe6; --paper:#fff; --soft:#f5f7fb; --accent:#0f766e; --blue:#1d4ed8; --violet:#7c3aed; --rose:#be123c; --amber:#b45309; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#eef2f7; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .app-shell { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
    .sidebar { background:#111827; color:#fff; padding:22px 18px; }
    .brand { font-weight:800; font-size:18px; margin-bottom:22px; }
    .nav-link { display:block; color:#e5e7eb; padding:9px 10px; border-radius:6px; margin-bottom:4px; }
    .nav-link.active { background:#1f2937; color:#fff; }
    .main { min-width:0; }
    .topbar { height:64px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0 26px; background:#fff; border-bottom:1px solid var(--line); }
    .topbar strong { font-size:15px; }
    .workspace { max-width:1180px; margin:0 auto; padding:24px; display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:20px; align-items:start; }
    .panel { background:var(--paper); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .panel-head { padding:18px 20px; border-bottom:1px solid var(--line); background:#fff; }
    .panel-head h1, .panel-head h2 { margin:0 0 6px; font-size:24px; letter-spacing:0; }
    .panel-head p { margin:0; color:var(--muted); line-height:1.45; }
    .story-body { padding:20px; color:#263244; line-height:1.65; }
    .story-body p { margin:0 0 14px; }
    .comment-section { margin-top:18px; }
    #comment-feed { padding:18px; }
    .comment-card { display:grid; grid-template-columns:42px minmax(0,1fr); gap:12px; margin-bottom:14px; }
    .avatar { width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:12px; }
    .tone-0 { background:var(--accent); } .tone-1 { background:var(--violet); } .tone-2 { background:var(--amber); } .tone-3 { background:var(--blue); } .tone-4 { background:var(--rose); } .tone-5 { background:#475467; }
    .comment-panel { min-width:0; border:1px solid var(--line); border-radius:8px; background:#fff; padding:12px 14px; }
    .attack-comment .comment-panel { border-color:#a7b2c3; background:#fffdfa; }
    .comment-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--muted); font-size:12px; margin-bottom:8px; }
    .comment-meta strong { color:#1f2937; font-size:14px; }
    .comment-body { color:#263244; line-height:1.5; overflow-wrap:anywhere; word-break:break-word; }
    .stored-comment-frame { width:100%; min-height:120px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }
    .comment-shadow-host { border:1px dashed #98a2b3; border-radius:6px; padding:10px; background:#f8fafc; }
    .profile-bio { border-left:3px solid var(--violet); padding-left:10px; }
    stored-xss-comment { display:block; border:1px dashed #98a2b3; border-radius:6px; padding:10px; background:#f8fafc; }
    .shady-distributed-comment { padding:8px; border-left:3px solid var(--amber); background:#fff8ed; }
    .side-stack { display:grid; gap:14px; }
    .side-card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    .side-card h3 { margin:0 0 10px; font-size:15px; letter-spacing:0; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; }
    .chips span { display:inline-flex; border:1px solid #cbd5e1; background:#f8fafc; border-radius:999px; padding:4px 8px; font-size:12px; color:#475467; }
    .status { min-height:42px; border-radius:6px; background:#0b1220; color:#d1fae5; padding:10px; font:12px Consolas, Monaco, monospace; white-space:pre-wrap; }
    label { display:block; font-size:12px; font-weight:700; color:#344054; margin:10px 0 5px; }
    input, select, textarea, button { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px 10px; font:inherit; background:#fff; color:var(--ink); }
    textarea { min-height:130px; resize:vertical; font:12px Consolas, Monaco, monospace; }
    button { margin-top:10px; background:var(--accent); border-color:var(--accent); color:#fff; cursor:pointer; }
    .event-log { min-height:82px; max-height:180px; overflow:auto; white-space:pre-wrap; background:#0b1220; color:#d1fae5; border-radius:6px; padding:10px; font:12px Consolas, Monaco, monospace; }
    @media (max-width:940px) {
      .app-shell { grid-template-columns:1fr; }
      .sidebar { display:none; }
      .workspace { grid-template-columns:1fr; padding:16px; }
      .topbar { padding:0 16px; }
    }
  </style>
</head>
<body data-xss-framework="${escapeAttribute(surface.id)}" data-xss-react-group="${escapeAttribute(group.number)}">
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">CommentOps</div>
      <a class="nav-link active" href="${publicMountPath}/${surface.id}/${group.number}">${escapeHtml(surface.label)}</a>
      <a class="nav-link" href="${publicMountPath}/${surface.id}">All ${escapeHtml(surface.label)} apps</a>
      <a class="nav-link" href="${publicMountPath}/frameworks">Framework families</a>
      <a class="nav-link" href="${publicMountPath}/${group.entries[0] ? group.entries[0].number : 1}">Single payload view</a>
    </aside>
    <section class="main">
      <header class="topbar">
        <strong>${escapeHtml(scenario.site)}</strong>
        <span>${escapeHtml(surface.label)} · ${escapeHtml(surface.sinkLabel)} · ${escapeHtml(group.entries.length)} payload comments</span>
      </header>
      <div class="workspace">
        <main>
          <article class="panel">
            <div class="panel-head">
              <h1>${escapeHtml(scenario.title)}</h1>
              <p>${escapeHtml(scenario.dek)}</p>
            </div>
            <div class="story-body">${scenario.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div>
          </article>
          <section class="panel comment-section" aria-label="Fetched stored comments">
            <div class="panel-head">
              <h2>Fetched Comment Thread</h2>
              <p>Comments are loaded by the client from <code>${escapeHtml(commentsUrl)}</code>.</p>
            </div>
            <div id="comment-feed"><div class="story-body">Loading stored comments...</div></div>
          </section>
        </main>
        <aside class="side-stack">
          <section class="side-card">
            <h3>Group Metadata</h3>
            <div class="chips">
              <span>group ${escapeHtml(group.number)}</span>
              <span>${escapeHtml(group.label)}</span>
              ${eventLabels}
            </div>
          </section>
          <section class="side-card">
            <h3>Stored Submit Replay</h3>
            <form id="stored-comment-form">
              <label for="payload-picker">Payload</label>
              <select id="payload-picker"></select>
              <label for="stored-comment-author">Author</label>
              <input id="stored-comment-author" value="stored attacker">
              <label for="stored-comment-body">Comment body</label>
              <textarea id="stored-comment-body"></textarea>
              <button type="submit">Save Stored Comment</button>
            </form>
          </section>
          <section class="side-card">
            <h3>Status</h3>
            <div id="app-status" class="status">Waiting for client fetch...</div>
          </section>
          <section class="side-card">
            <h3>Captured Events</h3>
            <div id="xss-event-log" class="event-log">Waiting for payload activity...</div>
          </section>
        </aside>
      </div>
    </section>
  </div>
  ${renderReactAppScript(config)}
</body>
</html>`;
}

function sendCatalogJson(req, res) {
  const catalog = loadCatalog();
  const { byId, byNumber, ...publicCatalog } = catalog;
  const includePayloads = String(req.query.payloads || '1') !== '0';
  const body = includePayloads
    ? publicCatalog
    : {
      ...publicCatalog,
      entries: publicCatalog.entries.map((entry) => {
        const { payload, ...metadata } = entry;
        return metadata;
      }),
    };
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

function sendUrlsCsv(req, res) {
  const catalog = loadCatalog();
  const baseUrl = getBaseUrl(req);
  const header = ['number', 'url', 'id', 'source', 'category', 'group', 'title', 'tag', 'events', 'sink_types', 'render_mode'].map(csvEscape).join(',');
  const rows = catalog.entries.map((entry) => [
    entry.number,
    `${baseUrl}/${entry.number}`,
    entry.id,
    entry.source,
    entry.category,
    entry.group,
    entry.title,
    entry.tag,
    (entry.events || []).join('|'),
    (entry.sink_types || []).join('|'),
    entry.render_mode,
  ].map(csvEscape).join(','));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="xss-test-pages.csv"');
  res.send(`${header}\n${rows.join('\n')}\n`);
}

function sendPayloadJson(req, res) {
  const catalog = loadCatalog();
  const entry = resolveEntry(catalog, req.params.id);
  if (!entry) {
    res.status(404).json({ error: 'XSS test payload not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(entry);
}

function sendFrameworkGroupsJson(req, res, surface = defaultFrameworkSurface()) {
  const catalog = loadCatalog();
  const groups = groupEntriesForReact(catalog);
  const includePayloads = String(req.query.payloads || '0') === '1';
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    schema_version: 1,
    generated_at: catalog.generated_at || '',
    group_size: reactGroupSize,
    group_count: groups.length,
    payload_count: catalog.entries.length,
    groups: groups.map((group) => includePayloads
      ? {
        ...reactGroupSummary(group, surface),
        payloads: group.entries,
      }
      : reactGroupSummary(group, surface)),
  });
}

function sendFrameworkUrlsCsv(req, res, surface = defaultFrameworkSurface()) {
  const catalog = loadCatalog();
  const groups = groupEntriesForReact(catalog);
  const baseUrl = getBaseUrl(req);
  const header = ['surface', 'group', 'url', 'id', 'source', 'label', 'sink_model', 'payload_count', 'tags', 'sink_types', 'first_payload', 'last_payload'].map(csvEscape).join(',');
  const rows = groups.map((group) => [
    surface.id,
    group.number,
    `${baseUrl}/${surface.id}/${group.number}`,
    group.id,
    group.source,
    group.label,
    surface.sinkLabel,
    group.entries.length,
    group.tags.join('|'),
    group.sink_types.join('|'),
    group.entries[0] ? group.entries[0].number : '',
    group.entries[group.entries.length - 1] ? group.entries[group.entries.length - 1].number : '',
  ].map(csvEscape).join(','));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="xss-react-comment-apps.csv"');
  res.send(`${header}\n${rows.join('\n')}\n`);
}

function sendFrameworkGroupCommentsJson(req, res, surface = defaultFrameworkSurface()) {
  const catalog = loadCatalog();
  const group = resolveReactGroup(catalog, req.params.groupId);
  if (!group) {
    res.status(404).json({ error: 'Stored comment group not found' });
    return;
  }
  const comments = buildReactStoredComments(group);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    schema_version: 1,
    surface: {
      id: surface.id,
      label: surface.label,
      sink_label: surface.sinkLabel,
      description: surface.description,
    },
    group: reactGroupSummary(group, surface),
    storage: {
      source: 'server-side stored-comment fixture',
      route: `${publicMountPath}/${surface.id}/${group.number}/comments.json`,
      fetched_at: new Date().toISOString(),
      persistence: 'deterministic fixture; POST endpoint simulates append-only storage',
    },
    comments,
  });
}

function receiveFrameworkStoredComment(req, res, surface = defaultFrameworkSurface()) {
  const catalog = loadCatalog();
  const group = resolveReactGroup(catalog, req.params.groupId);
  if (!group) {
    res.status(404).json({ error: 'Stored comment group not found' });
    return;
  }
  const body = req.body || {};
  const allowedSinks = new Set([
    'dangerouslySetInnerHTML',
    'innerHTML',
    'insertAdjacentHTML',
    'rangeFragment',
    'templateClone',
    'shadowDom',
    'iframeSrcdoc',
    'profileBio',
  ]);
  const requestedSink = String(body.sink || 'innerHTML');
  const comment = {
    id: `submitted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    author: compactText(body.author || 'stored attacker', 80),
    role: 'submitted account',
    content_type: 'html',
    body_html: String(body.body_html || '').slice(0, 50000),
    sink: allowedSinks.has(requestedSink) ? requestedSink : 'innerHTML',
    stored: true,
    source: 'stored-comment-form-api',
    created_at: new Date().toISOString(),
    payload: {
      id: compactText(body.payload_id || 'form-submission', 120),
      number: null,
      source: 'form-submit',
      title: 'Submitted stored comment',
      tag: '',
      events: [],
      sink_types: ['form-submitted-html'],
    },
  };
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({
    ok: true,
    surface: {
      id: surface.id,
      label: surface.label,
      sink_label: surface.sinkLabel,
    },
    group: reactGroupSummary(group, surface),
    comment,
  });
}

async function sendLiveCommentsJson(req, res, storePath, room = liveDefaultRoom) {
  const normalizedRoom = normalizeLiveRoom(room);
  const stored = await readLiveRoom(storePath, normalizedRoom);
  const seedComments = buildLiveSeedComments(normalizedRoom);
  const sessionId = liveSessionFromRequest(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    schema_version: 1,
    room: normalizedRoom,
    session_id: sessionId,
    storage: {
      source: 'server-side persisted live comment store',
      route: `${publicMountPath}/live/${normalizedRoom}/comments.json`,
      submit_route: `${publicMountPath}/live/${normalizedRoom}/comments`,
      fetched_at: new Date().toISOString(),
      persistence: 'JSON store under the API artifact directory; comments are shared by room',
      seeded_comment_count: seedComments.length,
      persisted_comment_count: stored.comments.length,
    },
    comments: seedComments.concat(stored.comments),
  });
}

async function receiveLiveStoredComment(req, res, storePath, room = liveDefaultRoom) {
  const normalizedRoom = normalizeLiveRoom(room);
  const body = req.body || {};
  const requestedSink = String(body.sink || 'innerHTML');
  const bodyHtml = String(body.body_html || '').slice(0, 50000);
  const sessionId = liveSessionFromRequest(req);
  const comment = {
    id: liveEventId('live-comment'),
    room: normalizedRoom,
    author: compactText(body.author || `visitor ${sessionId.slice(-6)}`, 80),
    role: 'visitor submission',
    content_type: 'html',
    body_html: bodyHtml,
    sink: liveAllowedSinks.has(requestedSink) ? requestedSink : 'innerHTML',
    stored: true,
    source: 'visitor-live-store',
    created_at: new Date().toISOString(),
    session_id: sessionId,
    payload: livePayloadMetadata(bodyHtml, 'visitor-live-submission'),
  };

  await appendLiveComment(storePath, normalizedRoom, comment);
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({
    ok: true,
    room: normalizedRoom,
    comment,
  });
}

function createSilentWav() {
  const sampleRate = 8000;
  const seconds = 0.25;
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

const transparentGif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const wavBuffer = createSilentWav();

function sendAsset(req, res, next) {
  const name = String(req.params.name || '').toLowerCase();
  if (/^(?:validimage|image|pixel)\.(?:gif|png|jpg|jpeg|webp|svg)$/i.test(name)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type(name.endsWith('.svg') ? 'image/svg+xml' : 'image/gif');
    res.send(transparentGif);
    return;
  }
  if (/^validaudio\.(?:wav|mp3|ogg)$/i.test(name)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type(name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
    res.send(wavBuffer);
    return;
  }
  if (/^validvideo\.mp4$/i.test(name)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('video/mp4');
    res.send(Buffer.from('00000018667479706d703432000000006d70343269736f6d000000086d646174', 'hex'));
    return;
  }
  next();
}

function createXssTestPagesRouter(options = {}) {
  const router = express.Router();
  const liveStorePath = resolveLiveStorePath(options);
  const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  router.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  router.get(['/assets/:name', '/:name(validaudio.wav|validaudio.mp3|validaudio.ogg|validvideo.mp4|validimage.gif|validimage.png|validimage.jpg|pixel.gif)'], sendAsset);
  router.get(['/catalog.json'], sendCatalogJson);
  router.get(['/urls.csv'], sendUrlsCsv);
  router.get(['/all', '/all.html'], (req, res) => {
    const catalog = loadCatalog();
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderIndex(req, catalog, true));
  });
  router.get(['/', '/index.html'], (req, res) => {
    const catalog = loadCatalog();
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderIndex(req, catalog, false));
  });
  router.get(['/frameworks', '/frameworks/'], (req, res) => {
    const catalog = loadCatalog();
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderFrameworkFamiliesIndex(req, catalog));
  });
  router.get(['/live', '/live/'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderLiveStoredPage(req, liveDefaultRoom));
  });
  router.get('/live/comments.json', asyncRoute((req, res) => sendLiveCommentsJson(req, res, liveStorePath, liveDefaultRoom)));
  router.post('/live/comments', asyncRoute((req, res) => receiveLiveStoredComment(req, res, liveStorePath, liveDefaultRoom)));
  router.get('/live/:room/comments.json', asyncRoute((req, res) => sendLiveCommentsJson(req, res, liveStorePath, req.params.room)));
  router.post('/live/:room/comments', asyncRoute((req, res) => receiveLiveStoredComment(req, res, liveStorePath, req.params.room)));
  router.get('/live/:room', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderLiveStoredPage(req, req.params.room));
  });
  router.get('/:surface/groups.json', (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    sendFrameworkGroupsJson(req, res, surface);
  });
  router.get('/:surface/urls.csv', (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    sendFrameworkUrlsCsv(req, res, surface);
  });
  router.get(['/:surface', '/:surface/'], (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    const catalog = loadCatalog();
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderFrameworkIndex(req, catalog, surface));
  });
  router.get('/:surface/:groupId/comments.json', (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    sendFrameworkGroupCommentsJson(req, res, surface);
  });
  router.post('/:surface/:groupId/comments', (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    receiveFrameworkStoredComment(req, res, surface);
  });
  router.get('/:surface/:groupId', (req, res, next) => {
    const surface = getFrameworkSurface(req.params.surface);
    if (!surface) return next();
    const catalog = loadCatalog();
    const group = resolveReactGroup(catalog, req.params.groupId);
    if (!group) {
      res.status(404).type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><h1>Stored comment app group not found</h1></body></html>');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderFrameworkAppPage(req, group, surface));
  });
  router.get('/:id/payload.json', sendPayloadJson);
  router.get('/:id', (req, res) => {
    const catalog = loadCatalog();
    const entry = resolveEntry(catalog, req.params.id);
    if (!entry) {
      res.status(404).type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><h1>XSS test page not found</h1></body></html>');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderTestPage(req, entry));
  });

  return router;
}

module.exports = {
  createXssTestPagesRouter,
  loadCatalog,
  publicMountPath,
};
