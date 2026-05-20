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

    /***
     * nodeId(node)
     *
     * WHY THIS EXISTS:
     * We need a stable, string ID for every DOM node so we can store and
     * look up nodes inside plain JavaScript Maps and objects (which only
     * support string keys). Real DOM nodes are objects, not strings, so we
     * cannot use them as Map keys directly in a way that survives serialization.
     *
     * HOW IT WORKS:
     * We use a WeakMap (nodeIdMap) that maps each DOM Node object → a unique
     * string like "pn_0", "pn_1", "pn_42". WeakMap is used intentionally:
     * it holds its key references WEAKLY, meaning if the real DOM node is
     * garbage-collected by the browser, the entry in the WeakMap is also
     * automatically cleaned up — we never cause a memory leak by keeping nodes
     * alive longer than needed.
     *
     * The first time we see a new node we assign the next sequential ID and
     * store it. Subsequent calls with the same node just return the stored ID.
     *
     * @param {Node} node - any DOM node (Element, TextNode, ShadowRoot, etc.)
     * @returns {string|null} a stable string ID like "pn_42", or null if node is falsy
     */
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

    /***
     * ensureNode(domNode, mutationType, parentDomNode)
     *
     * WHY THIS EXISTS:
     * Every time any page script touches the DOM (via appendChild, innerHTML, etc.),
     * our wrapper intercepts the call and needs to record that node in the PseudoDOM
     * mirror. This function is the "register if not already known" gate — it checks
     * whether we already have a PseudoNode for this real DOM node, and if not, it
     * creates one and populates all its fields from the live node.
     *
     * We explicitly skip TEXT_NODE (nodeType === 3) because text nodes contain the
     * raw visible content ("Hello world") but no structural information. The feature
     * model cares about the shape of the element tree (tags, attributes, nesting),
     * not the actual text values — so tracking text nodes would bloat the PseudoDOM
     * without adding signal.
     *
     * FIELDS RECORDED:
     * - tag: lowercase tag name (e.g. "div", "li", "article")
     * - attributes: Map of name → value, snapshotted at the moment of first insertion
     *   (the wrapper keeps this in sync via updateAttribute / removeAttributeRecord)
     * - textContent: only recorded for LEAF nodes (no children) — avoids duplicating
     *   text that will be captured through child nodes anyway
     * - depth: how many ancestors this node has (root = 0, child of root = 1, etc.)
     * - insertedAt: performance.now() timestamp in milliseconds — used for ordering
     *   and potential future time-series analysis
     * - mutationType: what API call caused this node to appear (e.g. "appendChild",
     *   "innerHTML", "initialParse") — useful for debugging and for the training dataset
     * - frameUrl: the URL of the frame this node belongs to — matters for multi-frame
     *   pages like YouTube where comments might load in a child frame
     *
     * @param {Node}   domNode       - the real DOM node to register
     * @param {string} mutationType  - label for what API call triggered this (for logging)
     * @param {Node}   parentDomNode - the node's parent (used to compute parentId and depth)
     * @returns {string|null} the PseudoNode ID, or null if this node type is not tracked
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

    /***
     * computeDepth(parentId)
     *
     * WHY THIS EXISTS:
     * Depth is a key structural feature for the UGC model. Shallow nodes (depth 1–3)
     * are typically page-level containers (header, main, aside). Nodes at depth 4–8
     * are the sweet spot where comment list containers tend to live. Very deep nodes
     * (depth 10+) are usually individual comment fields or decorative elements deep
     * inside each comment unit.
     *
     * We compute depth incrementally: when a node is registered via ensureNode(),
     * its parent already exists in the Map (it was registered first, since the DOM
     * is built top-down), so we just read the parent's depth and add 1. This is O(1)
     * and avoids walking the whole ancestor chain on every insertion.
     *
     * WHY NOT USE THE REAL DOM?
     * We could call domNode.parentElement repeatedly to count ancestors, but that
     * ties us to the live DOM state which changes. Using the PseudoDOM's own stored
     * depth means depth is recorded at the moment of insertion and is stable even
     * after the live DOM is modified later.
     *
     * @param {string|null} parentId - the PseudoNode ID of the parent (null = root)
     * @returns {number} 0 for root nodes, parent.depth + 1 for all others
     */
    function computeDepth(parentId) {
      if (!parentId) return 0;
      const parent = nodes.get(parentId);
      return parent ? parent.depth + 1 : 0;
    }

    /***
     * record(type, targetDomNode, insertedNodeOrString, removedDomNode)
     *
     * WHY THIS EXISTS:
     * This is the central write gate for the PseudoDOM. Every single DOM mutation
     * that our wrappers intercept — appendChild, innerHTML =, insertAdjacentHTML,
     * removeChild, etc. — flows through here. It does two things:
     *   1. Mirrors the structural change in our PseudoDOM node tree (parent/children)
     *   2. Appends a timestamped mutation entry to the ordered `mutations` log
     *
     * WHY SPLIT STRING VS NODE?
     * There are two fundamentally different kinds of DOM mutations:
     *
     *   - NODE-BASED: The page calls appendChild(someElement). We already have a
     *     real DOM node object. We call ensureNode() to register it, then attach it
     *     as a child of the target in our tree.
     *
     *   - STRING-BASED: The page sets innerHTML = '<div>...</div>'. The browser
     *     parses the string into DOM nodes internally — we never see the individual
     *     nodes being created. Instead we have the raw HTML string. We call
     *     parseHTMLString() which uses a sandboxed DOMParser to build a parallel
     *     subtree in the PseudoDOM from the string, WITHOUT letting that string touch
     *     the real DOM until AFTER the security check.
     *
     * MUTATION ACTIVITY COUNTER:
     * Every time a node receives children via record(), we increment _mutationActivity
     * for that node's ID. This counter is used by getCandidateRoots() to boost
     * containers that receive many dynamically-injected children (e.g. a SPA loading
     * new comments one by one). Static HTML pages score 0 activity; live comment
     * feeds can score 50+. This is a strong signal for UGC regions.
     *
     * @param {string}         type                  - mutation type label
     * @param {Node}           targetDomNode         - the node being mutated
     * @param {Node|string}    insertedNodeOrString  - new child node OR raw HTML string (or null)
     * @param {Node}           [removedDomNode]      - node being removed (for replaceChild, removeChild)
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

    /***
     * parseHTMLString(htmlString, parentId, mutationType)
     *
     * WHY THIS EXISTS:
     * When a page script does something like:
     *   element.innerHTML = '<div class="comment"><span>Alice</span>...</div>';
     * ...the browser receives a raw HTML string and parses it into real DOM nodes
     * internally. We intercept the string BEFORE it reaches the browser, but to
     * mirror its structure in the PseudoDOM, we need to parse the HTML ourselves.
     *
     * WHY A SANDBOXED DOMParser?
     * We use `new DOMParser()` (captured as _originals.DOMParser at startup) to
     * parse the string into a separate, isolated document — not the real page DOM.
     * This means the parsed HTML cannot execute scripts, cannot trigger network
     * requests, and cannot fire any events on the live page. It is purely a
     * structural analysis tool. We walk its `.body.childNodes`, build PseudoNodes
     * for each element, and then discard the sandbox document.
     *
     * The XSS SecurityGate check happens BEFORE the string reaches this function
     * and BEFORE the original DOM API is called, so even if the string contains
     * malicious HTML, the sandboxed parse is inert and the block will have already
     * happened in the wrapper (see makeWrapper / the innerHTML setter).
     *
     * WHY ONLY ELEMENT NODES?
     * We skip TEXT_NODE, COMMENT_NODE, etc. when walking body.childNodes because
     * only element nodes carry the structural shape the model needs. Raw text nodes
     * are not candidates and would just inflate the PseudoDOM.
     *
     * @param {string} htmlString   - the raw HTML string being set via innerHTML etc.
     * @param {string} parentId     - PseudoNode ID of the element that is the target
     * @param {string} mutationType - label for what triggered this parse (e.g. 'innerHTML')
     * @returns {string[]} array of root PseudoNode IDs created from the parse
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

    /***
     * importSubtree(domNode, parentId, mutationType)
     *
     * WHY THIS EXISTS:
     * parseHTMLString() gives us the root children of the parsed HTML, but a typical
     * comment unit is a TREE — e.g. a <div> containing a <header> containing an <img>
     * and a <span class="username">, then a <p class="body">, then a <footer> with
     * action buttons. We need to mirror this whole nested structure.
     *
     * importSubtree() does a depth-first recursive walk: it registers the current
     * node via ensureNode(), then recursively imports each of its children, pushing
     * their IDs into the parent's children array. The result is a faithful mirror
     * of the entire subtree in the PseudoDOM nodes Map.
     *
     * WHY RECURSION IS SAFE HERE:
     * The HTML being parsed comes from a string (innerHTML etc.) which was already
     * intercepted and will be parsed by the browser anyway. Real comment sections
     * are rarely deeper than 10–15 levels, so stack overflow is not a practical risk.
     * The try/catch in parseHTMLString catches any unexpected errors.
     *
     * @param {Node}   domNode     - the sandboxed DOM node to import
     * @param {string} parentId    - PseudoNode ID of the parent in our mirror tree
     * @param {string} mutationType - label propagated to ensureNode for the mutation log
     * @returns {string|null} the PseudoNode ID of this node, or null if not an Element
     */
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

    /***
     * seedFromLiveDOM()
     *
     * WHY THIS EXISTS:
     * Our wrappers intercept DOM mutations made by JavaScript. But many pages —
     * especially traditional server-rendered sites like Reddit (old design), news
     * sites, or WordPress blogs — deliver their comment sections as raw HTML in the
     * initial page response. The browser's own HTML parser builds the DOM from that
     * HTML BEFORE any JavaScript runs at all, which means our wrappers never see
     * those elements being created.
     *
     * seedFromLiveDOM() closes this gap: it runs a TreeWalker (a built-in DOM API
     * that efficiently visits every element in the document) and calls ensureNode()
     * on each one, building the PseudoDOM mirror from the fully-constructed live DOM.
     *
     * WHEN IT IS CALLED:
     * - At DOMContentLoaded (via _initClassify) for pages where the wrapper loaded
     *   before the DOM was ready.
     * - Immediately (with a short delay) when the wrapper loads and the DOM is
     *   already in `interactive` or `complete` state (fast-loading cached pages).
     * - After SPA navigations (_onNavigation) to catch the new page's server-
     *   rendered baseline before SPA-injected comments start arriving.
     *
     * WHY NodeFilter.SHOW_ELEMENT?
     * We only want Element nodes (divs, spans, articles, etc.) — not text nodes or
     * comments. SHOW_ELEMENT filters the walker to only visit Element nodes,
     * skipping text and other node types for efficiency.
     *
     * PARENT LINKING:
     * After ensureNode(), we read node.parentElement to find the parent's PseudoNode
     * and push this node's ID into the parent's children array. This reconstructs
     * the full parent-child relationships in our mirror tree.
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

    /***
     * registerShadowRoot(hostDomNode, shadowRoot, mode)
     *
     * WHY THIS EXISTS:
     * Shadow DOM is an encapsulation feature used heavily by web components. When a
     * page calls `element.attachShadow({ mode: 'open' })`, a new ShadowRoot is
     * created as a private sub-tree attached to that element. Unlike regular DOM
     * children, shadow roots do NOT appear in `element.children` and are not
     * reachable by normal querySelector. YouTube's comment section, for example,
     * uses deeply nested custom elements each with their own shadow roots.
     *
     * Without this function, our PseudoDOM would be completely blind to the structure
     * inside shadow roots — they would appear as leaf nodes even though they may
     * contain entire comment trees.
     *
     * This function creates a special PseudoNode tagged as '#shadow-root' with an
     * extra `isShadowRoot: true` flag. Subsequent mutations INSIDE the shadow root
     * are captured by our wrappers (because Element.prototype methods are wrapped at
     * the prototype level, and shadow root elements inherit the same prototypes), so
     * they will call record() with the shadow root as the target parent, and those
     * records will correctly link back to this '#shadow-root' PseudoNode.
     *
     * @param {Element}    hostDomNode - the element that called attachShadow()
     * @param {ShadowRoot} shadowRoot  - the newly created shadow root
     * @param {string}     mode        - 'open' or 'closed' — recorded for analysis
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

    /***
     * updateAttribute(domNode, name, value)
     *
     * WHY THIS EXISTS:
     * Attributes like `class`, `id`, `data-type`, `aria-label`, and `role` are
     * critical signals for UGC detection. A container whose class changes from
     * "comments--hidden" to "comments--visible" may have just revealed a comment
     * section. An element that gains `role="feed"` just became an ARIA-labelled feed.
     *
     * This function keeps the PseudoDOM's attribute snapshot in sync with the live
     * DOM whenever our wrapped setAttribute / setAttributeNS / setAttributeNode
     * interceptors fire. Without it, the PseudoNode's attributes Map would only
     * reflect the attributes present at the time of first insertion — stale after
     * any dynamic change.
     *
     * The value is stored as a string (or empty string if null/undefined) to match
     * how real DOM attribute values always return strings.
     *
     * @param {Element} domNode - the element whose attribute changed
     * @param {string}  name    - attribute name (e.g. 'class', 'data-comment-id')
     * @param {string}  value   - new attribute value (or null/undefined → stored as '')
     */
    function updateAttribute(domNode, name, value) {
      const id = nodeId(domNode);
      if (!id || !nodes.has(id)) return;
      nodes.get(id).attributes.set(name, value ?? '');
    }

    /***
     * removeAttributeRecord(domNode, name)
     *
     * WHY THIS EXISTS:
     * The mirror version of updateAttribute — keeps PseudoDOM accurate when
     * attributes are REMOVED via removeAttribute / removeAttributeNS /
     * removeAttributeNode. If we never called this, attributes that were
     * removed from the live DOM would linger in the PseudoNode's attributes Map
     * forever, leading to false positive keyword matches ("this element has
     * class='comment-hidden' in the PseudoDOM but it was removed from the real DOM").
     *
     * @param {Element} domNode - the element whose attribute was removed
     * @param {string}  name    - the attribute name that was removed
     */
    function removeAttributeRecord(domNode, name) {
      const id = nodeId(domNode);
      if (!id || !nodes.has(id)) return;
      nodes.get(id).attributes.delete(name);
    }

    /***
     * buildXPath(id)
     *
     * WHY THIS EXISTS:
     * XPath is a standard string representation of a node's position in a document
     * tree (e.g. "/html/body/main/section[2]/ul[1]/li[3]"). It allows any tool —
     * another browser tab, a server-side script, a test suite — to look up the exact
     * same node later, even without holding a reference to the live DOM object.
     *
     * XPaths are recorded in the training dataset snapshots sent to the background.
     * A human labeler or automated script can later use the XPath to find the same
     * element on the same page and verify whether it really was a UGC region.
     *
     * HOW IT WORKS:
     * We walk from the given PseudoNode up to the root, building path segments.
     * For each step, we look at all siblings with the same tag name and compute
     * which position (1-indexed) this node occupies among them. That gives us a
     * segment like "li[3]". Concatenating all segments from root to node gives
     * the full absolute XPath.
     *
     * NOTE: We build this from the PseudoDOM tree (parent/children links), NOT
     * from the live DOM. This means it reflects the structure as seen at the time
     * of the last seedFromLiveDOM or mutation record — which may diverge slightly
     * from the real DOM if mutations happened in unusual order.
     *
     * @param {string} id - PseudoNode ID to compute an XPath for
     * @returns {string} absolute XPath string starting with '/'
     */
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

    /***
     * wildcardXPath(id)
     *
     * WHY THIS EXISTS:
     * Every individual comment unit on a page has a unique XPath (e.g. "/body/main/ul/li[1]",
     * "/body/main/ul/li[2]", "/body/main/ul/li[3]"). But for grouping and analysis we
     * want a TEMPLATE path that says "any li directly under this ul" regardless of
     * position. That is the wildcard XPath: "/body/main/ul/li[*]".
     *
     * Wildcard XPaths are used in the training dataset to identify which template
     * the candidate belongs to, and to group structurally equivalent candidates across
     * different pages of the same site. Two pages from Reddit both produce the same
     * wildcard XPath for their comment items — that is a strong hint the model is
     * seeing the same type of UGC container.
     *
     * IMPLEMENTATION:
     * We call buildXPath first, then replace all [N] indices with [*] using a simple
     * regex. E.g. "/body/div[2]/ul/li[3]" → "/body/div[*]/ul/li[*]".
     *
     * @param {string} id - PseudoNode ID
     * @returns {string} wildcard XPath with all position indices replaced by [*]
     */
    function wildcardXPath(id) {
      return buildXPath(id).replace(/\[\d+\]/g, '[*]');
    }

    /***
     * _structSig(el)
     *
     * WHY THIS EXISTS:
     * To find candidate UGC containers, getCandidateRoots() needs to identify
     * elements whose DIRECT CHILDREN are structurally repetitive — like a list of
     * comment cards that all look the same. We need a compact "fingerprint" for
     * each child's structure so we can group them.
     *
     * The signature is: the element's tag name + a sorted list of its direct
     * children's tag names. For example, a comment card <li> containing a <div>
     * (avatar), a <p> (text), and a <footer> would have signature:
     *   "li[div,footer,p]"
     * Two comment cards built from the same template produce identical signatures.
     * A navbar item <li> containing only an <a> produces "li[a]" — different.
     *
     * WHY SORT CHILD TAGS?
     * Some frameworks render child elements in different orders depending on data.
     * Sorting makes the signature order-independent: "li[a,div,span]" matches
     * whether the <a> comes first or the <div> does, as long as the SET of child
     * tags is the same.
     *
     * WHY NOT DEEPER?
     * We only look one level deep (direct children's tag names). Going deeper would
     * make the signature too specific — two comment cards that differ only in whether
     * they have a "verified" badge nested three levels down would get different
     * signatures and not group together. One level is the right granularity.
     *
     * This function mirrors server-side structuralSignature() in commentFeatures.js
     * so that feature values computed here are comparable to those in the training data.
     *
     * @param {Element} el - a live DOM element
     * @returns {string} structural signature string like "li[div,footer,p]"
     */
    function _structSig(el) {
      const tag = (el.tagName || 'unknown').toLowerCase();
      const childTags = Array.from(el.children)
        .map(c => (c.tagName || '?').toLowerCase())
        .sort();
      return `${tag}[${childTags.join(',')}]`;
    }

    /***
     * getCandidateRoots()
     *
     * WHY THIS EXISTS:
     * This is the "candidate nomination" step. Before we can score anything with the
     * heuristic or ML model, we need a list of elements that are PLAUSIBLE UGC
     * containers — elements that have many structurally similar direct children, like
     * a comment list or feed. getCandidateRoots() does this nomination scan.
     *
     * WHY WE SCAN THE LIVE DOM (not the PseudoDOM Map):
     * When a page sets innerHTML = '...', our wrapper records the parse in the
     * PseudoDOM using sandboxed DOMParser nodes — those node OBJECTS are different
     * from the real live DOM nodes, so we can't use them to call querySelector,
     * getComputedStyle, or check real DOM state. By the time classify() runs
     * (after the debounce timer settles), all mutations have already been applied
     * to the live DOM. So we scan the live DOM directly here, knowing it is the
     * authoritative current state.
     *
     * THE ALGORITHM:
     * 1. Walk every element in the document (TreeWalker for efficiency).
     * 2. Skip elements with fewer than 3 direct children (not enough repetition).
     * 3. Group direct children by structural signature (_structSig).
     * 4. Find the "dominant" group — the signature shared by the most children.
     * 5. If the dominant group has < 3 members, skip (not repetitive enough).
     * 6. Otherwise, record this element as a candidate, compute its homogeneity
     *    (what fraction of its children share the dominant template), and ensure
     *    it has a stable PseudoNode ID in our WeakMap.
     *
     * WHY THRESHOLD OF 3?
     * Two similar items could be a coincidence. Three or more similar siblings is
     * a meaningful pattern — a comment list, a feed, a list of reviews. The UGC model
     * was trained on data where the minimum repetition count was 3.
     *
     * LIVENESS CHECK:
     * We call `liveNodeById.set(id, el)` and `ensureNode()` to make sure the stable
     * ID we assign this live element is reachable from the PseudoDOM side too. This
     * matters for classify() which needs to call setUGCConfidence(domNode) and
     * findDOMNodeById(id) after scoring.
     *
     * @returns {Array<{id, node, dominantFamilySize, dominantTemplate, totalChildren, homogeneity, mutationActivity}>}
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

    /***
     * getUGCConfidence(domNode)
     *
     * WHY THIS EXISTS:
     * After classify() scores all candidates, those scores live in ugcRegionMap
     * keyed by PseudoNode ID. This helper retrieves the stored score for a given
     * live DOM node. It is used in isInUGCRegion() and in the popup-facing
     * getCandidatesFromPage() readout.
     *
     * Returns 0 (not UGC) if the node has not been scored yet, so callers always
     * get a safe numeric value without needing to null-check.
     *
     * @param {Node} domNode - any live DOM element
     * @returns {number} the stored UGC confidence score [0–1], or 0 if unknown
     */
    function getUGCConfidence(domNode) {
      const id = nodeId(domNode);
      if (!id) return 0;
      return ugcRegionMap.get(id) || 0;
    }

    /***
     * setUGCConfidence(domNode, score)
     *
     * WHY THIS EXISTS:
     * Writes a UGC confidence score to ugcRegionMap, keyed by the given live DOM
     * node's PseudoNode ID. Called by classify() (Pass 3) after the ancestor-penalty
     * adjusted finalScores are computed. Also called by _tryEagerPromotion() when
     * synchronous per-mutation scoring promotes a new container.
     *
     * Using the WeakMap-backed nodeId() to find the ID means this function works
     * correctly even for elements that were never explicitly ensureNode()'d — the
     * WeakMap will assign a fresh ID on first access.
     *
     * @param {Node}   domNode - the live DOM element being scored
     * @param {number} score   - confidence value in [0, 1]
     */
    function setUGCConfidence(domNode, score) {
      const id = nodeId(domNode);
      if (!id) return;
      ugcRegionMap.set(id, score);
    }

    /***
     * setUGCConfidenceById(id, score)
     *
     * WHY THIS EXISTS:
     * A variant of setUGCConfidence() for cases where we only have the PseudoNode ID
     * (a string like "pn_42") but not the live DOM node reference. This happens in
     * classify() Pass 3 when iterating over candidates — the candidates list contains
     * ids from getCandidateRoots(), and we can set the score directly by ID without
     * needing to look up the live node first. Avoids the extra findDOMNodeById() call
     * when the live node lookup is deferred to later in the loop anyway.
     *
     * @param {string} id    - PseudoNode ID (e.g. "pn_42")
     * @param {number} score - confidence value in [0, 1]
     */
    function setUGCConfidenceById(id, score) {
      if (!id) return;
      ugcRegionMap.set(id, score);
    }

    /***
     * isInUGCRegion(domNode)
     *
     * WHY THIS EXISTS:
     * This is the SECURITY GATE's admission test. Before our wrappers run the XSS
     * precheck on a mutation, they first call isInUGCRegion(target) to ask: "is the
     * element being mutated inside a region we think contains user-generated content?"
     *
     * WHY ONLY CHECK UGC REGIONS?
     * Running a full XSS pattern scan on every single DOM mutation would be extremely
     * expensive — modern SPAs make hundreds of mutations per second for animations,
     * state updates, etc. We restrict the precheck to UGC regions because that is
     * where user-controlled content actually lands. Mutations to navigation bars,
     * background scripts loading resources, or framework state management are not
     * security threats even if they contain strings that look like patterns.
     *
     * WHY WALK ANCESTORS?
     * A mutation might target a node INSIDE a UGC container — not the container
     * itself. For example, the page might call:
     *   commentBodySpan.innerHTML = userSuppliedText;
     * The span is a descendant of the comment list, not the list itself. We walk up
     * through parentId links until we find an ancestor that has a score above
     * UGC_HIGH_THRESHOLD (0.65). If we find one, the target is inside a UGC region.
     *
     * The threshold is HIGH (0.65) not LOW (0.35) for the security gate. We do not
     * want false positives here — blocking a legitimate DOM mutation because we
     * misidentified a navbar as a UGC region would break the page.
     *
     * @param {Node} domNode - the element being mutated
     * @returns {boolean} true if the element or any ancestor is a high-confidence UGC region
     */
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

    /***
     * serialize()
     *
     * WHY THIS EXISTS:
     * The PseudoDOM lives in the MAIN world as JavaScript objects — it cannot be
     * directly accessed by content scripts or the background service worker. To
     * persist a snapshot, the wrapper needs to convert the entire PseudoDOM state
     * into a plain, JSON-serializable object. That is what serialize() does.
     *
     * The result is posted to the background via _sendToBackground('PSEUDO_DOM_SNAPSHOT', ...)
     * at DOMContentLoaded, and is also used locally inside classify() so the ML feature
     * extractor can access PseudoNode metadata alongside live DOM nodes.
     *
     * WHY CONVERT attributes TO Object.fromEntries?
     * Each PseudoNode stores its attributes in a `Map` (for O(1) lookup during mutations).
     * But Maps are NOT JSON-serializable — JSON.stringify({ myMap: new Map() }) gives "{}".
     * Object.fromEntries(map) converts the Map to a plain object so it survives JSON.
     *
     * WHAT IS INCLUDED:
     * - nodes: all PseudoNodes with their attributes as plain objects
     * - mutations: the ordered log of every intercepted mutation
     * - ugcRegionMap: current confidence scores for all scored candidates
     * - url + capturedAt: metadata for the training dataset
     *
     * @returns {{ nodes: Object, mutations: Array, ugcRegionMap: Object, url: string, capturedAt: number }}
     */
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

    /***
     * getLiveNode(id)
     *
     * WHY THIS EXISTS:
     * The PseudoDOM nodes Map stores lightweight plain objects (PseudoNodes), not
     * real DOM node references. Real DOM nodes cannot be stored in chrome.storage
     * or JSON, so they live in a separate liveNodeById Map keyed by PseudoNode ID.
     *
     * getLiveNode() is the bridge: given a PseudoNode ID (a string like "pn_42"),
     * it returns the actual live DOM Element object you can call .querySelector() on,
     * scroll into view, read .getBoundingClientRect(), etc.
     *
     * Called by:
     * - classify() to get the live DOM node for scoring after getCandidateRoots()
     *   returns candidate IDs
     * - findDOMNodeById() in HeuristicClassifier (same purpose)
     * - the popup's HIGHLIGHT_CANDIDATE handler to scroll to and highlight the element
     *
     * @param {string} id - a PseudoNode ID (e.g. "pn_42")
     * @returns {Element|ShadowRoot|null} the live DOM node, or null if not tracked
     */
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

  // Auto-highlight is on by default. The popup toggle can turn it off.
  let _autoHighlightEnabled = true;
  const _highlightedEls = new Set();

  const HIGHLIGHT_STYLE = '7px solid #e55353';
  const HIGHLIGHT_OFFSET = '2px';

  /***
   * _applyHighlightToAll(scored)
   *
   * WHY THIS EXISTS:
   * After classify() runs, we want to visually mark the detected UGC region on
   * the page so the developer (or researcher) can immediately see what the extension
   * identified. The highlight is a thick red CSS outline — deliberately obvious and
   * non-destructive (outline does not affect layout or scrolling, unlike borders).
   *
   * This function first clears any previous highlight (so stale highlights from the
   * last classify() run are removed), then draws the red outline on every element
   * in the `scored` array. Currently classify() only ever passes the single top-
   * scoring element, but the function accepts an array to support future multi-
   * region highlighting without API changes.
   *
   * WHY TRACK IN _highlightedEls?
   * If we just set el.style.outline = '...' without tracking which elements we
   * touched, _clearAllHighlights() would have no way to find and reset them later.
   * The Set gives us O(1) add/delete and a simple iteration for cleanup.
   *
   * @param {Array<{domNode: Element, score: number}>} scored - elements to highlight
   */
  function _applyHighlightToAll(scored) {
    _clearAllHighlights();
    for (const { domNode } of scored) {
      if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) continue;
      domNode.style.outline = HIGHLIGHT_STYLE;
      domNode.style.outlineOffset = HIGHLIGHT_OFFSET;
      _highlightedEls.add(domNode);
    }
  }

  /***
   * _clearAllHighlights()
   *
   * WHY THIS EXISTS:
   * Before drawing new highlights (in _applyHighlightToAll or _applyHighlight),
   * we need to erase any outlines we drew in the previous classify() run or in
   * response to a previous popup click. Without this, highlights accumulate across
   * reclassification cycles and the page fills up with red borders.
   *
   * WHY try/catch PER ELEMENT?
   * The element might have been removed from the DOM between the time we highlighted
   * it and the time we try to clear it (e.g. the user navigated and the SPA removed
   * the old page's DOM). Accessing .style on a detached element is harmless in most
   * browsers, but we wrap it just to be safe.
   *
   * After clearing all styles we call .clear() on the Set so it is empty for the
   * next round of highlights.
   */
  function _clearAllHighlights() {
    for (const el of _highlightedEls) {
      try { el.style.outline = ''; el.style.outlineOffset = ''; } catch (_) {}
    }
    _highlightedEls.clear();
  }

  /***
   * _applyHighlight(domNode)
   *
   * WHY THIS EXISTS:
   * _applyHighlightToAll() is driven by classify() — it auto-highlights whatever
   * the model thinks is the best candidate. But the popup also lets the user browse
   * a list of ALL candidates and click on any one to focus it. When that happens,
   * the background sends a HIGHLIGHT_CANDIDATE message which arrives here and we
   * want to highlight ONLY that specific element, not the auto-detect result.
   *
   * This function clears the current auto-highlight and then applies the same 7px
   * red outline to whichever specific element the user clicked in the popup.
   *
   * WHY THE SAME STYLE?
   * Using the same HIGHLIGHT_STYLE constant (7px solid red) means the visual
   * appearance is consistent whether the highlight was drawn automatically or
   * triggered manually. The user doesn't need to learn two different visual cues.
   *
   * @param {Node} domNode - the specific element to highlight (from a popup card click)
   */
  function _applyHighlight(domNode) {
    _clearAllHighlights();
    if (!domNode || domNode.nodeType !== Node.ELEMENT_NODE) return;
    domNode.style.outline = HIGHLIGHT_STYLE;
    domNode.style.outlineOffset = HIGHLIGHT_OFFSET;
    _highlightedEls.add(domNode);
  }

  /***
   * _handleCandidateJson(selectors)
   *
   * WHY THIS EXISTS:
   * On some pages the automatic candidate detection fails — the comment section uses
   * an unusual structure that doesn't trigger the repetition heuristic (e.g. a single
   * large "infinite scroll" container with no obvious repeated template). In those
   * cases the user can manually provide CSS selectors via the popup's "Candidate JSON"
   * panel. Those selectors are stored in the extension and sent to all tabs on load.
   *
   * This function receives the array of selectors, tries each one with querySelector,
   * scores each match using the heuristic (to pick the best one if multiple match),
   * and highlights the winner. It is a fallback path, not the primary detection path.
   *
   * WHY SCORE EACH MATCH?
   * The user might provide several selectors, some of which match sidebar elements or
   * nav sections that also happen to share the selector. Running scoreCandidateHeuristic
   * on each match and picking the highest scorer lets the system self-correct rather
   * than just blindly highlighting the first match.
   *
   * @param {string[]} selectors - CSS selector strings provided by the user in the popup
   */
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
    if (_autoHighlightEnabled && bestEl) _applyHighlight(bestEl);
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

    /***
     * scoreCandidateHeuristic(candidate, domNode)
     *
     * WHY THIS EXISTS:
     * This is the heuristic baseline scorer — the hand-crafted rule system that
     * works BEFORE the ML model is trained and loaded. It examines multiple feature
     * families and adds or subtracts points based on UGC signals.
     *
     * Think of it as an expert-designed checklist: "does this element look like a
     * comment section?" Each positive answer adds to the score, each negative answer
     * subtracts, and the final value is clamped to [0, 1].
     *
     * FEATURE FAMILIES (in order):
     *
     * 1. STRUCTURAL REPETITION — how many direct children share the dominant template,
     *    and what fraction of all children that is (homogeneity). Comment lists have
     *    many identical-looking children; navbars and grids do too but their other
     *    signals are different.
     *
     * 2. SEMANTIC KEYWORDS — does the container or its parent have words like "comment",
     *    "reply", "discussion" in id/class/data attributes? This is the strongest single
     *    signal on sites that follow semantic naming conventions.
     *
     * 3. SCHEMA.ORG / ARIA — structured data markup (itemtype="schema.org/Comment")
     *    and ARIA roles (role="feed", role="comment") are explicit machine-readable
     *    annotations that almost certainly mean UGC.
     *
     * 4. PER-UNIT COVERAGE — for each repeated child unit, do they have timestamps,
     *    author names, reply buttons, avatar images? Coverage is the fraction of units
     *    that have the signal. High coverage = high confidence.
     *
     * 5. COMPOSER PROXIMITY — is there a textarea or contenteditable element near
     *    this candidate? Comment sections almost always sit next to a reply composer.
     *
     * 6. MUTATION ACTIVITY — how many children were dynamically injected (via JS
     *    mutations we intercepted)? High activity suggests a live feed or SPA-loaded
     *    comment section.
     *
     * 7. NEGATIVE CONTROLS — deduct points for e-commerce signals (cart, price),
     *    navigation signals (nav, header, footer), or table structure (data tables
     *    are never comment sections but can be repetitive).
     *
     * WHY THIS APPROACH:
     * Logistic regression and tree models need training data. Until we have enough
     * labeled examples, this heuristic gives us a working system. It also produces
     * the feature values that BECOME the training data — so the heuristic bootstraps
     * the very dataset the ML model will be trained on.
     *
     * @param {Object}  candidate - candidate descriptor from getCandidateRoots()
     * @param {Element} domNode   - the corresponding live DOM element
     * @returns {number} heuristic UGC confidence score in [0, 1]
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

    /***
     * getAttributeBlob(el, includeParent)
     *
     * WHY THIS EXISTS:
     * Keyword scoring and negative control detection need to scan all the identifying
     * text on an element in one go — its tag name, all attribute names, all attribute
     * values (class, id, role, aria-label, data-*, etc.), and optionally a snippet
     * of text content. Concatenating all of this into one string lets us run a single
     * regex test instead of checking each attribute individually.
     *
     * WHY INCLUDE THE PARENT?
     * Some sites wrap their comment section in a container like:
     *   <ytd-comments id="comments">
     *     <div id="contents">...</div>   ← this is the real candidate root
     *   </ytd-comments>
     * The inner `#contents` div has no UGC keywords itself — but its parent
     * `ytd-comments` clearly does. Including the parent's tag and attributes in
     * the blob lets keyword scoring correctly identify this pattern. The includeParent
     * flag is set to true when this function is called for keyword scoring, and false
     * when called for negative control checks on individual units.
     *
     * WHY ONLY 100 CHARS OF TEXT CONTENT?
     * If the element has a single text node child (a label or heading), including its
     * text helps. But we cap at 100 characters to avoid including entire comment bodies
     * in the blob — we don't want the content of a comment that happens to say "check
     * out this product for $29.99" to trigger the NEGATIVE_COMMERCE penalty.
     *
     * @param {Element} el            - the element to build a blob for
     * @param {boolean} includeParent - if true, also include parent's tag + attributes
     * @returns {string} space-joined string of all relevant identifiers
     */
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

    /***
     * shadowAwareQuerySelector(el, selector)
     *
     * WHY THIS EXISTS:
     * Modern web components (like YouTube's entire comment UI) use Shadow DOM
     * extensively. A regular `el.querySelector('.avatar')` call CANNOT see inside
     * a child element's shadow root — the browser intentionally encapsulates it.
     * This means naive DOM queries on the top-level candidate element miss all the
     * real content that is "inside" its shadow-DOM children.
     *
     * This function extends querySelector by also checking inside the shadow roots
     * of the element's DIRECT children (one level deep). Going deeper than one level
     * risks being too slow (could be hundreds of nested shadow roots on complex SPAs).
     * One level deep is enough for the most common pattern: a host element with
     * shadow-rooted child components like <ytd-comment-renderer shadowRoot>.
     *
     * If the light-DOM result is found first, we return it immediately without
     * checking shadow roots. Only on miss do we iterate children.
     *
     * @param {Element} el       - the element to search within
     * @param {string}  selector - CSS selector string
     * @returns {Element|null} the first matching element, or null if not found
     */
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

    /***
     * shadowAwareTextContent(el)
     *
     * WHY THIS EXISTS:
     * For the same reason as shadowAwareQuerySelector — regular el.textContent does
     * NOT include text from inside shadow roots. This matters for timestamp detection:
     * a comment card might have `<time-ago shadowRoot>3 hours ago</time-ago>` where
     * "3 hours ago" lives in the shadow root's text, not the light DOM's textContent.
     *
     * We concatenate the shadow root's textContent for each direct child that has one.
     * The result is an approximate merged text that includes shadow content — enough
     * to catch patterns like "2 days ago" or "Jan 15, 2024" that timestamp regexes
     * look for.
     *
     * @param {Element} el - the element to extract text content from
     * @returns {string} combined text from light DOM and direct children's shadow roots
     */
    function shadowAwareTextContent(el) {
      let text = el.textContent || '';
      for (const child of (el.children || [])) {
        try {
          if (child.shadowRoot) text += ' ' + (child.shadowRoot.textContent || '');
        } catch (_) {}
      }
      return text;
    }

    /***
     * shadowAwareQuerySelectorAll(el, selector)
     *
     * WHY THIS EXISTS:
     * Like shadowAwareQuerySelector but returns ALL matching elements rather than
     * just the first. Used when we need to count or test all buttons (for reply
     * action detection) or all <img> elements (for avatar detection) rather than
     * stopping at the first match.
     *
     * Merges results from the light DOM querySelectorAll and from each direct
     * child's shadow root querySelectorAll into a single flat array.
     *
     * @param {Element} el       - the element to search within
     * @param {string}  selector - CSS selector string
     * @returns {Element[]} flat array of all matching elements across light and shadow DOM
     */
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

    /***
     * keywordScore(blob)
     *
     * WHY THIS EXISTS:
     * The attribute blob (from getAttributeBlob) is a raw text string. To match
     * keywords, we first normalize it with _kwNorm (Unicode NFKD decomposition +
     * accent stripping + lowercase) to handle international sites — a Polish site
     * might use "komentarze" (comments), a French site "commentaires". After
     * normalization, we test against three keyword tiers:
     *
     * HIGH (0.15 pts): Unambiguous comment/UGC words — "comment", "reply",
     *   "discussion", "review", "thread", "forum", "answer". Also international
     *   equivalents. If ANY of these appear, it is a very strong signal.
     *
     * MEDIUM (0.08 pts): Ambiguous words that could be UGC OR other things —
     *   "post", "message", "response", "conversation". These appear in comment
     *   sections but also in messaging UIs, blog post lists, etc.
     *
     * LOW (0.03 pts): Generic structural words — "item", "card", "entry", "feed".
     *   Weak signal; many non-UGC containers use these too (product cards, news feeds).
     *
     * Only the FIRST match (highest tier) is counted — if both a HIGH and LOW pattern
     * match, we return 0.15 (the HIGH score), not 0.18. This prevents double-counting.
     *
     * @param {string} blob - already-concatenated attribute blob
     * @returns {number} score contribution from keyword matching (0, 0.03, 0.08, or 0.15)
     */
    function keywordScore(blob) {
      const norm = _kwNorm(blob);
      if (_KW_HIGH_RE.test(norm)) return 0.15;
      if (_KW_MED_RE.test(norm))  return 0.08;
      if (_KW_LOW_RE.test(norm))  return 0.03;
      return 0;
    }

    /***
     * hasSchemaOrgComment(el)
     *
     * WHY THIS EXISTS:
     * Schema.org is a vocabulary of structured data markup that websites use to
     * explicitly label their content for search engines and other tools. When a
     * site adds `itemtype="https://schema.org/Comment"` or
     * `itemtype="https://schema.org/Review"` to a container, it is LITERALLY telling
     * machines "this element contains a user comment or review." That is the most
     * reliable signal possible — the developer explicitly annotated it for us.
     *
     * We check both the `itemtype` attribute and the raw innerHTML for schema.org
     * URLs because some frameworks inject the microdata into data attributes or
     * as JSON-LD inside <script> tags that appear early in the HTML.
     *
     * @param {Element} el - element to check
     * @returns {boolean} true if the element has Schema.org Comment or Review markup
     */
    function hasSchemaOrgComment(el) {
      if (!el) return false;
      const itemtype = (el.getAttribute?.('itemtype') || '').toLowerCase();
      const text = el.innerHTML?.slice(0, 500) || '';
      return itemtype.includes('comment') ||
             itemtype.includes('review') ||
             text.includes('schema.org/Comment') ||
             text.includes('schema.org/Review');
    }

    /***
     * hasAriaRoleFeed(el)
     *
     * WHY THIS EXISTS:
     * The ARIA `role="feed"` attribute is the W3C-standardized semantic for an
     * infinite-scrolling list of articles or content items, typically user-generated
     * posts. When a developer explicitly sets role="feed" on a container, they are
     * telling assistive technologies "this is a stream of UGC". We trust that
     * labeling completely and award it a score boost.
     *
     * @param {Element} el - element to check
     * @returns {boolean} true if element has role="feed"
     */
    function hasAriaRoleFeed(el) {
      return el?.getAttribute?.('role') === 'feed';
    }

    /***
     * hasAriaRoleComment(el)
     *
     * WHY THIS EXISTS:
     * Similar to hasAriaRoleFeed() but for the `role="comment"` ARIA role, which
     * marks an individual comment or reply in a discussion thread. If the container
     * itself has this role, or if any of its children do, it is explicitly labelled
     * as a comment region by the page author.
     *
     * @param {Element} el - element to check
     * @returns {boolean} true if element has role="comment"
     */
    function hasAriaRoleComment(el) {
      return el?.getAttribute?.('role') === 'comment';
    }

    /***
     * _heurSig(el)
     *
     * WHY THIS EXISTS:
     * This is functionally identical to _structSig() in the PseudoDOM section — it
     * computes a structural signature string for a live DOM element. It exists as a
     * SEPARATE function inside HeuristicClassifier because HeuristicClassifier works
     * with live DOM elements directly (via getRepeatedUnits and the per-unit coverage
     * checks) and should not depend on the PseudoDOM module's internal functions.
     *
     * The duplication is intentional: keeping the modules decoupled means if we ever
     * extract HeuristicClassifier into its own file, it does not need to import PseudoDOM.
     *
     * See _structSig() for the detailed explanation of how and why this signature works.
     *
     * @param {Element} el - a live DOM element
     * @returns {string} structural signature like "li[div,footer,p]"
     */
    function _heurSig(el) {
      const tag = (el.tagName || 'unknown').toLowerCase();
      const childTags = Array.from(el.children).map(c => (c.tagName||'?').toLowerCase()).sort();
      return `${tag}[${childTags.join(',')}]`;
    }

    /***
     * getRepeatedUnits(el)
     *
     * WHY THIS EXISTS:
     * To check per-unit signals (time, author, reply button, avatar) we need the
     * actual individual comment card elements, not just the container. getRepeatedUnits()
     * finds the "dominant family" — the group of structurally similar direct children
     * that make up the repetitive pattern.
     *
     * For example, given a <ul> with 20 <li> children each shaped like:
     *   <li><img class="avatar"><div class="body"><p>text</p><time>...</time></div></li>
     * ...getRepeatedUnits returns an array of those 20 <li> elements.
     *
     * WHY MINIMUM 3?
     * Same reasoning as getCandidateRoots — two repeating elements could be coincidence.
     * Three or more is a deliberate repeated pattern.
     *
     * HOW IT WORKS:
     * Same _heurSig() grouping logic as getCandidateRoots(). The dominant group is
     * the one with the most members. If the dominant group has < 3 members, we return
     * [] (empty array) to signal that per-unit analysis is not applicable here.
     *
     * @param {Element} el - the candidate container element
     * @returns {Element[]} array of the dominant repeated child elements, or [] if none
     */
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

    /***
     * countUnitsWith(units, predicate)
     *
     * WHY THIS EXISTS:
     * A tiny utility that counts how many elements in the `units` array satisfy a
     * predicate function (like hasTimeSignal, hasAuthorSignal, etc.). The result is
     * divided by units.length to get "coverage" — what fraction of comment units have
     * this signal. Coverage is more meaningful than a raw count: finding timestamps
     * in 8 out of 10 units is strong evidence; finding them in 1 out of 50 is not.
     *
     * Keeping this as a named function (rather than inlining `units.filter(p).length`)
     * makes scoreCandidateHeuristic's code self-documenting and the coverage
     * calculation easy to understand at a glance.
     *
     * @param {Element[]} units     - array of candidate child elements
     * @param {Function}  predicate - function(el) → boolean
     * @returns {number} count of units where predicate returns true
     */
    function countUnitsWith(units, predicate) {
      return units.filter(predicate).length;
    }

    /***
     * hasTimeSignal(el)
     *
     * WHY THIS EXISTS:
     * Timestamps are one of the strongest indicators that a list item is a comment
     * or post — "3 hours ago", "Jan 15, 2024", "2d", etc. Product cards rarely have
     * relative timestamps; comment cards almost always do.
     *
     * We check four ways a timestamp might appear:
     * 1. TS_RELATIVE regex — relative times like "3 hours ago", "2d", "just now"
     *    in visible text content (including shadow DOM via shadowAwareTextContent)
     * 2. TS_ABSOLUTE regex — absolute dates like "January 15, 2024" or "2024-01-15"
     * 3. <time datetime="..."> — the semantic HTML element specifically for dates/times
     * 4. data-time/data-date/data-timestamp/data-created/data-epoch attributes —
     *    many frameworks store the raw timestamp in a data attribute and render it
     *    differently in the UI (e.g. converting epoch milliseconds to "3h ago")
     *
     * @param {Element} el - a repeated unit element (individual comment card)
     * @returns {boolean} true if this unit has any detectable timestamp signal
     */
    function hasTimeSignal(el) {
      if (!el) return false;
      const text = shadowAwareTextContent(el);
      const attrs = getAttributeBlob(el);
      return TS_RELATIVE.test(text) ||
             TS_ABSOLUTE.test(text) ||
             shadowAwareQuerySelector(el, 'time[datetime]') !== null ||
             /data-(time|date|timestamp|created|epoch)/i.test(attrs);
    }

    /***
     * hasAuthorSignal(el)
     *
     * WHY THIS EXISTS:
     * Comments are written by people. A comment card almost always contains some
     * indication of who wrote it — a username, a @handle, a "by Alice" label. Product
     * cards have product names, not author names. Detecting the presence of author
     * markup is therefore a strong discriminator.
     *
     * We check three ways an author might be marked up:
     * 1. Keyword match on getAttributeBlob — class or id or data attribute containing
     *    words like "author", "username", "commenter", "handle", "poster", "by"
     * 2. Schema.org / rel semantics — `[itemprop="author"]` or `[rel="author"]`
     *    (sites following structured markup standards)
     * 3. BEM / utility class conventions — class names like "commentItem__username",
     *    "user-name", or "comment-author" (via `[class*="username"]` selectors).
     *    This catches sites that don't use ARIA or Schema.org but follow CSS naming
     *    conventions from styleguides.
     *
     * @param {Element} el - a repeated unit element
     * @returns {boolean} true if this unit has any detectable author signal
     */
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

    /***
     * hasReplyAction(el)
     *
     * WHY THIS EXISTS:
     * Comment sections provide interactive controls on each comment: "Reply", "Quote",
     * "Respond". Product listings have "Add to Cart", "Compare", "Wishlist" — not
     * Reply buttons. The presence of a Reply/Respond button on a repeated unit is a
     * very strong UGC signal.
     *
     * We find all button-like elements (actual <button>, elements with role="button",
     * and <a> links — Reddit and Hacker News use <a> tags for reply links) and test
     * their text content and aria-label against the REPLY_ACTIONS regex:
     * /\b(reply|replies|respond|quote)\b/i
     *
     * WHY ARIA-LABEL?
     * Icon-only buttons (e.g. a reply arrow icon) often have no text content but carry
     * an aria-label like "Reply to this comment" for screen reader users. We check
     * aria-label alongside textContent to catch these.
     *
     * @param {Element} el - a repeated unit element
     * @returns {boolean} true if a reply/respond action button is found
     */
    function hasReplyAction(el) {
      if (!el) return false;
      const buttons = shadowAwareQuerySelectorAll(el, 'button, [role="button"], a');
      return buttons.some(b => REPLY_ACTIONS.test(b.textContent || b.getAttribute?.('aria-label') || ''));
    }

    /***
     * hasAvatarSignal(el)
     *
     * WHY THIS EXISTS:
     * User profile pictures (avatars) appear on nearly every comment card and almost
     * nowhere else on a page. Product images can look similar structurally, but their
     * attributes differ — a product image has "alt=Product Name", not "alt=User's
     * avatar" or class="avatar".
     *
     * We check two avatar patterns:
     *
     * 1. <img> with avatar/profile keywords in its attributes — the most common pattern.
     *    Typical class values: "avatar", "user-avatar", "profile-picture", "headshot".
     *    Typical alt values: "Alice's avatar", "User profile picture".
     *    We scan all <img> elements (including those in shadow roots) with
     *    shadowAwareQuerySelectorAll.
     *
     * 2. CSS background-image avatars — SoundCloud and some other SPAs render avatars
     *    as `<span style="background-image: url(...)">` with no <img> tag. The only
     *    accessible marker is an aria-label like "Alice's avatar" or a class name
     *    like "avatar" or "profile-pic". We catch these via shadowAwareQuerySelector
     *    looking for aria-label*="avatar" or class*="avatar" etc.
     *
     * @param {Element} el - a repeated unit element
     * @returns {boolean} true if an avatar image or avatar-labelled element is found
     */
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

    /***
     * hasNearbyComposer(el)
     *
     * WHY THIS EXISTS:
     * Comment sections almost always sit next to a "compose" UI — a textarea or
     * contenteditable div where users type new comments. Product listing grids do not
     * have a reply composer next to them. Finding a composer near the candidate is
     * therefore a useful proximity signal.
     *
     * WHY "NEARBY" (siblings + parent) AND NOT INSIDE THE CANDIDATE?
     * The compose box is usually a SIBLING of the comment list, not a child. The
     * typical layout is:
     *
     *   <section id="comments">
     *     <form>                     ← compose box (sibling of the list)
     *       <textarea>...</textarea>
     *     </form>
     *     <ul id="comment-list">    ← this is our candidate
     *       <li>...</li>
     *     </ul>
     *   </section>
     *
     * We look 2 siblings before and after the candidate, plus the parent itself
     * (because the parent section may directly contain a textarea).
     *
     * WHY 2 SIBLINGS?
     * Far-away siblings are less likely to be related. Most implementations put the
     * compose form either immediately before or immediately after the comment list.
     * 2 in each direction is a good heuristic limit.
     *
     * @param {Element} el - the candidate container element
     * @returns {boolean} true if a textarea or contenteditable is found nearby
     */
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

    /***
     * isTableStructure(el)
     *
     * WHY THIS EXISTS:
     * HTML tables (<table>, <tbody>, <tr>) can have many structurally similar rows
     * that would otherwise score high on the repetition metric. But data tables are
     * almost never UGC comment sections — they are pricing tables, comparison grids,
     * financial data, etc.
     *
     * Detecting table structure lets us apply a -0.15 penalty in scoreCandidateHeuristic
     * to prevent tables from being misidentified as comment sections. We check both
     * the element's own tag (in case the candidate IS a table or tbody) and whether
     * it contains any <tr> elements (in case it is a div-wrapper around a table).
     *
     * @param {Element} el - the candidate element
     * @returns {boolean} true if the element is or contains a table structure
     */
    function isTableStructure(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'table' || tag === 'tbody' || tag === 'tr' ||
             el.querySelector?.('tr') !== null;
    }

    /***
     * normalizeCategoryValue(value)
     *
     * WHY THIS EXISTS:
     * The ML model's vectorizer treats categorical features (like `dominantTag` or
     * `frameworkHint`) as one-hot encoded strings. For one-hot encoding to work
     * correctly, every value must be a non-empty string — including cases where the
     * feature is missing or undefined. The sentinel '__missing__' tells the vectorizer
     * "this feature was not present" and maps to its own dedicated vector dimension.
     *
     * Without this normalization, undefined or null values would get stringified as
     * "undefined" or "null" by the vectorizer, which would not match any known category
     * key and would silently produce all-zero one-hot vectors (i.e., as if __missing__
     * but without using the correct column index).
     *
     * @param {*} value - any categorical feature value
     * @returns {string} the trimmed string value, or '__missing__' if empty/null/undefined
     */
    function normalizeCategoryValue(value) {
      const text = String(value || '').trim();
      return text || '__missing__';
    }

    /***
     * vectorizeFeatureValues(featureValues, runtime)
     *
     * WHY THIS EXISTS:
     * Machine learning models operate on numerical vectors (arrays of numbers), not
     * on dictionaries of named feature values. vectorizeFeatureValues() converts the
     * raw feature dictionary produced by extractFeatures() (e.g. `{ dominantFamilySize: 8,
     * hasTimestamp: true, dominantTag: 'li', ... }`) into the fixed-length number array
     * that the model expects.
     *
     * The `runtime.vectorizer` object (saved alongside the trained model) contains:
     * - `dimension`: total number of columns in the vector
     * - `descriptors`: array of feature-slot descriptors, each specifying:
     *     - type: 'number', 'boolean', or 'categorical'
     *     - feature_key: which feature value to read
     *     - index: which slot in the output vector to write to
     *     - For 'number': numericStats.mean and .std for z-score normalization
     *     - For 'categorical': which specific category value this one-hot slot represents
     *
     * WHY THREE TYPES?
     * - 'number': raw numeric features like dominantFamilySize get z-score normalized:
     *   (value - mean) / std. This puts all numeric features on the same scale so the
     *   model does not over-weight large-magnitude features.
     * - 'boolean': true → 1, false → 0. Direct binary encoding.
     * - 'categorical': one-hot encoding. Each unique category value gets its own slot.
     *   Only the slot matching the actual value is set to 1; all others stay 0.
     *
     * This mirrors exactly what the Python training pipeline does, so the live
     * extension produces the same vector layout as training data — critical for
     * correct model inference.
     *
     * @param {Object} featureValues - raw feature dictionary from extractFeatures()
     * @param {Object} runtime       - the runtime model bundle (contains vectorizer)
     * @returns {number[]} fixed-length numeric vector ready for model inference
     */
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

    /***
     * traverseTree(node, vector)
     *
     * WHY THIS EXISTS:
     * Decision trees (and random forest trees, and gradient boosting trees) are
     * binary tree structures where each internal node tests one feature value against
     * a threshold: "is vector[featureIndex] <= threshold?". Depending on the answer,
     * we go left (yes) or right (no). Leaf nodes store the prediction value (a
     * probability or a class vote).
     *
     * This function recursively walks one such tree, following the correct branch at
     * each internal node, until it reaches a leaf. It returns the leaf's prediction.
     *
     * WHY BOTH node.value AND node.probability?
     * Different model export formats use different field names. Random forest trees
     * exported from scikit-learn often use `probability` for the fraction of training
     * samples in that leaf that were positive. Gradient boosted trees might use `value`
     * for the raw leaf score. We check both and fall back to 0 if neither is present.
     *
     * A node is a leaf when it has no `.left` or `.right` child, OR when it explicitly
     * has `leaf: true` set.
     *
     * @param {Object}   node   - a tree node from the runtime model bundle
     * @param {number[]} vector - the feature vector from vectorizeFeatureValues()
     * @returns {number} prediction value from the reached leaf node
     */
    function traverseTree(node, vector) {
      if (!node) return 0;
      if (node.leaf || !node.left || !node.right) {
        return node.value !== undefined ? Number(node.value) : Number(node.probability) || 0;
      }
      return ((Number(vector[node.featureIndex]) || 0) <= node.threshold)
        ? traverseTree(node.left, vector)
        : traverseTree(node.right, vector);
    }

    /***
     * predictRuntimeProbability(runtime, featureValues)
     *
     * WHY THIS EXISTS:
     * This is the top-level inference function: given a runtime model bundle and a
     * feature dictionary, produce a UGC probability estimate in [0, 1].
     *
     * It supports FOUR model algorithms, so the extension works regardless of which
     * model type the user trained in Model Lab:
     *
     * 1. LOGISTIC REGRESSION (default): dot(weights, vector) + bias → logistic sigmoid.
     *    The oldest and simplest model. Produces a smooth probability.
     *
     * 2. DECISION TREE: a single traverseTree() call on the root node. Fast. Can only
     *    express rectangular decision boundaries.
     *
     * 3. RANDOM FOREST: average of N traverseTree() calls (one per tree). Each tree
     *    votes independently and the average is the probability. More robust than a
     *    single tree.
     *
     * 4. GRADIENT BOOSTING: sum of (learning_rate × tree_output) starting from
     *    base_score, then apply the logistic sigmoid to convert the raw score to a
     *    probability. Typically the most accurate model type for tabular features.
     *
     * WHY SUPPORT MULTIPLE ALGORITHMS?
     * Different users may have trained different model types. The runtime bundle
     * includes `algorithm` field set at training time. The extension reads this field
     * and dispatches to the correct inference branch — so the user does not need to
     * worry about algorithm compatibility.
     *
     * @param {Object} runtime       - the full runtime model bundle (model + vectorizer)
     * @param {Object} featureValues - raw feature dictionary from extractFeatures()
     * @returns {number} predicted UGC probability in [0, 1]
     */
    function predictRuntimeProbability(runtime, featureValues) {
      const vector = vectorizeFeatureValues(featureValues, runtime);
      const model = runtime?.model || {};
      const algo = model.algorithm || runtime?.algorithm;

      if (algo === 'random_forest') {
        const trees = Array.isArray(model.trees) ? model.trees : [];
        if (!trees.length) return 0.5;
        const sum = trees.reduce((acc, tree) => acc + traverseTree(tree, vector), 0);
        return sum / trees.length;
      }

      if (algo === 'gradient_boosting') {
        const trees = Array.isArray(model.trees) ? model.trees : [];
        const lr = Math.max(0.001, Number(model.learning_rate) || 0.1);
        let score = Number(model.base_score) || 0;
        trees.forEach((tree) => { score += lr * traverseTree(tree, vector); });
        return 1 / (1 + Math.exp(-score));
      }

      if (algo === 'decision_tree') {
        return traverseTree(model.tree, vector);
      }

      // logistic_regression (default)
      const weights = model.weights || [];
      let logit = Number(model.bias) || 0;
      for (let i = 0; i < vector.length; i += 1) {
        logit += (vector[i] || 0) * (Number(weights[i]) || 0);
      }
      return 1 / (1 + Math.exp(-logit));
    }

    /***
     * scoreCandidateWithRuntime(candidate, domNode, extractFeatures, snapshot)
     *
     * WHY THIS EXISTS:
     * This is the bridge between the live DOM and the ML model pipeline. It:
     * 1. Calls extractFeatures() (from feature_extractor_runtime.js) to compute the
     *    raw feature dictionary for this candidate
     * 2. Passes the feature dictionary to predictRuntimeProbability() which handles
     *    vectorization and model inference
     * 3. Returns the resulting probability, or null if extraction/inference fails
     *
     * WHY A SEPARATE FUNCTION?
     * classify() needs to handle errors gracefully — if the feature extractor fails
     * on one candidate (e.g. the element was removed from the DOM mid-scan), we want
     * to skip that candidate rather than crash the entire classify() run. Isolating the
     * feature extraction + prediction into scoreCandidateWithRuntime() makes it easy
     * to wrap in a try/catch in classify() without obscuring the main loop logic.
     *
     * WHY PASS snapshot?
     * extractFeatures() needs both the live DOM element AND its PseudoNode metadata
     * (depth, mutationType, insertedAt, etc.). The snapshot is a serialized copy of
     * PseudoDOM taken once per classify() run and reused for all candidates —
     * avoids calling serialize() inside a loop.
     *
     * @param {Object}   candidate      - candidate descriptor from getCandidateRoots()
     * @param {Element}  domNode        - the live DOM element
     * @param {Function} extractFeatures - from window.__PSEUDODOM_FEATURE_EXTRACTOR__
     * @param {Object}   snapshot        - serialized PseudoDOM from PseudoDOM.serialize()
     * @returns {number|null} probability in [0,1], or null if inference failed
     */
    function scoreCandidateWithRuntime(candidate, domNode, extractFeatures, snapshot) {
      if (!domNode || typeof extractFeatures !== 'function') return null;
      const pseudoNode = snapshot?.nodes?.[candidate.id] || null;
      const featureValues = extractFeatures(domNode, pseudoNode, candidate, _pageSignals || null);
      return predictRuntimeProbability(_runtimeModel, featureValues);
    }

    /***
     * classify()
     *
     * WHY THIS EXISTS:
     * This is the central intelligence function of the entire extension. It orchestrates
     * the full UGC detection pipeline from candidate discovery to final scoring and
     * highlighting. It runs:
     *   - At DOMContentLoaded (initial scan of the page)
     *   - After the debounce timer fires following significant mutations (MutationObserver)
     *   - After SPA navigations (700ms after URL change)
     *   - When page signals, runtime model, scoring mode, or feature extractor arrive
     *     from the background (via flushPendingPushes → _scheduleClassify)
     *
     * THE THREE-PASS DESIGN:
     *
     * PASS 1 — Raw Scores:
     * Run the full scoring pipeline (heuristic or ML) on every candidate and store
     * the raw score in a Map, keyed by candidate ID. We do NOT write to ugcRegionMap
     * yet because the ancestor penalty in Pass 2 needs to compare raw scores across
     * candidates before finalizing any of them.
     *
     * PASS 2 — Ancestor Penalty:
     * Comment section pages often have nested candidate elements — for example, a
     * <section id="comments"> (outer container, high score) contains an inner
     * <div id="comment-list"> (also high score). Without the penalty, the classifier
     * would report BOTH as high-confidence UGC regions, causing confusion in the popup
     * and the highlight. With the penalty, any candidate that has an above-threshold
     * ancestor gets its score multiplied by 0.6, so the outer container wins.
     *
     * We check against UGC_LOW_THRESHOLD (0.35) for the ancestor's raw score —
     * we want to penalize even moderately-confident ancestors to prevent sub-lists
     * and reply threads from outranking the main comment section.
     *
     * PASS 3 — Commit and Report:
     * Write the final (possibly penalized) scores to ugcRegionMap, update the live
     * DOM highlight, and send CANDIDATE_FEATURES to the background for any candidate
     * that crosses UGC_HIGH_THRESHOLD (0.65). These features become training data.
     *
     * SCORING MODES:
     * - 'none': zero out all scores — no UGC detection, no security gate
     * - 'heuristic': scoreCandidateHeuristic() only, even if a model is loaded
     * - 'model': scoreCandidateWithRuntime() only — skip candidates where the
     *   feature extractor is missing or returns a non-finite score
     *
     * @returns {Promise<void>} (declared async for future await-able operations)
     */
    async function classify() {
      const candidates = PseudoDOM.getCandidateRoots();

      if (_scoringMode === 'none') {
        for (const candidate of candidates) {
          PseudoDOM.setUGCConfidenceById(candidate.id, 0);
          const domNode = findDOMNodeById(candidate.id);
          if (domNode) PseudoDOM.setUGCConfidence(domNode, 0);
        }
        return;
      }

      const featureExtractor = getRuntimeFeatureExtractor();
      const useRuntime = Boolean(
        _scoringMode === 'model' &&
        _runtimeModel?.model &&
        _runtimeModel?.vectorizer?.descriptors?.length &&
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
      // Pass 1 — collect raw scores without writing to ugcRegionMap yet.
      const rawScores = new Map();
      for (const candidate of candidates) {
        const domNode = findDOMNodeById(candidate.id);
        let score = scoreCandidateHeuristic(candidate, domNode);

        if (useRuntime && domNode && domNode.nodeType === Node.ELEMENT_NODE) {
          try {
            const runtimeScore = scoreCandidateWithRuntime(candidate, domNode, featureExtractor, snapshot);
            if (Number.isFinite(runtimeScore)) {
              score = (_scoringMode === 'model') ? runtimeScore : Math.max(score, runtimeScore);
            } else if (_scoringMode === 'model') {
              continue;
            }
          } catch (error) {
            console.warn('[PseudoDOM Guard] Runtime scoring failed:', error?.message || error);
          }
        } else if (_scoringMode === 'model') {
          continue;
        }

        rawScores.set(candidate.id, score);
      }

      // Pass 2 — ancestor penalty: a candidate nested inside another above-threshold
      // candidate gets its score multiplied by 0.6 so the outer container wins.
      // This prevents reply sub-threads from outranking the main comment list.
      const finalScores = new Map(rawScores);
      for (const candidate of candidates) {
        const raw = rawScores.get(candidate.id);
        if (raw == null) continue;
        let parentId = PseudoDOM.nodes.get(candidate.id)?.parentId;
        while (parentId) {
          const ancestorScore = rawScores.get(parentId);
          if (Number.isFinite(ancestorScore) && ancestorScore >= UGC_LOW_THRESHOLD) {
            finalScores.set(candidate.id, raw * 0.6);
            break;
          }
          parentId = PseudoDOM.nodes.get(parentId)?.parentId;
        }
      }

      // Pass 3 — write final scores and collect highlight candidates.
      const _scoredForHighlight = [];
      for (const candidate of candidates) {
        const score = finalScores.get(candidate.id);
        if (score == null) continue;
        const domNode = findDOMNodeById(candidate.id);

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

      // Highlight the top pick if auto-highlight is enabled (popup toggle controls this).
      if (_autoHighlightEnabled) {
        if (_scoredForHighlight.length > 0) {
          const best = _scoredForHighlight.reduce((a, b) => b.score > a.score ? b : a);
          _applyHighlightToAll([best]);
        } else {
          _clearAllHighlights();
        }
      }
    }

    /***
     * findDOMNodeById(id)
     *
     * WHY THIS EXISTS:
     * Inside classify(), we iterate over candidates by their PseudoNode ID strings.
     * To call scoring functions that operate on live DOM elements (like scoreCandidateHeuristic
     * which uses el.children, el.getAttribute, etc.), we need the actual DOM Element
     * object. This function does the lookup via PseudoDOM.getLiveNode().
     *
     * It is a thin wrapper rather than calling PseudoDOM.getLiveNode() directly to
     * make the HeuristicClassifier code self-contained — HeuristicClassifier references
     * a named function that could theoretically be re-pointed to a different lookup
     * strategy without changing the callers inside classify().
     *
     * @param {string} id - a PseudoNode ID (e.g. "pn_42")
     * @returns {Element|null} the live DOM element, or null if not found
     */
    function findDOMNodeById(id) {
      return PseudoDOM.getLiveNode(id) || null;
    }

    /***
     * getRuntimeFeatureExtractor()
     *
     * WHY THIS EXISTS:
     * The ML feature extractor (feature_extractor_runtime.js) is loaded as a
     * <script type="module"> by content_bridge.js. When it finishes loading, it
     * registers itself on window.__PSEUDODOM_FEATURE_EXTRACTOR__ in the MAIN world.
     * But module loading is async — the first few classify() runs may happen before
     * the module has loaded (especially on fast-loading cached pages).
     *
     * This function safely checks whether the feature extractor is available:
     * - If the module loaded and registered extractFeatures, returns that function.
     * - If the module hasn't loaded yet (or was blocked by CSP), returns null.
     *
     * Callers check the return value before deciding whether to use ML scoring.
     * If null, classify() falls back to heuristic-only scoring for this run.
     * The FEATURE_EXTRACTOR_READY message (sent by content_bridge.js when the module
     * loads) triggers a _scheduleClassify() which will then find the extractor available.
     *
     * @returns {Function|null} the extractFeatures function, or null if not yet available
     */
    function getRuntimeFeatureExtractor() {
      const runtimeExtractor = window.__PSEUDODOM_FEATURE_EXTRACTOR__;
      return runtimeExtractor && typeof runtimeExtractor.extractFeatures === 'function'
        ? runtimeExtractor.extractFeatures
        : null;
    }

    /***
     * scoreElement(el)
     *
     * WHY THIS EXISTS:
     * scoreCandidateHeuristic() requires a full candidate descriptor object (from
     * getCandidateRoots()) with fields like dominantFamilySize, homogeneity, and
     * mutationActivity. But some callers — particularly _handleCandidateJson() which
     * scores user-provided CSS selectors — have only a raw DOM element, not a candidate
     * descriptor.
     *
     * scoreElement() creates a minimal "fake candidate" descriptor from the element
     * itself (using its direct children count as both dominantFamilySize and totalChildren,
     * and defaulting homogeneity to 0.5 as a neutral assumption). This lets
     * _handleCandidateJson() compare arbitrary selectors without running getCandidateRoots().
     *
     * The fake candidate will score lower than a real candidate (it misses mutation
     * activity, and the homogeneity is fixed) but is good enough for picking the best
     * match among a small set of user-provided selectors.
     *
     * This function is also exposed on the HeuristicClassifier return object so popup.js
     * can call it via chrome.scripting.executeScript to score elements directly.
     *
     * @param {Element} el - any live DOM element to score
     * @returns {number} heuristic UGC confidence score in [0, 1]
     */
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

  /***
   * _promotionTierOf(count)
   *
   * WHY THIS EXISTS:
   * _tryEagerPromotion() needs to avoid re-running the full feature extraction + ML
   * pipeline on every single child insertion into a growing list. A comment section
   * loading 50 comments one by one would trigger 50 scoring runs — wasteful and
   * potentially noticeable in performance.
   *
   * Instead, we use "promotion tiers": fixed thresholds at which we agree to re-score.
   * The thresholds [2, 3, 5, 8, 15] are chosen because:
   * - At 2 children: too early to tell, but we kick off an initial very-low-confidence check
   * - At 3: minimum threshold for getCandidateRoots() — first meaningful data
   * - At 5, 8, 15: increasing evidence; per-unit coverage features become more reliable
   *   with more samples (timeCoverage at 5 units is noisier than at 15)
   *
   * Above 15, we re-score every 10 additional children (15→25→35→...) so that very
   * large comment sections (Reddit threads with 500+ comments) continue to have their
   * score updated as more signal accumulates, but not on every single insertion.
   *
   * _promotionTierMap stores the dominant-group count AT WHICH we last scored. If the
   * current count maps to the same tier as the last-scored count, we skip re-scoring.
   *
   * @param {number} count - current dominant group child count
   * @returns {number} the tier this count falls into
   */
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

  /***
   * _tryEagerPromotion(domNode)
   *
   * WHY THIS EXISTS:
   * The main classify() function runs on a debounce timer — it waits 80–300ms after
   * mutations settle before scoring. This is fine for detecting comment sections after
   * the page finishes loading, but it means that the VERY FIRST few comment items
   * injected by a SPA could enter the DOM, trigger UGC content mutations, and pass
   * through the security gate WITHOUT any UGC region having been detected yet
   * (because classify() hasn't run yet).
   *
   * _tryEagerPromotion() is called SYNCHRONOUSLY inside each DOM wrapper (makeWrapper),
   * immediately after the real mutation is applied. If the target element now has
   * >= 2 structurally similar children that cross a promotion tier, we run the full
   * feature extraction + scoring pipeline RIGHT NOW and write the score to ugcRegionMap.
   * This means the NEXT mutation into this element is already gated by the security
   * precheck.
   *
   * WHY REQUIRE >= 2 (not 3)?
   * We want to detect emerging comment sections as early as possible — even when only
   * 2 children have arrived. The score at 2 children will be low (low coverage, small
   * dominantFamilySize penalty), but if it still exceeds UGC_LOW_THRESHOLD, we can
   * start gating. The threshold does the filtering; the tier system prevents us from
   * re-running unnecessarily.
   *
   * WHY THE ENTIRE PROMOTION IS IN A try/catch?
   * This runs synchronously inside every DOM write operation. If it throws for any
   * reason (detached element, removed node, browser quirk), we cannot afford to
   * propagate the error — it would crash the page's own JavaScript. Silent failure
   * is the correct behavior here: the debounced classify() will catch up moments later.
   *
   * @param {Node} domNode - the DOM node that just received a new child
   */
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

      if (_scoringMode === 'none') return;

      const hasModel = Boolean(
        _runtimeModel?.model && _runtimeModel?.vectorizer?.descriptors?.length
      );
      const hScore = (_scoringMode !== 'model')
        ? HeuristicClassifier.scoreDirect(candidate, domNode)
        : null;

      if (_scoringMode === 'model') {
        const featureExtractor = window.__PSEUDODOM_FEATURE_EXTRACTOR__?.extractFeatures;
        if (!hasModel || typeof featureExtractor !== 'function') return;
        const featureValues = featureExtractor(domNode, pseudoNode, candidate, _pageSignals || null);
        score = HeuristicClassifier.predictDirect(featureValues);
      } else {
        // heuristic mode — optionally blend model if available
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

    /***
     * checkString(value)
     *
     * WHY THIS EXISTS:
     * When a mutation targets a UGC region with a string value (innerHTML, insertAdjacentHTML,
     * document.write, etc.), we scan that string for known XSS attack patterns before
     * letting it reach the real DOM API.
     *
     * We iterate the PATTERNS array in order of severity. The order matters: more
     * definitive indicators (script tags, javascript: protocol, event handlers) come
     * first so we can return immediately on a clear-cut block without testing weaker
     * patterns. Each pattern specifies:
     *   - `re`: a regex that matches the attack vector
     *   - `severity`: 'block' (halt the mutation) or 'flag' (log but allow)
     *   - `reason`: a short label sent with the SECURITY_EVENT to the background
     *
     * If no pattern matches, `{ safe: true }` is returned and the mutation proceeds.
     *
     * NOTE ON FALSE POSITIVES:
     * The patterns are deliberately conservative to avoid breaking legitimate pages.
     * For example, `\b on\w+\s*=` (event handler) requires a word boundary before
     * "on" to avoid matching "icon=value" or "button=on". Template injection `{{ }}`
     * only flags, never blocks, because some frameworks use this syntax legitimately.
     *
     * @param {*} value - the string being injected (or any value — returns safe for non-strings)
     * @returns {{ safe: boolean, severity?: string, reason?: string }}
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

    /***
     * checkAttribute(name, value)
     *
     * WHY THIS EXISTS:
     * Attributes are a distinct attack surface from HTML strings. An attacker who can
     * set attributes on elements inside a UGC region might set:
     *   - `onclick="stealCookies()"` — event handler attribute (direct XSS)
     *   - `href="javascript:..."` — javascript: URL in a link
     *   - `src="data:text/html,<script>..."` — data: URI embedding executable HTML
     *   - `srcdoc="<script>..."` — iframe srcdoc containing scripts
     *
     * This function handles the attribute-specific attack vectors that checkString()
     * does not cover well (because checkString uses regex on the entire string; for
     * attributes we can be more precise by checking the attribute NAME first).
     *
     * KEY DECISIONS:
     * - Any on* attribute (onclick, onmouseover, onerror...) is a definite block.
     *   There is no legitimate UGC reason to set event handler attributes — those
     *   come from the site's own JavaScript, never from user content.
     * - For href/src/action/formaction/srcdoc/data: we check the VALUE for dangerous
     *   prefixes (javascript:, data:), then for srcdoc we also run checkString() on
     *   the full value since srcdoc is essentially an inline HTML string.
     *
     * @param {string} name  - the attribute name being set
     * @param {string} value - the new attribute value
     * @returns {{ safe: boolean, severity?: string, reason?: string }}
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

    /***
     * verdict(type, value, attrName)
     *
     * WHY THIS EXISTS:
     * The DOM wrappers need a single call that takes a mutation's type, value, and
     * optional attribute name and returns a clear ACTION: 'pass', 'flag', or 'block'.
     * verdict() dispatches to the correct checker (checkAttribute or checkString)
     * based on the mutation type, then translates the checker result into an action.
     *
     * WHY TWO SEVERITY LEVELS?
     * - 'block': definitive attacks (script tags, javascript:, event handlers). The
     *   mutation is cancelled entirely — the original DOM API is NOT called. The page
     *   script's DOM write is silently dropped.
     * - 'flag': suspicious but ambiguous patterns (iframes, template syntax, CSS
     *   expressions). We log a SECURITY_EVENT to the background for later analysis
     *   but DO NOT block — blocking on ambiguous patterns would break legitimate pages.
     *
     * WHY SEND TO BACKGROUND?
     * Security events (both block and flag) are sent to the background service worker
     * via _sendToBackground('SECURITY_EVENT', ...) so they are persisted in
     * chrome.storage and visible in the popup's Security Events panel. This creates
     * a log of suspicious DOM mutations for security analysis without requiring any
     * external server connection during the detection phase.
     *
     * @param {string}      type     - mutation type label (e.g. 'innerHTML', 'setAttribute')
     * @param {string}      value    - the string value or attribute value being set
     * @param {string|null} attrName - the attribute name for setAttribute mutations, else null
     * @returns {{ action: 'pass'|'flag'|'block', reason?: string }}
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

  /***
   * makeWrapper(mutationType, originalFn, extractArgs)
   *
   * WHY THIS EXISTS:
   * We need to intercept ~25 different DOM mutation methods with the SAME three-step
   * logic: (1) record in PseudoDOM, (2) run security check if in UGC region, (3) call
   * original. Writing that logic out 25 times would be error-prone and unmaintainable.
   * makeWrapper() is a factory that generates the interceptor function for each method,
   * parameterized only by how to extract the relevant arguments from the specific call.
   *
   * HOW IT WORKS:
   * - `mutationType`: a string label for the mutation log (e.g. 'appendChild', 'innerHTML')
   * - `originalFn`: the real DOM prototype method, captured in _originals before any
   *   patching. We always call this (unless blocked) to ensure the page works correctly.
   * - `extractArgs`: a tiny adapter function that maps (this, args) → { target, content, attrName }.
   *   Different DOM APIs have different signatures:
   *     - appendChild(child) → target=this, content=child
   *     - insertBefore(newNode, ref) → target=this, content=newNode
   *     - removeChild(child) → target=this, content=null (removal, not insertion)
   *   The extractArgs adapter encapsulates each API's signature so the core logic
   *   is API-agnostic.
   *
   * THE RETURNED intercepted() FUNCTION:
   * 1. Calls extractArgs(this, args) to get target, content, attrName
   * 2. Calls PseudoDOM.record() to mirror the mutation — always, even for removals
   * 3. If content is non-null (an insertion) AND the target is in a UGC region,
   *    calls SecurityGate.verdict(). On 'block', returns immediately without calling
   *    the original — the mutation is cancelled.
   * 4. Calls the original function with the original `this` and args
   * 5. Calls _tryEagerPromotion() on the target so UGC detection is updated
   *    synchronously before the next mutation arrives
   *
   * WHY WRAP IN try/catch?
   * Steps 1–3 are our code; step 4 is the original browser API. If our code throws
   * (e.g. due to a malformed element or an unexpected browser state), we must not
   * prevent the original DOM call — that would break the page. The try/catch around
   * our pre-processing ensures we degrade gracefully: worst case, a mutation goes
   * unrecorded but the page continues to work.
   *
   * @param {string}   mutationType - label for PseudoDOM mutation log
   * @param {Function} originalFn   - the saved original prototype method
   * @param {Function} extractArgs  - function(thisArg, args) → { target, content, attrName }
   * @returns {Function} the interceptor function to install on the prototype
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

  /***
   * _initClassify()
   *
   * WHY THIS EXISTS:
   * This is the "startup sequence" triggered at DOMContentLoaded. It does three things
   * in sequence:
   *
   * 1. PseudoDOM.seedFromLiveDOM() — walk the entire live DOM tree and register all
   *    existing elements in the PseudoDOM mirror. This is critical for SSR pages where
   *    the HTML was already parsed before any of our wrappers ran. Without this step,
   *    those elements would be invisible to the classifier.
   *
   * 2. HeuristicClassifier.classify() — run the full scoring pipeline on all
   *    candidates found by getCandidateRoots(). This populates ugcRegionMap with
   *    initial confidence scores and draws the red highlight on the best candidate.
   *    `void` is used to explicitly discard the returned Promise (classify is async).
   *
   * 3. _sendToBackground('PSEUDO_DOM_SNAPSHOT', ...) — serialize the PseudoDOM and
   *    send it to the background service worker, which persists it in chrome.storage.
   *    This snapshot is what the popup reads to display candidate information.
   *
   * WHY ONLY CALLED ONCE (at DOMContentLoaded)?
   * The MutationObserver and _onNavigation() handle subsequent reclassifications.
   * _initClassify() is specifically for the initial parse-time scan. Calling it again
   * later would re-seed the PseudoDOM (harmless but wasteful).
   */
  function _initClassify() {
    PseudoDOM.seedFromLiveDOM();
    void HeuristicClassifier.classify();
    _sendToBackground('PSEUDO_DOM_SNAPSHOT', PseudoDOM.serialize());
  }

  // If the wrapper script loaded after DOMContentLoaded already fired (common on
  // fast-loading or cached pages where the async <script src> fetch finishes late),
  // run immediately instead of waiting for the listener that will never fire.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initClassify);
  } else {
    _scheduleClassify(200); // DOM ready — seed + classify after a short settle delay
    PseudoDOM.seedFromLiveDOM();
  }

  /**
   * MutationObserver: supplementary post-mutation region tracking.
   * Used to detect new UGC regions that emerge during SPA transitions.
   * Does NOT block mutations — that is the prototype wrapper's job.
   *
   * Watches both childList (new nodes added) and a limited attribute set
   * (style/class/hidden) so that "reveal by CSS" comment sections — where
   * the site just removes display:none from an existing container — also
   * trigger reclassification.
   */
  const _observer = new MutationObserver((_mutations) => {
    let needsReclassify = false;
    for (const m of _mutations) {
      if (m.addedNodes.length > 0) {
        needsReclassify = true;
        break;
      }
      // Reveal-by-CSS pattern: a style/class/hidden change on an element that
      // already has children may mean a comment section was just un-hidden.
      if (m.type === 'attributes' && m.target.children.length >= 3) {
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
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open'],
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
  /***
   * _scheduleClassify(delay)
   *
   * WHY THIS EXISTS:
   * Multiple events can trigger a classify() run in quick succession:
   * - PAGE_SIGNALS arrives from the background (content_bridge forwarded HTTP headers)
   * - RUNTIME_MODEL arrives immediately after
   * - FEATURE_EXTRACTOR_READY fires 50ms later when the module finishes loading
   * - A MutationObserver batch fires 300ms after DOM settles
   *
   * If each of these called classify() directly, we would run 4 scoring passes in
   * the first second of page load, each one briefly highlighting a different element.
   * That is wasteful and causes visible flicker.
   *
   * _scheduleClassify() is a debounce wrapper: it cancels any pending timer before
   * setting a new one. Only the LAST scheduling call within `delay` ms actually
   * triggers classify(). All earlier calls are coalesced into one.
   *
   * DEFAULT DELAY: 80ms — short enough to feel instant to the user, long enough
   * to collapse rapid-fire signals (PAGE_SIGNALS + RUNTIME_MODEL + FEATURE_EXTRACTOR_READY
   * typically arrive within 20ms of each other on a warm cache).
   *
   * @param {number} [delay=80] - milliseconds to wait before calling classify()
   */
  function _scheduleClassify(delay) {
    clearTimeout(_classifyTimer);
    _classifyTimer = setTimeout(() => void HeuristicClassifier.classify(), delay || 80);
  }

  let _lastHref = window.location.href;
  let _navTimer  = null;

  /***
   * _onNavigation()
   *
   * WHY THIS EXISTS:
   * Single-Page Applications (React, Vue, TikTok, Facebook, YouTube) navigate between
   * pages WITHOUT doing a full page reload. Instead they call history.pushState() or
   * history.replaceState() to update the URL, then swap out DOM content via JavaScript.
   * From the browser's perspective it is still the same page — our content script
   * stays running and our wrappers stay in place. But from a UGC detection perspective,
   * the old page's comment section is gone and a completely new page needs to be scanned.
   *
   * This function handles that transition:
   * 1. Checks if the URL actually changed (some sites call pushState without a real
   *    navigation — we compare against _lastHref to detect true changes).
   * 2. Clears the stale red highlight from the previous page immediately, so the user
   *    is not confused by an outline on a comment section that no longer exists.
   * 3. Cancels any pending classify() or SPA-navigation timer from the old page.
   * 4. After 700ms, seeds the PseudoDOM from the new page's DOM and runs classify().
   *
   * WHY 700ms?
   * SPA routing typically renders the new page's shell immediately (e.g. article body)
   * but loads comments LAZILY, 400–800ms later. Waiting 700ms catches the first lazy
   * load of comments while still feeling responsive. The MutationObserver handles
   * subsequent lazy-load updates after classify() runs.
   *
   * WHY WRAP BOTH pushState AND replaceState?
   * SPAs use both:
   * - pushState: forward navigation (clicking a link)
   * - replaceState: URL canonicalization without adding a history entry
   * We wrap both so neither type of URL change goes undetected.
   *
   * popstate and hashchange events cover the browser's back/forward buttons.
   */
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

  /***
   * _sendToBackground(type, payload)
   *
   * WHY THIS EXISTS:
   * This script runs in the MAIN world (the page's own JavaScript context). It cannot
   * call chrome.runtime.sendMessage() directly — that API is only available to content
   * scripts running in the ISOLATED world. To communicate with the background service
   * worker, this script uses window.postMessage() to pass messages to content_bridge.js
   * (which DOES run in the ISOLATED world and can relay them to the background).
   *
   * The message is tagged with `__pseudodom: true` so content_bridge.js recognizes it
   * as coming from this wrapper and not from some random page script also using
   * window.postMessage. Messages WITHOUT the `__push: true` flag (like this one) are
   * messages FROM the wrapper TO the bridge — the bridge forwards them to the background
   * via chrome.runtime.sendMessage().
   *
   * WHAT GETS SENT:
   * - 'WRAPPER_READY': handshake at startup, telling the bridge the wrapper is listening
   * - 'PSEUDO_DOM_SNAPSHOT': serialized PseudoDOM, sent at DOMContentLoaded
   * - 'CANDIDATE_FEATURES': per-candidate feature data for high-confidence UGC regions
   * - 'SECURITY_EVENT': blocked or flagged XSS patterns detected by SecurityGate
   *
   * The '*' target origin is intentional — we are always posting to the same tab's
   * own window, not cross-origin, so the security concern of wildcard origins does
   * not apply (same as in content_bridge.js's postToPage function).
   *
   * @param {string} type    - message type string (e.g. 'SECURITY_EVENT')
   * @param {*}      payload - any JSON-serializable data
   */
  function _sendToBackground(type, payload) {
    window.postMessage({ __pseudodom: true, type, payload }, '*');
  }

  let _pageSignals = null;
  let _runtimeModel = null;
  let _scoringMode = 'heuristic'; // 'model' | 'heuristic' | 'none'

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
      _autoHighlightEnabled = Boolean(event.data.payload?.enabled);
      if (!_autoHighlightEnabled) _clearAllHighlights();
      else _scheduleClassify();
      return;
    }

    if (event.data.type === 'SCORING_MODE') {
      _scoringMode = event.data.payload?.mode || 'heuristic';
      _scheduleClassify();
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
    scoringMode:    () => _scoringMode,
    featureExtractorReady: () => Boolean(window.__PSEUDODOM_FEATURE_EXTRACTOR__?.extractFeatures),
  };

  _sendToBackground('WRAPPER_READY', { ready: true });

})(); // end PseudoDOMGuard IIFE
