/**
 * injected_wrapper.js — MAIN World Injection
 *
 * This script runs in the page's JavaScript execution context (MAIN world)
 * before any page script executes.
 *
 * It is responsible for:
 *   - Capturing original references to all targeted DOM mutation APIs
 *   - Replacing them with intercepting wrappers
 *   - Building the PseudoDOM from every intercepted mutation
 *   - Running the heuristic UGC region classifier (pending ML model)
 *   - Running the XSS security precheck on mutations targeting UGC regions
 *   - Communicating results back to content_bridge.js via window.postMessage
 *
 * All original API references are captured in an IIFE closure so no
 * page script can ever observe or steal them.
 *
 * Covered APIs (Phase 1 P0 + P1 from 009_dom_mutation_api_reference.md):
 *   Node:     appendChild, insertBefore, replaceChild, removeChild
 *   Element:  innerHTML setter, outerHTML setter, insertAdjacentHTML,
 *             insertAdjacentElement, setAttribute, setAttributeNS,
 *             setAttributeNode, setAttributeNodeNS, removeAttribute,
 *             removeAttributeNS, removeAttributeNode,
 *             append, prepend, after, before, replaceWith, replaceChildren,
 *             remove, attachShadow
 *   Document: write, writeln, open, createElement, createElementNS,
 *             createTextNode, createDocumentFragment,
 *             importNode, adoptNode
 *   Range:    insertNode, createContextualFragment
 *   Script:   src setter, text setter
 *   IFrame:   srcdoc setter, src setter
 *   Anchor:   href setter (javascript: guard)
 *   Base:     href setter
 *   Eval:     eval, Function constructor, setTimeout/setInterval (string form)
 */

(function PseudoDOMGuard() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 0 — Capture all original API references before any patching
  //       This must happen synchronously at the top of the IIFE.
  // ═══════════════════════════════════════════════════════════════════════════

  const _originals = {
    // Node
    appendChild:             Node.prototype.appendChild,
    insertBefore:            Node.prototype.insertBefore,
    replaceChild:            Node.prototype.replaceChild,
    removeChild:             Node.prototype.removeChild,

    // Element — methods
    setAttribute:            Element.prototype.setAttribute,
    setAttributeNS:          Element.prototype.setAttributeNS,
    setAttributeNode:        Element.prototype.setAttributeNode,
    setAttributeNodeNS:      Element.prototype.setAttributeNodeNS,
    removeAttribute:         Element.prototype.removeAttribute,
    removeAttributeNS:       Element.prototype.removeAttributeNS,
    removeAttributeNode:     Element.prototype.removeAttributeNode,
    insertAdjacentHTML:      Element.prototype.insertAdjacentHTML,
    insertAdjacentElement:   Element.prototype.insertAdjacentElement,
    insertAdjacentText:      Element.prototype.insertAdjacentText,
    append:                  Element.prototype.append,
    prepend:                 Element.prototype.prepend,
    after:                   Element.prototype.after,
    before:                  Element.prototype.before,
    replaceWith:             Element.prototype.replaceWith,
    replaceChildren:         Element.prototype.replaceChildren,
    remove:                  Element.prototype.remove,
    attachShadow:            Element.prototype.attachShadow,

    // Element — property descriptors (innerHTML / outerHTML are getters/setters)
    innerHTMLDescriptor:     Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'),
    outerHTMLDescriptor:     Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML'),

    // Document
    createElement:           Document.prototype.createElement,
    createElementNS:         Document.prototype.createElementNS,
    createTextNode:          Document.prototype.createTextNode,
    createDocumentFragment:  Document.prototype.createDocumentFragment,
    createComment:           Document.prototype.createComment,
    importNode:              Document.prototype.importNode,
    adoptNode:               Document.prototype.adoptNode,
    docWrite:                Document.prototype.write,
    docWriteln:              Document.prototype.writeln,
    docOpen:                 Document.prototype.open,

    // Range
    rangeInsertNode:         Range.prototype.insertNode,
    rangeCreateContextual:   Range.prototype.createContextualFragment,

    // Specific element property descriptors
    scriptSrcDescriptor:     Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src'),
    scriptTextDescriptor:    Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'text'),
    iframeSrcdocDescriptor:  Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc'),
    iframeSrcDescriptor:     Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src'),

    // Native eval / Function (captured before any page script can shadow them)
    _eval:      window.eval,
    _Function:  window.Function,
    _setTimeout:  window.setTimeout,
    _setInterval: window.setInterval,

    // DOMParser for sandboxed HTML parsing
    DOMParser,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1 — PseudoDOM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lightweight parallel representation of the document tree built
   * incrementally from intercepted mutation calls.
   * See paper/005_pseudodom_design.md for full design rationale.
   */
  const PseudoDOM = (function () {

    // WeakMap: real DOM Node → synthetic string ID
    const nodeIdMap = new WeakMap();
    let _nextId = 0;

    function nodeId(node) {
      if (!node || typeof node !== 'object') return null;
      if (!nodeIdMap.has(node)) {
        nodeIdMap.set(node, `pn_${_nextId++}`);
      }
      return nodeIdMap.get(node);
    }

    // The node registry: id → PseudoNode
    const nodes = new Map();
    // Live DOM lookup: id → DOM node / shadow root
    const liveNodeById = new Map();
    // Ordered mutation log
    const mutations = [];
    let _seq = 0;

    // UGC region map: nodeId → confidence score (0–1)
    // Populated by the heuristic classifier; replaced by ML model later.
    const ugcRegionMap = new Map();

    // Mutation activity counter: nodeId → count of child insertions.
    // Incremented every time a node receives a child via record().
    // Used by getCandidateRoots to boost dynamically-populated containers.
    const _mutationActivity = new Map();

    /**
     * Ensure a PseudoNode exists for a real DOM Node.
     * Creates it if it doesn't exist yet.
     */
    function ensureNode(domNode, mutationType, parentDomNode) {
      if (!domNode || domNode.nodeType === Node.TEXT_NODE) {
        return null; // we track element nodes primarily
      }
      const id = nodeId(domNode);
      if (nodes.has(id)) return id;
      liveNodeById.set(id, domNode);

      const parentId = parentDomNode ? nodeId(parentDomNode) : null;

      const attrs = new Map();
      if (domNode.attributes) {
        for (const attr of domNode.attributes) {
          attrs.set(attr.name, attr.value);
        }
      }

      nodes.set(id, {
        id,
        tag:         (domNode.tagName || '').toLowerCase(),
        attributes:  attrs,
        textContent: domNode.childNodes.length === 0 ? (domNode.textContent || null) : null,
        children:    [],
        parentId,
        depth:       computeDepth(parentId),
        insertedAt:  performance.now(),
        mutationType: mutationType || 'initialParse',
        frameUrl:    window.location.href,
        isShadowRoot: false,
        shadowMode:  null,
      });

      return id;
    }

    function computeDepth(parentId) {
      if (!parentId) return 0;
      const parent = nodes.get(parentId);
      return parent ? parent.depth + 1 : 0;
    }

    /**
     * Record a mutation event and update the PseudoDOM tree.
     */
    function record(type, targetDomNode, insertedNodeOrString, removedDomNode) {
      const targetId = nodeId(targetDomNode);

      let insertedId = null;
      let rawValue   = null;

      if (typeof insertedNodeOrString === 'string') {
        // String-based sink (innerHTML, insertAdjacentHTML, document.write)
        rawValue = insertedNodeOrString;
        // Parse the HTML string into PseudoNodes (sandboxed)
        const subtreeIds = parseHTMLString(insertedNodeOrString, targetId, type);
        insertedId = subtreeIds[0] || null;
        // Attach parsed subtree roots to the target
        if (targetId && nodes.has(targetId)) {
          const targetNode = nodes.get(targetId);
          targetNode.children.push(...subtreeIds);
        }
        // Track activity — string mutations often inject batches of comment units
        if (targetId && subtreeIds.length > 0) {
          _mutationActivity.set(targetId, (_mutationActivity.get(targetId) || 0) + subtreeIds.length);
        }
      } else if (insertedNodeOrString && typeof insertedNodeOrString === 'object') {
        // Node-based insertion
        insertedId = ensureNode(insertedNodeOrString, type, targetDomNode);
        if (targetId && nodes.has(targetId) && insertedId) {
          const targetNode = nodes.get(targetId);
          if (!targetNode.children.includes(insertedId)) {
            targetNode.children.push(insertedId);
          }
          const insertedNode = nodes.get(insertedId);
          if (insertedNode) insertedNode.parentId = targetId;
        }
        // Track activity — each child appended to a parent is a signal
        if (targetId) {
          _mutationActivity.set(targetId, (_mutationActivity.get(targetId) || 0) + 1);
        }
      }

      const removedId = removedDomNode ? nodeId(removedDomNode) : null;
      if (removedId && targetId && nodes.has(targetId)) {
        const targetNode = nodes.get(targetId);
        targetNode.children = targetNode.children.filter(c => c !== removedId);
      }
      if (removedId) {
        liveNodeById.delete(removedId);
      }

      mutations.push({
        seq:        _seq++,
        type,
        targetId,
        insertedId,
        removedId,
        rawValue,
        timestamp:  performance.now(),
      });
    }

    /**
     * Parse an HTML string into PseudoNodes using a sandboxed DOMParser.
     * Returns an array of root PseudoNode IDs created from the parse.
     * The string is analysed for XSS patterns BEFORE this parse is used
     * to update the live DOM.
     */
    function parseHTMLString(htmlString, parentId, mutationType) {
      try {
        const parser = new _originals.DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const ids = [];
        for (const child of doc.body.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const id = importSubtree(child, parentId, mutationType);
            if (id) ids.push(id);
          }
        }
        return ids;
      } catch (_) {
        return [];
      }
    }

    function importSubtree(domNode, parentId, mutationType) {
      if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) return null;
      const id = ensureNode(domNode, mutationType, null);
      if (!id) return null;
      const pNode = nodes.get(id);
      if (parentId) pNode.parentId = parentId;

      for (const child of domNode.childNodes) {
        const childId = importSubtree(child, id, mutationType);
        if (childId) pNode.children.push(childId);
      }
      return id;
    }

    /**
     * Seed PseudoDOM from the live DOM at DOMContentLoaded.
     * Used for SSR pages where the initial HTML builds the DOM before
     * any JS-driven mutations occur.
     */
    function seedFromLiveDOM() {
      const walker = document.createTreeWalker(
        document.documentElement,
        NodeFilter.SHOW_ELEMENT
      );
      let node;
      while ((node = walker.nextNode())) {
        ensureNode(node, 'initialParse', node.parentElement);
        const id    = nodeId(node);
        const pNode = nodes.get(id);
        if (pNode && node.parentElement) {
          const parentId = nodeId(node.parentElement);
          pNode.parentId = parentId;
          const parent = nodes.get(parentId);
          if (parent && !parent.children.includes(id)) {
            parent.children.push(id);
          }
        }
      }
    }

    /**
     * Register a shadow root created via attachShadow.
     */
    function registerShadowRoot(hostDomNode, shadowRoot, mode) {
      const hostId = nodeId(hostDomNode);
      const srId   = nodeId(shadowRoot);
      liveNodeById.set(srId, shadowRoot);
      nodes.set(srId, {
        id:           srId,
        tag:          '#shadow-root',
        attributes:   new Map(),
        textContent:  null,
        children:     [],
        parentId:     hostId,
        depth:        computeDepth(hostId) + 1,
        insertedAt:   performance.now(),
        mutationType: 'attachShadow',
        frameUrl:     window.location.href,
        isShadowRoot: true,
        shadowMode:   mode,
      });
      if (hostId && nodes.has(hostId)) {
        nodes.get(hostId).children.push(srId);
      }
    }

    /**
     * Update or set a node's attribute in the PseudoDOM mirror.
     */
    function updateAttribute(domNode, name, value) {
      const id = nodeId(domNode);
      if (!id || !nodes.has(id)) return;
      nodes.get(id).attributes.set(name, value ?? '');
    }

    function removeAttributeRecord(domNode, name) {
      const id = nodeId(domNode);
      if (!id || !nodes.has(id)) return;
      nodes.get(id).attributes.delete(name);
    }

    /** Compute an absolute XPath for a PseudoNode. */
    function buildXPath(id) {
      const parts = [];
      let current = id;
      while (current) {
        const node = nodes.get(current);
        if (!node) break;
        if (!node.parentId) {
          parts.unshift(node.tag || 'unknown');
          break;
        }
        const parent = nodes.get(node.parentId);
        if (!parent) break;
        const siblings = parent.children.filter(
          cid => nodes.get(cid)?.tag === node.tag
        );
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(`${node.tag}[${idx}]`);
        current = node.parentId;
      }
      return '/' + parts.join('/');
    }

    /** Wildcard XPath: replace sibling indices with [*] */
    function wildcardXPath(id) {
      return buildXPath(id).replace(/\[\d+\]/g, '[*]');
    }

    /**
     * Structural signature of a live DOM element: tag + sorted child tags.
     * Mirrors the server's structuralSignature() in commentFeatures.js.
     * Two elements with the same signature look structurally identical to the model.
     */
    function _structSig(el) {
      const tag = (el.tagName || 'unknown').toLowerCase();
      const childTags = Array.from(el.children)
        .map(c => (c.tagName || '?').toLowerCase())
        .sort();
      return `${tag}[${childTags.join(',')}]`;
    }

    /**
     * Walk the LIVE DOM to find candidate UGC container roots.
     *
     * We scan the live DOM (not the PseudoDOM node map) because for
     * html-string mutations (innerHTML, insertAdjacentHTML) the PseudoDOM
     * builds its tree from a sandboxed DOMParser — those node objects are
     * different from the real DOM nodes and can't be used for live scoring.
     * By the time classify() runs (after debounce), every mutation has already
     * been applied to the live DOM, so the live DOM IS the "future DOM" that
     * the wrappers previewed.
     *
     * Grouping by structural signature (tag + sorted child tags) mirrors the
     * server's dominantChildGroup() and catches template-based comment lists
     * that tag-name grouping misses.
     */
    function getCandidateRoots() {
      const candidates = [];
      const seen = new Set();
      try {
        const walker = document.createTreeWalker(
          document.documentElement,
          NodeFilter.SHOW_ELEMENT
        );
        let el;
        while ((el = walker.nextNode())) {
          if (seen.has(el) || el.children.length < 3) continue;

          // Group direct children by structural signature
          const sigGroups = new Map();
          for (const child of el.children) {
            const sig = _structSig(child);
            if (!sigGroups.has(sig)) sigGroups.set(sig, []);
            sigGroups.get(sig).push(child);
          }
          const dominant = [...sigGroups.values()].sort((a, b) => b.length - a.length)[0];
          if (!dominant || dominant.length < 3) continue;

          seen.add(el);

          // Give this live element a stable PseudoDOM ID (WeakMap, so consistent
          // across repeated calls) and ensure liveNodeById is current.
          const id = nodeId(el);
          if (!liveNodeById.has(id)) liveNodeById.set(id, el);
          if (!nodes.has(id)) ensureNode(el, 'candidateScan', el.parentElement);

          candidates.push({
            id,
            node:               nodes.get(id),
            dominantFamilySize: dominant.length,
            dominantTemplate:   _structSig(dominant[0]) + '[*]',
            totalChildren:      el.children.length,
            homogeneity:        dominant.length / el.children.length,
            mutationActivity:   _mutationActivity.get(id) || 0,
          });
        }
      } catch (_) {}
      return candidates;
    }

    function getUGCConfidence(domNode) {
      const id = nodeId(domNode);
      if (!id) return 0;
      return ugcRegionMap.get(id) || 0;
    }

    function setUGCConfidence(domNode, score) {
      const id = nodeId(domNode);
      if (!id) return;
      ugcRegionMap.set(id, score);
    }

    /**
     * Record a UGC confidence score using a PseudoNode ID directly.
     * Used when the live DOM node is unavailable but the candidate ID is known.
     */
    function setUGCConfidenceById(id, score) {
      if (!id) return;
      ugcRegionMap.set(id, score);
    }

    function isInUGCRegion(domNode) {
      const id = nodeId(domNode);
      if (!id) return false;
      // Check node itself and ancestors
      let current = id;
      while (current) {
        if ((ugcRegionMap.get(current) || 0) >= UGC_HIGH_THRESHOLD) return true;
        current = nodes.get(current)?.parentId;
      }
      return false;
    }

    function serialize() {
      const nodesObj = {};
      for (const [id, node] of nodes) {
        nodesObj[id] = {
          ...node,
          attributes: Object.fromEntries(node.attributes),
        };
      }
      return {
        nodes: nodesObj,
        mutations,
        ugcRegionMap: Object.fromEntries(ugcRegionMap),
        url: window.location.href,
        capturedAt: Date.now(),
      };
    }

    function getLiveNode(id) {
      return liveNodeById.get(id) || null;
    }

    return {
      nodeId,
      ensureNode,
      record,
      seedFromLiveDOM,
      registerShadowRoot,
      updateAttribute,
      removeAttributeRecord,
      getCandidateRoots,
      getUGCConfidence,
      setUGCConfidence,
      setUGCConfidenceById,
      isInUGCRegion,
      parseHTMLString,
      serialize,
      getLiveNode,
      nodes,
      mutations,
      mutationActivity: _mutationActivity,
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1.5 — Candidate Highlight
  // ═══════════════════════════════════════════════════════════════════════════

  let _highlightMode = false;
  const _highlightedEls = new Set();

  const HIGHLIGHT_STYLE = '7px solid #e55353';
  const HIGHLIGHT_OFFSET = '2px';

  function _applyHighlightToAll(scored) {
    _clearAllHighlights();
    for (const { domNode } of scored) {
      if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) continue;
      domNode.style.outline = HIGHLIGHT_STYLE;
      domNode.style.outlineOffset = HIGHLIGHT_OFFSET;
      _highlightedEls.add(domNode);
    }
  }

  function _clearAllHighlights() {
    for (const el of _highlightedEls) {
      try { el.style.outline = ''; el.style.outlineOffset = ''; } catch (_) {}
    }
    _highlightedEls.clear();
  }

  // Single-element focus: called when a candidate card is clicked in the popup.
  // Clears the auto-highlight (if any), then draws the same 7px red border on
  // the explicitly chosen element.
  function _applyHighlight(domNode) {
    _clearAllHighlights();
    if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) return;
    domNode.style.outline = HIGHLIGHT_STYLE;
    domNode.style.outlineOffset = HIGHLIGHT_OFFSET;
    _highlightedEls.add(domNode);
  }

  function _handleCandidateJson(selectors) {
    if (!Array.isArray(selectors) || !selectors.length) return;
    let bestEl = null, bestScore = -1;
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (!el) continue;
        const score = HeuristicClassifier.scoreElement(el);
        if (score > bestScore) { bestScore = score; bestEl = el; }
      } catch (_) {}
    }
    if (_highlightMode && bestEl) _applyHighlight(bestEl);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2 — Heuristic UGC Classifier (stub for ML model)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * UGC_HIGH_THRESHOLD: mutations targeting nodes above this confidence
   * level are subject to full security precheck.
   */
  const UGC_HIGH_THRESHOLD = 0.65;
  const UGC_LOW_THRESHOLD  = 0.35;

  /**
   * HeuristicClassifier
   *
   * Scores each candidate PseudoDOM subgraph root against the feature
   * families defined in paper/006_ugc_detection_model.md and
   * brainstorm/007_feature_reference_and_output_schema.md.
   *
   * This is the pre-ML heuristic baseline. It will be replaced by the
   * trained logistic regression model once labeling is complete.
   * The score produced here drives:
   *   1. ugcRegionMap population
   *   2. mutation gate decisions
   *   3. candidate feature export for the training dataset
   */
  const HeuristicClassifier = (function () {

    // Keyword patterns — NFKD-normalized regex with word boundaries + international keywords.
    // Mirrors commentFeatures.js on the server so heuristic scores are calibrated the same way.
    const _KW_HIGH_RE = /\b(comment|comments|commenter|reply|replies|discussion|discussions|review|reviews|feedback|thread|threads|answer|answers|question|questions|forum|forums|qa|komentarz|komentarze|komentarzy|odpowiedz|odpowiedzi|comentario|comentarios|commentaire|commentaires|kommentar|kommentare|antwort|antworten|resposta|respostas|respuesta|respuestas|reponse|reponses)\b|\bq\s*(?:&|\/)\s*a\b/;
    const _KW_MED_RE  = /\b(post|posts|message|messages|response|responses|conversation|conversations|community|communities)\b/;
    const _KW_LOW_RE  = /\b(item|card|entry|block|unit|feed|list)\b/;
    const _COMBINING  = /[̀-ͯ]/g;
    function _kwNorm(v) { return String(v||'').normalize('NFKD').replace(_COMBINING,'').toLowerCase(); }

    const TS_RELATIVE = /\b(just now|today|yesterday|\d+\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|yr|year|years)\s*ago|(\d+)(s|m|h|d|w|mo|y)\b)/i;
    const TS_ABSOLUTE = /\b(\d{4}[-\/]\d{2}[-\/]\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i;

    const REPLY_ACTIONS   = /\b(reply|replies|respond|quote)\b/i;
    const LIKE_ACTIONS    = /\b(like|upvote|helpful|👍)\b/i;
    const SHARE_ACTIONS   = /\b(share|permalink|link)\b/i;
    const REPORT_ACTIONS  = /\b(report|flag|spam)\b/i;
    const AUTHOR_MARKERS  = /\b(author|commenter|user|poster|username|handle|by)\b/i;

    const NEGATIVE_COMMERCE    = /\b(add.to.cart|buy.now|price|checkout|purchase|\$|€|£)\b/i;
    const NEGATIVE_NAV         = /\b(nav|navigation|menu|header|footer|breadcrumb|sidebar)\b/i;

    /**
     * Score a single candidate root node.
     * Returns a score in [0, 1].
     */
    function scoreCandidateHeuristic(candidate, domNode) {
      let score = 0;

      // ── Structural repetition ──────────────────────────────────────────────
      const { dominantFamilySize, homogeneity, totalChildren } = candidate;

      if (dominantFamilySize >= 15) score += 0.25;
      else if (dominantFamilySize >= 8)  score += 0.20;
      else if (dominantFamilySize >= 5)  score += 0.15;
      else if (dominantFamilySize >= 3)  score += 0.10;

      if (homogeneity >= 0.8) score += 0.10;
      else if (homogeneity >= 0.5) score += 0.05;

      // ── Semantic keyword signals ───────────────────────────────────────────
      // Include the parent element's tag/attributes so a container like
      // #contents under ytd-comments still matches "comments" via its parent.
      const attrBlob = getAttributeBlob(domNode, true);
      const kwScore = keywordScore(attrBlob);
      score += kwScore;

      // ── Schema.org / ARIA signals ──────────────────────────────────────────
      if (hasSchemaOrgComment(domNode))    score += 0.12;
      if (hasAriaRoleFeed(domNode))        score += 0.08;
      if (hasAriaRoleComment(domNode))     score += 0.08;

      // ── Per-unit coverage signals ──────────────────────────────────────────
      if (domNode) {
        const units = getRepeatedUnits(domNode);
        const n = units.length || 1;

        const timeCoverage   = countUnitsWith(units, hasTimeSignal)   / n;
        const authorCoverage = countUnitsWith(units, hasAuthorSignal)  / n;
        const replyCoverage  = countUnitsWith(units, hasReplyAction)   / n;
        const avatarCoverage = countUnitsWith(units, hasAvatarSignal)  / n;

        if (timeCoverage   >= 0.5) score += 0.10;
        else if (timeCoverage >= 0.2) score += 0.05;

        if (authorCoverage >= 0.5) score += 0.10;
        else if (authorCoverage >= 0.2) score += 0.05;

        if (replyCoverage  >= 0.4) score += 0.08;
        if (avatarCoverage >= 0.4) score += 0.06;

        // ── Composer proximity ────────────────────────────────────────────
        if (hasNearbyComposer(domNode)) score += 0.06;
      }

      // ── Mutation activity bonus (SPA comment injection signal) ────────────
      // Containers that received many dynamically-added similar children are
      // very likely to be comment/feed regions being populated by the app.
      const activity = candidate.mutationActivity || 0;
      if (activity >= 10) score += 0.10;
      else if (activity >= 3) score += 0.05;

      // ── Negative controls ──────────────────────────────────────────────────
      if (NEGATIVE_COMMERCE.test(attrBlob)) score -= 0.15;
      if (NEGATIVE_NAV.test(attrBlob))      score -= 0.10;
      if (isTableStructure(domNode))        score -= 0.15;

      return Math.max(0, Math.min(1, score));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function getAttributeBlob(el, includeParent = false) {
      if (!el || !el.attributes) return '';
      const parts = [el.tagName || ''];
      for (const attr of el.attributes) {
        parts.push(attr.name, attr.value);
      }
      // Also include short direct text
      parts.push(el.childNodes.length === 1 && el.firstChild?.nodeType === 3
        ? (el.textContent || '').slice(0, 100)
        : '');
      // Include parent tag + attributes so a container like #contents under
      // ytd-comments still matches the "comments" keyword via its parent.
      if (includeParent && el.parentElement) {
        parts.push(el.parentElement.tagName || '');
        for (const attr of (el.parentElement.attributes || [])) {
          parts.push(attr.name, attr.value);
        }
      }
      return parts.join(' ');
    }

    // Query an element and its direct children's shadow roots — one level deep.
    // Needed for YouTube-style custom elements where light-DOM querySelector
    // can't reach inside shadow roots.
    function shadowAwareQuerySelector(el, selector) {
      const direct = el.querySelector?.(selector);
      if (direct) return direct;
      for (const child of (el.children || [])) {
        try {
          if (child.shadowRoot) {
            const found = child.shadowRoot.querySelector?.(selector);
            if (found) return found;
          }
        } catch (_) {}
      }
      return null;
    }

    function shadowAwareTextContent(el) {
      let text = el.textContent || '';
      for (const child of (el.children || [])) {
        try {
          if (child.shadowRoot) text += ' ' + (child.shadowRoot.textContent || '');
        } catch (_) {}
      }
      return text;
    }

    function shadowAwareQuerySelectorAll(el, selector) {
      const results = [];
      try {
        results.push(...el.querySelectorAll(selector));
      } catch (_) {}
      for (const child of (el.children || [])) {
        try {
          if (child.shadowRoot) results.push(...child.shadowRoot.querySelectorAll(selector));
        } catch (_) {}
      }
      return results;
    }

    function keywordScore(blob) {
      const norm = _kwNorm(blob);
      if (_KW_HIGH_RE.test(norm)) return 0.15;
      if (_KW_MED_RE.test(norm))  return 0.08;
      if (_KW_LOW_RE.test(norm))  return 0.03;
      return 0;
    }

    function hasSchemaOrgComment(el) {
      if (!el) return false;
      const itemtype = (el.getAttribute?.('itemtype') || '').toLowerCase();
      const text = el.innerHTML?.slice(0, 500) || '';
      return itemtype.includes('comment') ||
             itemtype.includes('review') ||
             text.includes('schema.org/Comment') ||
             text.includes('schema.org/Review');
    }

    function hasAriaRoleFeed(el) {
      return el?.getAttribute?.('role') === 'feed';
    }

    function hasAriaRoleComment(el) {
      return el?.getAttribute?.('role') === 'comment';
    }

    function _heurSig(el) {
      const tag = (el.tagName || 'unknown').toLowerCase();
      const childTags = Array.from(el.children).map(c => (c.tagName||'?').toLowerCase()).sort();
      return `${tag}[${childTags.join(',')}]`;
    }

    function getRepeatedUnits(el) {
      if (!el || !el.children) return [];
      const children = Array.from(el.children);
      if (children.length < 3) return [];
      // Group by structural signature (tag + sorted child tags) — matches server logic.
      const sigGroups = new Map();
      for (const child of children) {
        const sig = _heurSig(child);
        if (!sigGroups.has(sig)) sigGroups.set(sig, []);
        sigGroups.get(sig).push(child);
      }
      const dominant = [...sigGroups.values()].sort((a, b) => b.length - a.length)[0];
      return dominant && dominant.length >= 3 ? dominant : [];
    }

    function countUnitsWith(units, predicate) {
      return units.filter(predicate).length;
    }

    function hasTimeSignal(el) {
      if (!el) return false;
      const text = shadowAwareTextContent(el);
      const attrs = getAttributeBlob(el);
      return TS_RELATIVE.test(text) ||
             TS_ABSOLUTE.test(text) ||
             shadowAwareQuerySelector(el, 'time[datetime]') !== null ||
             /data-(time|date|timestamp|created|epoch)/i.test(attrs);
    }

    function hasAuthorSignal(el) {
      if (!el) return false;
      const blob = getAttributeBlob(el);
      if (AUTHOR_MARKERS.test(blob)) return true;
      if (shadowAwareQuerySelector(el, '[itemprop="author"],[rel="author"]') !== null) return true;
      // BEM / utility class patterns — catches commentItem__username, user-name, handle, etc.
      // without matching the unit element's own class (which is checked via blob above).
      return shadowAwareQuerySelector(
        el, '[class*="username"],[class*="author"],[class*="commenter"],[class*="handle"]'
      ) !== null;
    }

    function hasReplyAction(el) {
      if (!el) return false;
      const buttons = shadowAwareQuerySelectorAll(el, 'button, [role="button"], a');
      return buttons.some(b => REPLY_ACTIONS.test(b.textContent || b.getAttribute?.('aria-label') || ''));
    }

    function hasAvatarSignal(el) {
      if (!el) return false;
      // <img> with avatar/profile in its attributes (most sites)
      const imgs = shadowAwareQuerySelectorAll(el, 'img');
      if (imgs.some(img => /avatar|profile|user.?photo|headshot/i.test(getAttributeBlob(img)))) {
        return true;
      }
      // CSS background-image avatars (e.g. SoundCloud uses <span style="background-image:…">
      // with aria-label="Username's avatar" — no <img> tag at all).
      return shadowAwareQuerySelector(
        el, '[aria-label*="avatar"],[class*="avatar"],[class*="profile-pic"]'
      ) !== null;
    }

    function hasNearbyComposer(el) {
      if (!el) return false;
      // Check next/prev siblings and parent for textarea/contenteditable
      const parent = el.parentElement;
      if (!parent) return false;
      const siblings = Array.from(parent.children);
      const idx = siblings.indexOf(el);
      const nearby = [
        ...siblings.slice(Math.max(0, idx - 2), idx),
        ...siblings.slice(idx + 1, idx + 3),
        parent,
      ];
      return nearby.some(n =>
        shadowAwareQuerySelector(n, 'textarea, [contenteditable="true"]') !== null ||
        n.tagName === 'TEXTAREA' ||
        n.getAttribute?.('contenteditable') === 'true'
      );
    }

    function isTableStructure(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'table' || tag === 'tbody' || tag === 'tr' ||
             el.querySelector?.('tr') !== null;
    }

    function normalizeCategoryValue(value) {
      const text = String(value || '').trim();
      return text || '__missing__';
    }

    function vectorizeFeatureValues(featureValues, runtime) {
      const vectorizer = runtime?.vectorizer || {};
      const vector = new Array(Number(vectorizer.dimension) || 0).fill(0);

      for (const descriptor of (vectorizer.descriptors || [])) {
        if (descriptor.type === 'number') {
          const stats = vectorizer.numericStats?.[descriptor.feature_key] || { mean: 0, std: 1 };
          const raw = Number(featureValues?.[descriptor.feature_key]) || 0;
          vector[descriptor.index] = (raw - stats.mean) / (stats.std || 1);
          continue;
        }

        if (descriptor.type === 'boolean') {
          vector[descriptor.index] = featureValues?.[descriptor.feature_key] ? 1 : 0;
          continue;
        }

        if (descriptor.type === 'categorical') {
          const categoryValue = normalizeCategoryValue(featureValues?.[descriptor.feature_key]);
          vector[descriptor.index] = categoryValue === descriptor.category ? 1 : 0;
        }
      }

      return vector;
    }

    function predictRuntimeProbability(runtime, featureValues) {
      const vector = vectorizeFeatureValues(featureValues, runtime);
      const weights = runtime?.model?.weights || [];
      let logit = Number(runtime?.model?.bias) || 0;

      for (let i = 0; i < vector.length; i += 1) {
        logit += (vector[i] || 0) * (Number(weights[i]) || 0);
      }

      return 1 / (1 + Math.exp(-logit));
    }

    function scoreCandidateWithRuntime(candidate, domNode, extractFeatures, snapshot) {
      if (!domNode || typeof extractFeatures !== 'function') return null;
      const pseudoNode = snapshot?.nodes?.[candidate.id] || null;
      const featureValues = extractFeatures(domNode, pseudoNode, candidate, _pageSignals || null);
      return predictRuntimeProbability(_runtimeModel, featureValues);
    }

    /**
     * Run classification on all current PseudoDOM candidate roots.
     * Updates ugcRegionMap.
     * Called at DOMContentLoaded and after significant SPA mutations.
     */
    async function classify() {
      const candidates = PseudoDOM.getCandidateRoots();
      const featureExtractor = getRuntimeFeatureExtractor();
      const useRuntime = Boolean(
        _runtimeModel?.model?.weights &&
        _runtimeModel?.vectorizer?.descriptors &&
        featureExtractor
      );
      let snapshot = null;

      if (useRuntime) {
        snapshot = PseudoDOM.serialize();
      }

      // Only elements scoring above HIGH_THRESHOLD (0.65) are highlight-eligible.
      // This filters out video/media lists (~0.46) which pass LOW_THRESHOLD but
      // lack the semantic signals (reply actions, author markers, timestamps) that
      // push genuine comment sections above 0.65.
      const _scoredForHighlight = [];

      for (const candidate of candidates) {
        const domNode = findDOMNodeById(candidate.id);
        let score = scoreCandidateHeuristic(candidate, domNode);

        if (useRuntime && domNode && domNode.nodeType === Node.ELEMENT_NODE) {
          try {
            const runtimeScore = scoreCandidateWithRuntime(candidate, domNode, featureExtractor, snapshot);
            if (Number.isFinite(runtimeScore)) {
              // Model is the sole source of truth when loaded — use its score directly.
              // The heuristic stays as the fallback path (useRuntime === false branch).
              score = runtimeScore;
            }
          } catch (error) {
            console.warn('[PseudoDOM Guard] Runtime scoring failed:', error?.message || error);
          }
        }

        PseudoDOM.setUGCConfidenceById(candidate.id, score);
        if (domNode) PseudoDOM.setUGCConfidence(domNode, score);

        if (domNode && score >= UGC_LOW_THRESHOLD) {
          _scoredForHighlight.push({ domNode, score });
        }

        if (score >= UGC_HIGH_THRESHOLD) {
          _sendToBackground('CANDIDATE_FEATURES', {
            candidateId:          candidate.id,
            url:                  window.location.href,
            score,
            dominantFamilySize:   candidate.dominantFamilySize,
            homogeneity:          candidate.homogeneity,
            totalChildren:        candidate.totalChildren,
            dominantTemplate:     candidate.dominantTemplate,
            capturedAt:           Date.now(),
          });
        }
      }

      // Always highlight the top pick — no popup interaction needed.
      if (_scoredForHighlight.length > 0) {
        const best = _scoredForHighlight.reduce((a, b) => b.score > a.score ? b : a);
        _applyHighlightToAll([best]);
      } else {
        _clearAllHighlights();
      }
    }

    /**
     * Locate a real DOM element corresponding to a PseudoNode id.
     */
    function findDOMNodeById(id) {
      return PseudoDOM.getLiveNode(id) || null;
    }

    function getRuntimeFeatureExtractor() {
      const runtimeExtractor = window.__PSEUDODOM_FEATURE_EXTRACTOR__;
      return runtimeExtractor && typeof runtimeExtractor.extractFeatures === 'function'
        ? runtimeExtractor.extractFeatures
        : null;
    }

    function scoreElement(el) {
      if (!el) return 0;
      const fakeCandidate = {
        dominantFamilySize: el.children ? el.children.length : 0,
        homogeneity:        0.5,
        totalChildren:      el.children ? el.children.length : 0,
      };
      return scoreCandidateHeuristic(fakeCandidate, el);
    }

    return {
      classify,
      scoreElement,
      // Exposed for eager in-wrapper promotion (§ 2.5)
      scoreDirect:   (candidate, domNode) => scoreCandidateHeuristic(candidate, domNode),
      predictDirect: (featureValues) => predictRuntimeProbability(_runtimeModel, featureValues),
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2.5 — Eager In-Wrapper Promotion
  //
  // Called synchronously AFTER reconciliation on every insertion mutation.
  // If the target element now has >= 3 structurally-similar children we run
  // the full feature extraction + model pipeline immediately — no debounce.
  // A score >= UGC_LOW_THRESHOLD lands in ugcRegionMap before the call
  // returns, so the NEXT mutation into this element is gated.
  // ═══════════════════════════════════════════════════════════════════════════

  // Tracks the dominant-group count at which we last ran feature extraction
  // for each element.  Re-evaluation is triggered whenever the count crosses
  // a new tier, so confidence rises progressively as repetitions accumulate.
  const _promotionTierMap = new Map(); // pseudoId → dominant count at last run

  // Tier thresholds that trigger a re-evaluation.
  // Each crossing brings a richer feature vector: more coverage, higher
  // dominantFamilySize, stronger min_k flags — giving the model more signal.
  const _PROMOTION_TIERS = [2, 3, 5, 8, 15];

  function _promotionTierOf(count) {
    let tier = 0;
    for (const t of _PROMOTION_TIERS) {
      if (count >= t) tier = t;
    }
    // Above the last explicit tier, re-evaluate every 10 additional units.
    if (count > _PROMOTION_TIERS[_PROMOTION_TIERS.length - 1]) {
      tier = _PROMOTION_TIERS[_PROMOTION_TIERS.length - 1] +
        Math.floor((count - _PROMOTION_TIERS[_PROMOTION_TIERS.length - 1]) / 10) * 10;
    }
    return tier;
  }

  function _tryEagerPromotion(domNode) {
    try {
      if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) return;
      if (domNode.children.length < 2) return;

      // Compute structural groups: require >= 2 children sharing a signature.
      const sigGroups = new Map();
      for (const child of domNode.children) {
        const tag = (child.tagName || '?').toLowerCase();
        const childTags = Array.from(child.children)
          .map(c => (c.tagName || '?').toLowerCase()).sort();
        const sig = `${tag}[${childTags.join(',')}]`;
        if (!sigGroups.has(sig)) sigGroups.set(sig, []);
        sigGroups.get(sig).push(child);
      }
      const dominant = [...sigGroups.values()].sort((a, b) => b.length - a.length)[0];
      if (!dominant || dominant.length < 2) return;

      // Only re-run when the repetition count has crossed into a new tier.
      // This means confidence rises progressively: score at 3 units < score
      // at 5 < score at 8 < score at 15, as the feature vector fills in.
      const pseudoId = PseudoDOM.nodeId(domNode);
      const currentTier = _promotionTierOf(dominant.length);
      const lastTier    = _promotionTierOf(_promotionTierMap.get(pseudoId) || 0);
      if (currentTier <= lastTier) return; // same tier — nothing new to learn
      _promotionTierMap.set(pseudoId, dominant.length);

      // Ensure this element is registered — handles lazy-loaded containers
      // (e.g. YouTube's #contents) that were created without going through
      // document.createElement or seedFromLiveDOM.
      if (!PseudoDOM.nodes.has(pseudoId)) {
        PseudoDOM.ensureNode(domNode, 'eagerPromotion', domNode.parentElement);
      }
      const pseudoNode = PseudoDOM.nodes.get(pseudoId) || null;
      const candidate = {
        id:                 pseudoId,
        node:               pseudoNode,
        dominantFamilySize: dominant.length,
        dominantTemplate:   null,
        totalChildren:      domNode.children.length,
        homogeneity:        dominant.length / domNode.children.length,
        mutationActivity:   PseudoDOM.mutationActivity.get(pseudoId) || 0,
      };

      // Full pipeline: feature extractor → ML model → score.
      // Falls back to heuristic when model or extractor not yet loaded.
      const featureExtractor = window.__PSEUDODOM_FEATURE_EXTRACTOR__?.extractFeatures;
      let score;

      const hScore = HeuristicClassifier.scoreDirect(candidate, domNode);

      if (typeof featureExtractor === 'function') {
        const featureValues = featureExtractor(
          domNode, pseudoNode, candidate, _pageSignals || null
        );
        if (_runtimeModel?.model?.weights && _runtimeModel?.vectorizer?.descriptors) {
          // Model is authoritative — same policy as classify().
          score = HeuristicClassifier.predictDirect(featureValues);
        } else {
          score = hScore;
        }
      } else {
        score = hScore;
      }

      if (Number.isFinite(score) && score >= UGC_LOW_THRESHOLD) {
        PseudoDOM.setUGCConfidenceById(pseudoId, score);
        PseudoDOM.setUGCConfidence(domNode, score);
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3 — XSS Security Precheck
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * SecurityGate
   *
   * Evaluates content being inserted into a UGC region.
   * Returns a verdict: { safe, sanitized, blocked, reason }
   *
   * This is the heuristic implementation pending the ML classifier.
   * See paper/003_system_architecture.md §6 for the full gate design.
   */
  const SecurityGate = (function () {

    // XSS pattern detection — ordered by severity
    const PATTERNS = [
      // Script tags (definite)
      { re: /<script[\s>]/i,            severity: 'block',    reason: 'script_tag' },
      // javascript: protocol (definite)
      { re: /javascript\s*:/i,          severity: 'block',    reason: 'javascript_protocol' },
      // Event handler attributes (definite)
      { re: /\bon\w+\s*=/i,             severity: 'block',    reason: 'event_handler_attr' },
      // data: URI in src/href (high risk)
      { re: /(?:src|href)\s*=\s*["']?\s*data:/i, severity: 'block', reason: 'data_uri_sink' },
      // DOM clobbering
      { re: /\bid\s*=\s*["']?(location|document|window|__proto__|constructor)/i,
                                         severity: 'flag',    reason: 'dom_clobbering' },
      // <iframe> injection
      { re: /<iframe[\s>]/i,             severity: 'flag',    reason: 'iframe_injection' },
      // <object>/<embed>
      { re: /<(?:object|embed)[\s>]/i,   severity: 'flag',    reason: 'object_embed' },
      // SVG with onload
      { re: /<svg[^>]*\s+on\w+/i,        severity: 'flag',    reason: 'svg_event' },
      // expression() CSS (legacy IE)
      { re: /expression\s*\(/i,          severity: 'flag',    reason: 'css_expression' },
      // Template injection signals
      { re: /\{\{.*\}\}/,                severity: 'flag',    reason: 'template_injection' },
    ];

    /**
     * Check a string value (HTML or attribute) for XSS patterns.
     * Returns { safe, severity, reason }.
     */
    function checkString(value) {
      if (typeof value !== 'string') return { safe: true };
      for (const { re, severity, reason } of PATTERNS) {
        if (re.test(value)) {
          return { safe: false, severity, reason };
        }
      }
      return { safe: true };
    }

    /**
     * Check an attribute name+value pair.
     * Special attention to event handlers and dangerous href/src values.
     */
    function checkAttribute(name, value) {
      const lName = (name || '').toLowerCase().trim();

      // Any on* attribute is an event handler
      if (/^on\w+$/.test(lName)) {
        return { safe: false, severity: 'block', reason: 'event_handler_attr' };
      }

      // href / src / action / formaction / srcdoc
      if (['href','src','action','formaction','srcdoc','data'].includes(lName)) {
        const lVal = (value || '').trimStart().toLowerCase();
        if (lVal.startsWith('javascript:')) {
          return { safe: false, severity: 'block', reason: 'javascript_protocol' };
        }
        if (lVal.startsWith('data:')) {
          return { safe: false, severity: 'block', reason: 'data_uri_sink' };
        }
        if (lName === 'srcdoc') {
          return checkString(value);
        }
      }

      return { safe: true };
    }

    /**
     * Full verdict for a mutation targeting a UGC region.
     * Returns { action: 'pass'|'sanitize'|'block'|'flag', reason, value }
     */
    function verdict(type, value, attrName) {
      let check;

      if (type === 'setAttribute' || type === 'setAttributeNS') {
        check = checkAttribute(attrName, value);
      } else {
        check = checkString(value);
      }

      if (check.safe) return { action: 'pass' };

      const event = {
        url:       window.location.href,
        type,
        reason:    check.reason,
        severity:  check.severity,
        sample:    (typeof value === 'string') ? value.slice(0, 200) : null,
        timestamp: Date.now(),
      };
      _sendToBackground('SECURITY_EVENT', event);

      if (check.severity === 'block') {
        return { action: 'block', reason: check.reason };
      }
      return { action: 'flag', reason: check.reason };
    }

    return { verdict, checkString, checkAttribute };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4 — DOM API Wrappers
  //       Install wrappers in P0 → P1 priority order from
  //       paper/009_dom_mutation_api_reference.md
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Core wrapper factory.
   *
   * Wraps originalFn so that:
   *  1. PseudoDOM.record() is called with the intercepted arguments
   *  2. If the target node is in a UGC region, SecurityGate.verdict() is called
   *  3. Depending on the verdict, the original call either proceeds or is blocked
   *
   * @param {string}   mutationType  - label for PseudoDOM mutation log
   * @param {Function} originalFn    - the saved original prototype method
   * @param {Function} extractArgs   - function(thisArg, args) → { target, content, attrName }
   */
  function makeWrapper(mutationType, originalFn, extractArgs) {
    return function intercepted(...args) {
      let _target = null;
      let _isInsertion = false;
      try {
        const { target, content, attrName } = extractArgs(this, args);
        _target = target;
        _isInsertion = content !== null;

        // Always record in PseudoDOM (data collection)
        PseudoDOM.record(mutationType, target, content);

        // Security gate — only active when target is in a UGC region
        if (_isInsertion && PseudoDOM.isInUGCRegion(target)) {
          const v = SecurityGate.verdict(mutationType, content, attrName);
          if (v.action === 'block') {
            console.warn(`[PseudoDOM Guard] Blocked mutation: ${v.reason}`);
            return;
          }
        }
      } catch (e) {}

      // Reconciliation: real mutation reaches the live DOM
      const result = originalFn.apply(this, args);

      // Post-reconciliation: run full feature extraction on the target now
      // that its new child is live.  Promotes it to UGC immediately if it
      // scores above the low threshold — gates the very next mutation.
      if (_isInsertion && _target) _tryEagerPromotion(_target);

      return result;
    };
  }

  // ── 4.1 Node prototype ────────────────────────────────────────────────────

  Node.prototype.appendChild = makeWrapper(
    'appendChild', _originals.appendChild,
    (self, [child]) => ({ target: self, content: child, attrName: null })
  );

  Node.prototype.insertBefore = makeWrapper(
    'insertBefore', _originals.insertBefore,
    (self, [newNode]) => ({ target: self, content: newNode, attrName: null })
  );

  Node.prototype.replaceChild = makeWrapper(
    'replaceChild', _originals.replaceChild,
    (self, [newChild, oldChild]) => ({ target: self, content: newChild, attrName: null })
  );

  Node.prototype.removeChild = makeWrapper(
    'removeChild', _originals.removeChild,
    (self, [child]) => ({ target: self, content: null, attrName: null })
  );

  // ── 4.2 innerHTML / outerHTML setters (property-setter sinks) ─────────────

  Object.defineProperty(Element.prototype, 'innerHTML', {
    get: _originals.innerHTMLDescriptor.get,
    set: function (value) {
      try {
        PseudoDOM.record('innerHTML', this, value);
        if (PseudoDOM.isInUGCRegion(this)) {
          const v = SecurityGate.verdict('innerHTML', value, null);
          if (v.action === 'block') {
            console.warn('[PseudoDOM Guard] Blocked innerHTML:', v.reason);
            return;
          }
        }
      } catch (_) {}
      _originals.innerHTMLDescriptor.set.call(this, value);
      // Post-reconciliation: children are now live — check for eager promotion.
      _tryEagerPromotion(this);
    },
    configurable: true,
    enumerable:   true,
  });

  Object.defineProperty(Element.prototype, 'outerHTML', {
    get: _originals.outerHTMLDescriptor.get,
    set: function (value) {
      try {
        PseudoDOM.record('outerHTML', this, value);
        if (PseudoDOM.isInUGCRegion(this)) {
          const v = SecurityGate.verdict('outerHTML', value, null);
          if (v.action === 'block') {
            console.warn('[PseudoDOM Guard] Blocked outerHTML:', v.reason);
            return;
          }
        }
      } catch (_) {}
      _originals.outerHTMLDescriptor.set.call(this, value);
      // outerHTML replaces the element itself — check its new parent.
      _tryEagerPromotion(this.parentElement);
    },
    configurable: true,
    enumerable:   true,
  });

  // ── 4.3 insertAdjacentHTML (critical HTML string sink) ────────────────────

  Element.prototype.insertAdjacentHTML = function (position, html) {
    try {
      PseudoDOM.record('insertAdjacentHTML', this, html);
      if (PseudoDOM.isInUGCRegion(this)) {
        const v = SecurityGate.verdict('insertAdjacentHTML', html, null);
        if (v.action === 'block') {
          console.warn('[PseudoDOM Guard] Blocked insertAdjacentHTML:', v.reason);
          return;
        }
      }
    } catch (_) {}
    const result = _originals.insertAdjacentHTML.call(this, position, html);
    // afterbegin/beforeend add children to `this`; beforebegin/afterend add
    // siblings so the relevant container is the parent.
    const target = (position === 'beforebegin' || position === 'afterend')
      ? this.parentElement : this;
    _tryEagerPromotion(target);
    return result;
  };

  // ── 4.4 setAttribute family ───────────────────────────────────────────────

  Element.prototype.setAttribute = function (name, value) {
    try {
      PseudoDOM.updateAttribute(this, name, value);
      if (PseudoDOM.isInUGCRegion(this)) {
        const v = SecurityGate.verdict('setAttribute', value, name);
        if (v.action === 'block') {
          console.warn(`[PseudoDOM Guard] Blocked setAttribute(${name}):`, v.reason);
          return;
        }
      }
    } catch (_) {}
    return _originals.setAttribute.call(this, name, value);
  };

  Element.prototype.setAttributeNS = function (ns, name, value) {
    try {
      PseudoDOM.updateAttribute(this, name, value);
      if (PseudoDOM.isInUGCRegion(this)) {
        const v = SecurityGate.verdict('setAttributeNS', value, name);
        if (v.action === 'block') {
          console.warn(`[PseudoDOM Guard] Blocked setAttributeNS(${name}):`, v.reason);
          return;
        }
      }
    } catch (_) {}
    return _originals.setAttributeNS.call(this, ns, name, value);
  };

  Element.prototype.setAttributeNode = function (attr) {
    try {
      if (attr) PseudoDOM.updateAttribute(this, attr.name, attr.value);
      if (PseudoDOM.isInUGCRegion(this) && attr) {
        const v = SecurityGate.verdict('setAttributeNode', attr.value, attr.name);
        if (v.action === 'block') {
          console.warn(`[PseudoDOM Guard] Blocked setAttributeNode(${attr.name}):`, v.reason);
          return null;
        }
      }
    } catch (_) {}
    return _originals.setAttributeNode.call(this, attr);
  };

  Element.prototype.setAttributeNodeNS = function (attr) {
    try {
      if (attr) PseudoDOM.updateAttribute(this, attr.name, attr.value);
      if (PseudoDOM.isInUGCRegion(this) && attr) {
        const v = SecurityGate.verdict('setAttributeNodeNS', attr.value, attr.name);
        if (v.action === 'block') {
          console.warn(`[PseudoDOM Guard] Blocked setAttributeNodeNS(${attr.name}):`, v.reason);
          return null;
        }
      }
    } catch (_) {}
    return _originals.setAttributeNodeNS.call(this, attr);
  };

  Element.prototype.removeAttribute = function (name) {
    try {
      PseudoDOM.removeAttributeRecord(this, name);
    } catch (_) {}
    return _originals.removeAttribute.call(this, name);
  };

  Element.prototype.removeAttributeNS = function (ns, name) {
    try {
      PseudoDOM.removeAttributeRecord(this, name);
    } catch (_) {}
    return _originals.removeAttributeNS.call(this, ns, name);
  };

  Element.prototype.removeAttributeNode = function (attr) {
    try {
      if (attr) PseudoDOM.removeAttributeRecord(this, attr.name);
    } catch (_) {}
    return _originals.removeAttributeNode.call(this, attr);
  };

  // ── 4.5 Multi-node insertion methods ─────────────────────────────────────

  Element.prototype.insertAdjacentElement = makeWrapper(
    'insertAdjacentElement', _originals.insertAdjacentElement,
    (self, [, element]) => ({ target: self, content: element, attrName: null })
  );

  Element.prototype.append = function (...nodesOrStrings) {
    for (const item of nodesOrStrings) {
      try {
        PseudoDOM.record('append', this, item);
        if (typeof item === 'string' && PseudoDOM.isInUGCRegion(this)) {
          const v = SecurityGate.verdict('append', item, null);
          if (v.action === 'block') return;
        }
      } catch (_) {}
    }
    return _originals.append.apply(this, nodesOrStrings);
  };

  Element.prototype.prepend = function (...nodesOrStrings) {
    for (const item of nodesOrStrings) {
      try {
        PseudoDOM.record('prepend', this, item);
        if (typeof item === 'string' && PseudoDOM.isInUGCRegion(this)) {
          const v = SecurityGate.verdict('prepend', item, null);
          if (v.action === 'block') return;
        }
      } catch (_) {}
    }
    return _originals.prepend.apply(this, nodesOrStrings);
  };

  Element.prototype.after = makeWrapper(
    'after', _originals.after,
    (self, args) => ({ target: self, content: args[0] || null, attrName: null })
  );

  Element.prototype.before = makeWrapper(
    'before', _originals.before,
    (self, args) => ({ target: self, content: args[0] || null, attrName: null })
  );

  Element.prototype.replaceWith = makeWrapper(
    'replaceWith', _originals.replaceWith,
    (self, args) => ({ target: self, content: args[0] || null, attrName: null })
  );

  Element.prototype.replaceChildren = function (...nodesOrStrings) {
    try {
      PseudoDOM.record('replaceChildren', this, nodesOrStrings[0] || null);
    } catch (_) {}
    return _originals.replaceChildren.apply(this, nodesOrStrings);
  };

  Element.prototype.remove = function () {
    try {
      PseudoDOM.record('remove', this, null);
    } catch (_) {}
    return _originals.remove.call(this);
  };

  // ── 4.6 attachShadow — re-wrap APIs on every new shadow root ─────────────

  Element.prototype.attachShadow = function (init) {
    const shadowRoot = _originals.attachShadow.call(this, init);
    try {
      PseudoDOM.registerShadowRoot(this, shadowRoot, init.mode);
      // The ShadowRoot inherits Element.prototype methods already wrapped above.
      // We additionally wrap shadowRoot.innerHTML which lives on ShadowRoot.prototype.
      const srInnerHTMLDesc = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(shadowRoot), 'innerHTML'
      );
      if (srInnerHTMLDesc && srInnerHTMLDesc.set !== undefined) {
        Object.defineProperty(shadowRoot, 'innerHTML', {
          get: srInnerHTMLDesc.get,
          set: function (value) {
            try {
              PseudoDOM.record('innerHTML', this, value);
              if (PseudoDOM.isInUGCRegion(this)) {
                const v = SecurityGate.verdict('innerHTML', value, null);
                if (v.action === 'block') {
                  console.warn('[PseudoDOM Guard] Blocked shadowRoot.innerHTML:', v.reason);
                  return;
                }
              }
            } catch (_) {}
            srInnerHTMLDesc.set.call(this, value);
          },
          configurable: true,
        });
      }
    } catch (_) {}
    return shadowRoot;
  };

  // ── 4.7 Document mutation APIs ────────────────────────────────────────────

  Document.prototype.write = function (markup) {
    try {
      PseudoDOM.record('documentWrite', this, markup);
      const v = SecurityGate.verdict('documentWrite', markup, null);
      if (v.action === 'block') {
        console.warn('[PseudoDOM Guard] Blocked document.write:', v.reason);
        return;
      }
    } catch (_) {}
    return _originals.docWrite.call(this, markup);
  };

  Document.prototype.writeln = function (markup) {
    try {
      PseudoDOM.record('documentWrite', this, markup);
      const v = SecurityGate.verdict('documentWrite', markup, null);
      if (v.action === 'block') {
        console.warn('[PseudoDOM Guard] Blocked document.writeln:', v.reason);
        return;
      }
    } catch (_) {}
    return _originals.docWriteln.call(this, markup);
  };

  Document.prototype.createElement = function (tagName, options) {
    const el = _originals.createElement.call(this, tagName, options);
    try {
      PseudoDOM.record('createElement', this, el);
    } catch (_) {}
    return el;
  };

  Document.prototype.createElementNS = function (ns, qualifiedName) {
    const el = _originals.createElementNS.call(this, ns, qualifiedName);
    try {
      PseudoDOM.record('createElement', this, el);
    } catch (_) {}
    return el;
  };

  Document.prototype.createTextNode = function (data) {
    return _originals.createTextNode.call(this, data);
  };

  Document.prototype.createDocumentFragment = function () {
    const frag = _originals.createDocumentFragment.call(this);
    try {
      PseudoDOM.record('createDocumentFragment', this, frag);
    } catch (_) {}
    return frag;
  };

  Document.prototype.importNode = function (externalNode, deep) {
    const imported = _originals.importNode.call(this, externalNode, deep);
    try {
      PseudoDOM.record('importNode', this, imported);
    } catch (_) {}
    return imported;
  };

  Document.prototype.adoptNode = function (externalNode) {
    const adopted = _originals.adoptNode.call(this, externalNode);
    try {
      PseudoDOM.record('adoptNode', this, adopted);
    } catch (_) {}
    return adopted;
  };

  // ── 4.8 Range APIs ────────────────────────────────────────────────────────

  Range.prototype.insertNode = makeWrapper(
    'rangeInsertNode', _originals.rangeInsertNode,
    (self, [node]) => ({ target: self.startContainer || document, content: node, attrName: null })
  );

  Range.prototype.createContextualFragment = function (fragment) {
    try {
      PseudoDOM.record('createContextualFragment', document, fragment);
      const v = SecurityGate.verdict('createContextualFragment', fragment, null);
      if (v.action === 'block') {
        console.warn('[PseudoDOM Guard] Blocked createContextualFragment:', v.reason);
        // Return empty fragment instead of blocking entirely
        return _originals.createDocumentFragment.call(document);
      }
    } catch (_) {}
    return _originals.rangeCreateContextual.call(this, fragment);
  };

  // ── 4.9 Specific element property setters ─────────────────────────────────

  // HTMLScriptElement.src
  const _scriptSrcSet = _originals.scriptSrcDescriptor?.set;
  if (_scriptSrcSet) {
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
      get: _originals.scriptSrcDescriptor.get,
      set: function (value) {
        try {
          const v = SecurityGate.verdict('scriptSrc', value, 'src');
          if (v.action === 'block') {
            console.warn('[PseudoDOM Guard] Blocked script.src:', v.reason);
            return;
          }
        } catch (_) {}
        _scriptSrcSet.call(this, value);
      },
      configurable: true,
    });
  }

  // HTMLScriptElement.text
  const _scriptTextSet = _originals.scriptTextDescriptor?.set;
  if (_scriptTextSet) {
    Object.defineProperty(HTMLScriptElement.prototype, 'text', {
      get: _originals.scriptTextDescriptor.get,
      set: function (value) {
        try {
          PseudoDOM.record('scriptText', this, value);
        } catch (_) {}
        _scriptTextSet.call(this, value);
      },
      configurable: true,
    });
  }

  // HTMLIFrameElement.srcdoc
  const _iframeSrcdocSet = _originals.iframeSrcdocDescriptor?.set;
  if (_iframeSrcdocSet) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
      get: _originals.iframeSrcdocDescriptor.get,
      set: function (value) {
        try {
          PseudoDOM.record('iframeSrcdoc', this, value);
          const v = SecurityGate.verdict('iframeSrcdoc', value, 'srcdoc');
          if (v.action === 'block') {
            console.warn('[PseudoDOM Guard] Blocked iframe.srcdoc:', v.reason);
            return;
          }
        } catch (_) {}
        _iframeSrcdocSet.call(this, value);
      },
      configurable: true,
    });
  }

  // HTMLIFrameElement.src — guard javascript: scheme
  const _iframeSrcSet = _originals.iframeSrcDescriptor?.set;
  if (_iframeSrcSet) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      get: _originals.iframeSrcDescriptor.get,
      set: function (value) {
        try {
          const v = SecurityGate.verdict('iframeSrc', value, 'src');
          if (v.action === 'block') {
            console.warn('[PseudoDOM Guard] Blocked iframe.src:', v.reason);
            return;
          }
        } catch (_) {}
        _iframeSrcSet.call(this, value);
      },
      configurable: true,
    });
  }

  // ── 4.10 eval and dynamic script execution ────────────────────────────────

  window.eval = function (code) {
    try {
      const v = SecurityGate.verdict('eval', code, null);
      if (v.action === 'block') {
        console.warn('[PseudoDOM Guard] Blocked eval:', v.reason);
        return undefined;
      }
    } catch (_) {}
    return _originals._eval.call(this, code);
  };

  // setTimeout / setInterval — block string-form invocations in UGC contexts
  window.setTimeout = function (handler, delay, ...args) {
    if (typeof handler === 'string') {
      try {
        const v = SecurityGate.verdict('setTimeout', handler, null);
        if (v.action === 'block') {
          console.warn('[PseudoDOM Guard] Blocked setTimeout(string):', v.reason);
          return 0;
        }
      } catch (_) {}
    }
    return _originals._setTimeout.call(window, handler, delay, ...args);
  };

  window.setInterval = function (handler, delay, ...args) {
    if (typeof handler === 'string') {
      try {
        const v = SecurityGate.verdict('setInterval', handler, null);
        if (v.action === 'block') {
          console.warn('[PseudoDOM Guard] Blocked setInterval(string):', v.reason);
          return 0;
        }
      } catch (_) {}
    }
    return _originals._setInterval.call(window, handler, delay, ...args);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5 — Lifecycle Hooks
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * DOMContentLoaded: seed PseudoDOM from live DOM (SSR pages), then
   * run initial UGC classification.
   */
  document.addEventListener('DOMContentLoaded', () => {
    PseudoDOM.seedFromLiveDOM();
    void HeuristicClassifier.classify();

    // Export PseudoDOM snapshot to background for data collection
    _sendToBackground('PSEUDO_DOM_SNAPSHOT', PseudoDOM.serialize());
  });

  /**
   * MutationObserver: supplementary post-mutation region tracking.
   * Used to detect new UGC regions that emerge during SPA transitions.
   * Does NOT block mutations — that is the prototype wrapper's job.
   */
  const _observer = new MutationObserver((_mutations) => {
    let needsReclassify = false;
    for (const m of _mutations) {
      if (m.addedNodes.length > 0) {
        needsReclassify = true;
        break;
      }
    }
    if (needsReclassify) {
      // Debounce: wait for burst to settle before re-classifying
      clearTimeout(_observer._timer);
      _observer._timer = setTimeout(() => {
        void HeuristicClassifier.classify();
      }, 300);
    }
  });

  _observer.observe(document.documentElement, {
    childList: true,
    subtree:   true,
  });

  /**
   * SPA navigation detection.
   *
   * React / Vue / TikTok / Facebook all navigate via history.pushState or
   * history.replaceState without a full page reload.  The MutationObserver
   * above catches the DOM churn, but comment sections often load lazily
   * 400–800 ms after the URL changes.  We therefore:
   *   1. Detect the URL change immediately and clear the stale highlight.
   *   2. Re-classify after 700 ms — long enough for the new content to
   *      render, short enough to feel instant.
   */
  // Shared debounce for all signal-driven classify() invocations.
  // PAGE_SIGNALS, RUNTIME_MODEL, and FEATURE_EXTRACTOR_READY can all arrive
  // within milliseconds of each other on page load — coalescing them into one
  // classify() run prevents stacked calls each briefly highlighting different elements.
  let _classifyTimer = null;
  function _scheduleClassify(delay) {
    clearTimeout(_classifyTimer);
    _classifyTimer = setTimeout(() => void HeuristicClassifier.classify(), delay || 80);
  }

  let _lastHref = window.location.href;
  let _navTimer  = null;

  function _onNavigation() {
    const href = window.location.href;
    if (href === _lastHref) return;
    _lastHref = href;
    _clearAllHighlights();
    clearTimeout(_navTimer);
    clearTimeout(_classifyTimer); // cancel any in-flight classify from the old page
    _navTimer = setTimeout(() => {
      PseudoDOM.seedFromLiveDOM();
      _scheduleClassify(0); // run immediately after seed; debounce still guards against
    }, 700);                // late-arriving RUNTIME_MODEL / PAGE_SIGNALS on the new page
  }

  // Wrap pushState / replaceState — captured before any page script runs.
  const _origPushState    = history.pushState.bind(history);
  const _origReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _origPushState(...args);
    _onNavigation();
  };

  history.replaceState = function (...args) {
    _origReplaceState(...args);
    _onNavigation();
  };

  // Back / forward button navigation.
  window.addEventListener('popstate',   _onNavigation);
  window.addEventListener('hashchange', _onNavigation);

  // ═══════════════════════════════════════════════════════════════════════════
  // § 6 — Background Communication
  // ═══════════════════════════════════════════════════════════════════════════

  function _sendToBackground(type, payload) {
    window.postMessage({ __pseudodom: true, type, payload }, '*');
  }

  let _pageSignals = null;
  let _runtimeModel = null;

  // Listen for page signals and runtime model pushes from content_bridge.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data?.__pseudodom || !event.data.__push) return;

    if (event.data.type === 'PAGE_SIGNALS') {
      _pageSignals = event.data.payload || null;
      _scheduleClassify();
      return;
    }

    if (event.data.type === 'RUNTIME_MODEL') {
      _runtimeModel = event.data.payload || null;
      _scheduleClassify();
      return;
    }

    if (event.data.type === 'HIGHLIGHT_CANDIDATE') {
      const el = PseudoDOM.getLiveNode(event.data.payload?.id);
      if (el && el.nodeType === Node.ELEMENT_NODE) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        _applyHighlight(el);
      }
      return;
    }

    if (event.data.type === 'HIGHLIGHT_MODE') {
      _highlightMode = Boolean(event.data.payload?.enabled);
      if (!_highlightMode) _clearAllHighlights();
      else _scheduleClassify();
      return;
    }

    if (event.data.type === 'CANDIDATE_JSON') {
      _handleCandidateJson(event.data.payload?.selectors || []);
      return;
    }

    if (event.data.type === 'FEATURE_EXTRACTOR_READY') {
      _scheduleClassify();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // § 7 — Debug / Development Helpers (stripped in production build)
  // ═══════════════════════════════════════════════════════════════════════════

  window.__PSEUDODOM_DEBUG = {
    ...(typeof window.__PSEUDODOM_DEBUG === 'object' && window.__PSEUDODOM_DEBUG
      ? window.__PSEUDODOM_DEBUG
      : {}),
    getPseudoDOM:   () => PseudoDOM.serialize(),
    getCandidates:  () => PseudoDOM.getCandidateRoots(),
    reclassify:     () => HeuristicClassifier.classify(),
    checkString:    (s) => SecurityGate.checkString(s),
    checkAttribute: (n, v) => SecurityGate.checkAttribute(n, v),
    pageSignals:    () => _pageSignals,
    runtimeModel:   () => _runtimeModel,
    featureExtractorReady: () => Boolean(window.__PSEUDODOM_FEATURE_EXTRACTOR__?.extractFeatures),
  };

  _sendToBackground('WRAPPER_READY', { ready: true });

})(); // end PseudoDOMGuard IIFE
