// Content Edit & Blur - shared page model, constants, and selectors
// Loaded first. All page scripts share this isolated-world lexical scope.

    /** @typedef {[number, number]} Point */
    /** @typedef {{ x: number, y: number, width: number, height: number }} Bounds */
    /** @typedef {'page' | 'site'} Scope */
    /** @typedef {1 | 2} BlurLevel */
    /** @typedef {'blur' | 'hide' | 'redact'} RuleKind */
    /** @typedef {'blur' | 'redact'} AreaKind */
    /** @typedef {'ellipse' | 'rect' | 'arrow' | 'pen' | 'marker' | 'text' | 'step'} AnnotationKind */
    /** @typedef {'nw' | 'ne' | 'sw' | 'se'} AreaCorner */

    /**
     * @typedef {{
     *   id: string,
     *   kind: RuleKind,
     *   selector: string,
     *   level: 0 | BlurLevel,
     *   scope: Scope
     * }} Rule
     */

    /**
     * @typedef {{
     *   id: string,
     *   kind: AreaKind,
     *   x: number,
     *   y: number,
     *   width: number,
     *   height: number,
     *   level: BlurLevel,
     *   scope: Scope
     * }} Area
     */

    /**
     * @typedef {{ id: string, oldText: string, newText: string, scope: Scope }} Replacement
     */

    /**
     * @typedef {{
     *   id: string,
     *   kind: AnnotationKind,
     *   points: Point[],
     *   text: string,
     *   color: string,
     *   size: number,
     *   boxW: number,
     *   persist: boolean,
     *   scope: 'page'
     * }} Annotation
     */

    /**
     * @typedef {{
     *   rules: Rule[],
     *   areas: Area[],
     *   replacements: Replacement[],
     *   annotations: Annotation[]
     * }} AppState
     */

    /**
     * @typedef {{
     *   uiMode: 'essentials' | 'advanced',
     *   persistEnabled: boolean,
     *   defaultScope: Scope,
     *   blurStrength: BlurLevel,
     *   drawKind: AreaKind,
     *   annotateTool: AnnotationKind,
     *   annotateColor: string,
     *   annotateMarkerColor: string,
     *   annotateKeep: boolean,
     *   annotateSize: number
     * }} Settings
     */

    /**
     * @typedef {{
     *   v: number,
     *   rules: Rule[],
     *   areas: Area[],
     *   replacements: Replacement[],
     *   annotations: Annotation[]
     * }} SerializedChanges
     */

    /** @typedef {{ id?: string, kind: RuleKind, selector: string, level?: unknown, scope?: Scope }} StoredRule */
    /** @typedef {{ id?: string, kind?: AreaKind, x: number, y: number, width: number, height: number, level?: unknown, scope?: Scope }} StoredArea */
    /** @typedef {{ id?: string, oldText: string, newText: string, scope?: Scope }} StoredReplacement */
    /** @typedef {{ selector: string, level?: BlurLevel }} LegacyBlur */
    /** @typedef {{ id?: string, x: number, y: number, width: number, height: number }} LegacyArea */
    /**
     * @typedef {{
     *   v?: number,
     *   rules?: StoredRule[],
     *   areas?: StoredArea[],
     *   replacements?: StoredReplacement[],
     *   annotations?: Array<Partial<Annotation>>,
     *   blurs?: LegacyBlur[],
     *   hidden?: string[],
     *   drawnAreas?: LegacyArea[]
     * }} RawChanges
     */

    /**
     * @typedef {{
     *   rules: unknown[],
     *   areas: unknown[],
     *   replacements: unknown[],
     *   annotations?: unknown[]
     * }} ContentPayload
     */

    /** @typedef {{ type: 'rule' | 'area', id: string }} PrivacySelection */
    /**
     * @typedef {{
     *   id: string,
     *   mode: 'move' | 'resize',
     *   corner: AreaCorner | null,
     *   origin: Point,
     *   from: Bounds,
     *   moved: boolean
     * }} AreaDrag
     */

    /** @type {readonly [string, string, string]} */
    const BLUR_LEVELS = ["0px", "4px", "20px"];
    const TEXT_NODE_ID = 3;
    const ELEMENT_NODE_ID = 1;

    // Toolbar, toasts and the draw overlay are page-level UI. The script is injected
    // into every frame, so without this guard an embed-heavy page renders one toolbar
    // per iframe.
    const isTopFrame = (function() {
        try {
            return window.top === window.self;
        } catch (e) {
            return false;
        }
    })();

    /** @type {string} */
    let currentModeId = "idle";
    /** @type {HTMLImageElement | null} */
    let imgElement = null;
    /** @type {HTMLInputElement | null} */
    let inputElement = null;

    const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
    const MOD = isMac ? '⌘' : 'Ctrl+';
    /** @returns {string} */
    function undoShortcutLabel() {
        return isMac ? '⌘Z' : 'Ctrl+Z';
    }
    
    // Draw mode state
    let isDrawing = false;
    let drawStartX = 0;
    let drawStartY = 0;
    /** @type {HTMLDivElement | null} */
    let drawOverlay = null;
    /** @type {HTMLDivElement | null} */
    let drawRect = null;
    /** @type {AreaDrag | null} */
    let areaDrag = null;
    /** @type {PrivacySelection | null} */
    let selectedPrivacy = null; // { type: 'rule'|'area', id }; never persisted
    /** @type {HTMLDivElement | null} */
    let privacyHandles = null;

    // ========== STATE MODEL (v2) ==========
    //
    // v1 stored parallel arrays (blurs / hidden / drawnAreas). That shape has no stable
    // identity per entry, so a rule cannot be listed, re-scoped or deleted individually,
    // and undo had to be a pile of per-action inverse operations that redo cannot reuse.
    //
    //   rule        { id, kind: 'blur'|'hide'|'redact', selector, level, scope }
    //   area        { id, kind: 'blur'|'redact', x, y, width, height, scope }
    //   replacement { id, oldText, newText, scope }
    //   annotation  { id, kind: 'ellipse'|'rect'|'arrow'|'pen'|'marker'|'text'|'step',
    //                 points: [[x,y], ...], text, color, size, boxW, persist, scope }
    //
    // scope is 'page' (this exact URL) or 'site' (every page on this origin).
    //
    // Annotations are the one additive kind - everything else removes or alters existing
    // content. They are also the one kind that is session-only by default: "blur my salary"
    // is a durable intent worth restoring on every visit, "circle this button" is usually
    // for a single screenshot. `persist` opts an annotation into being saved.
    const SCHEMA_VERSION = 2;
    /** @type {readonly RuleKind[]} */
    const KINDS = ['blur', 'hide', 'redact'];
    /** @type {readonly AnnotationKind[]} */
    const ANNOTATION_KINDS = ['ellipse', 'rect', 'arrow', 'pen', 'marker', 'text', 'step'];
    // Kinds grouped by how their geometry behaves, so the many places that branch on
    // shape stay in step with each other as tools are added.
    /** @type {readonly AnnotationKind[]} */
    const FREEHAND_KINDS = ['pen', 'marker'];          // sampled path, N points
    /** @type {readonly AnnotationKind[]} */
    const TWO_POINT_KINDS = ['ellipse', 'rect', 'arrow']; // dragged out, resizable
    /** @type {readonly AnnotationKind[]} */
    const ANCHORED_KINDS = ['text', 'step'];           // placed with a click, 1 point
    /** @type {readonly AnnotationKind[]} */
    const STROKE_KINDS = ['ellipse', 'rect', 'arrow', 'pen']; // share the width control
    // Hidden in Essentials. Keep this beside the markup gate so switching density can
    // never strand the user in a selected tool whose control disappeared.
    const ADVANCED_ANNOTATE_TOOLS = ['step'];
    // Shown in the rules panel, where "rect" and "pen" mean nothing to a reader.
    /** @type {Record<AnnotationKind, string>} */
    const ANNOTATION_LABELS = {
        ellipse: 'circle', rect: 'box', arrow: 'arrow',
        pen: 'freehand drawing', marker: 'highlight', text: 'note', step: 'step badge'
    };

    // Minimum points each kind needs to be renderable: a start and an end, except text
    // and step badges which are anchored by a single point.
    /** @type {Record<AnnotationKind, number>} */
    const ANNOTATION_MIN_POINTS = { ellipse: 2, rect: 2, arrow: 2, pen: 2, marker: 2, text: 1, step: 1 };
    // A pen stroke is bounded so a long scribble cannot stall the render path or bloat
    // storage. Both limits are enforced by thinning the stroke, never by cutting it
    // short, so its shape is always preserved end to end.
    const PEN_MAX_POINTS = 600;
    const PEN_MIN_GAP = 2;
    // A marker is a chisel tip, not a ballpoint: far wider, and drawn with flat caps.
    const MARKER_SIZE = 16;
    const STEP_RADIUS = 14;
    const ANNOTATION_STROKE_MIN = 1;
    const ANNOTATION_STROKE_MAX = 20;
    const ANNOTATION_STROKE_DEFAULT = 3;

    // Evenly thins a list down to at most `max` entries, always keeping the first and
    // last so the stroke still starts and ends where the user put it.
    /**
     * @param {Point[]} points
     * @param {number} max
     * @returns {Point[]}
     */
    function decimate(points, max) {
        if (points.length <= max) return points;
        const stride = points.length / max;
        const out = [];
        for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * stride)]);
        out.push(points[points.length - 1]);
        return out;
    }

    /** @type {readonly string[]} */
    const ANNOTATION_PALETTE = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#111827'];
    // A highlighter needs its own palette. These colours are multiplied into the page
    // rather than painted over it, and the line-work palette above is far too saturated
    // for that — multiplying #e11d48 over text leaves an almost black smear.
    /** @type {readonly string[]} */
    const MARKER_PALETTE = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];
    /** @type {Record<string, string>} */
    const ANNOTATION_COLOR_NAMES = {
        '#e11d48': 'Crimson', '#f59e0b': 'Amber', '#16a34a': 'Green',
        '#2563eb': 'Blue', '#111827': 'Ink', '#fde047': 'Yellow',
        '#86efac': 'Mint', '#93c5fd': 'Sky', '#f9a8d4': 'Pink', '#fdba74': 'Peach'
    };

    /**
     * @param {AnnotationKind} kind
     * @returns {readonly string[]}
     */
    function paletteFor(kind) {
        return kind === 'marker' ? MARKER_PALETTE : ANNOTATION_PALETTE;
    }

    /**
     * @param {string} hex
     * @returns {string}
     */
    function annotationColorName(hex) {
        return ANNOTATION_COLOR_NAMES[String(hex).toLowerCase()] || hex;
    }

    /** @type {AppState} */
    let state = { rules: [], areas: [], replacements: [], annotations: [] };

    /** @returns {AppState} */
    function emptyState() {
        return { rules: [], areas: [], replacements: [], annotations: [] };
    }

    // UI settings, mirrored from chrome.storage so the render path stays synchronous.
    /** @type {Settings} */
    let settings = {
        uiMode: 'essentials',          // 'essentials' | 'advanced'
        persistEnabled: true,          // remember eligible changes after reload
        defaultScope: 'page',          // scope applied to newly created rules
        blurStrength: 1,               // index into BLUR_LEVELS for new blur rules
        drawKind: 'blur',              // 'blur' | 'redact' for newly drawn areas
        annotateTool: 'arrow',         // active annotation tool
        annotateColor: ANNOTATION_PALETTE[0],
        annotateMarkerColor: MARKER_PALETTE[0], // tracked separately: see MARKER_PALETTE
        annotateKeep: false,           // whether new annotations survive a reload
        annotateSize: ANNOTATION_STROKE_DEFAULT // width for new line-based annotations
    };

    // Colour reaches SVG presentation attributes and inline CSS, and size reaches
    // stroke-width and font-size, so both are validated rather than trusted. An imported
    // file is untrusted input: anything but an exact 6-digit hex is replaced, which makes
    // it impossible to smuggle in extra declarations the way a raw string could.
    /**
     * @param {unknown} value
     * @param {string} [fallback]
     * @returns {string}
     */
    function safeColor(value, fallback) {
        const ok = /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
        return ok ? String(value) : (fallback || ANNOTATION_PALETTE[0]);
    }

    /**
     * @param {unknown} value
     * @param {number} min
     * @param {number} max
     * @param {number} fallback
     * @returns {number}
     */
    function safeNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    /**
     * @param {unknown} value
     * @param {BlurLevel} [fallback]
     * @returns {BlurLevel}
     */
    function safeBlurLevel(value, fallback = 1) {
        return Number(value) === 2 ? 2 : Number(value) === 1 ? 1 : fallback;
    }

    /**
     * @param {unknown} points
     * @param {number} minCount
     * @returns {Point[] | null}
     */
    function safePoints(points, minCount) {
        if (!Array.isArray(points)) return null;
        const candidates = /** @type {unknown[]} */ (points);
        const clean = candidates
            .filter(p => Array.isArray(p) && p.length === 2
                && p.every(n => typeof n === 'number' && Number.isFinite(n)))
            .map(p => {
                const point = /** @type {number[]} */ (p);
                return /** @type {Point} */ ([point[0], point[1]]);
            });
        return clean.length >= minCount ? clean : null;
    }

    // Returns a fully validated annotation, or null if it cannot be rendered safely.
    /**
     * @param {Partial<Annotation> | null | undefined} raw
     * @returns {Annotation | null}
     */
    function sanitizeAnnotation(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const kind = raw.kind;
        if (!kind || !ANNOTATION_KINDS.includes(kind)) return null;

        const points = safePoints(raw.points, ANNOTATION_MIN_POINTS[kind]);
        if (!points) return null;

        // A stray multi-thousand-point pen stroke would stall the render path. Thin it
        // rather than truncating, which would cut the stroke short instead of keeping
        // its shape.
        const capped = FREEHAND_KINDS.includes(kind)
            ? decimate(points, PEN_MAX_POINTS)
            : points.slice(0, ANCHORED_KINDS.includes(kind) ? 1 : 2);

        return {
            id: raw.id || newId('n'),
            kind,
            points: capped,
            text: kind === 'text' ? String(raw.text || '').slice(0, 2000) : '',
            color: safeColor(raw.color, paletteFor(kind)[0]),
            size: kind === 'text' ? safeNumber(raw.size, 10, 72, 16)
                : kind === 'marker' ? safeNumber(raw.size, 4, 60, MARKER_SIZE)
                : kind === 'step' ? safeNumber(raw.size, 8, 48, STEP_RADIUS)
                : safeNumber(raw.size, 1, 20, ANNOTATION_STROKE_DEFAULT),
            boxW: safeNumber(raw.boxW, 40, 1200, 220),
            persist: raw.persist === true,
            scope: 'page'
        };
    }

    let idCounter = 0;
    /**
     * @param {string} prefix
     * @returns {string}
     */
    function newId(prefix) {
        idCounter += 1;
        return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
    }

    /**
     * @param {AppState} s
     * @returns {AppState}
     */
    function cloneState(s) {
        return {
            rules: s.rules.map(r => ({ ...r })),
            areas: s.areas.map(a => ({ ...a })),
            replacements: s.replacements.map(r => ({ ...r })),
            // points is the only nested value in the model, so it needs its own copy or
            // history snapshots would share the array with live state and undo would be
            // unable to restore a moved annotation.
            annotations: (s.annotations || []).map(a => ({
                ...a,
                points: a.points.map(p => /** @type {Point} */ ([p[0], p[1]]))
            }))
        };
    }

    // Opaque origins (about:blank, about:srcdoc, data:) all report origin "null", so every
    // such frame on every website would share one global bucket. Rules made in them are
    // kept in memory for this session but never written to or read from storage.
    // Mirrors isPersistableUrl() in background.js.
    /**
     * @param {string} url
     * @returns {boolean}
     */
    function isPersistableUrl(url) {
        try {
            const u = new URL(url);
            return u.origin !== 'null' && (u.protocol === 'http:' || u.protocol === 'https:');
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {string} url
     * @returns {string}
     */
    function storageKeyForUrl(url) {
        try {
            const u = new URL(url);
            return `changes_${u.origin}${u.pathname}`;
        } catch (e) {
            return `changes_${url}`;
        }
    }

    /**
     * @param {string} url
     * @returns {string}
     */
    function siteKeyForUrl(url) {
        try {
            return `site_${new URL(url).origin}`;
        } catch (e) {
            return `site_${url}`;
        }
    }

    // Accepts either schema and always returns v2. Existing users keep their data.
    /**
     * @param {RawChanges | null | undefined} raw
     * @param {Scope} scope
     * @returns {AppState}
     */
    function migrateChanges(raw, scope) {
        const empty = emptyState();
        if (!raw || typeof raw !== 'object') return empty;

        if (raw.v === SCHEMA_VERSION || Array.isArray(raw.rules)) {
            return {
                rules: (raw.rules || []).filter(r => r && r.selector && KINDS.includes(r.kind))
                    .map(r => ({
                        id: r.id || newId('r'),
                        kind: r.kind,
                        selector: r.selector,
                        level: r.kind === 'blur' ? safeBlurLevel(r.level) : 0,
                        scope: r.scope || scope
                    })),
                // All four geometry values reach el.style.cssText in renderArea, so a
                // crafted import file could otherwise smuggle in extra CSS declarations.
                // Validate every one, not just x.
                areas: (raw.areas || []).filter(a => a && /** @type {Array<keyof Bounds>} */ (['x', 'y', 'width', 'height'])
                    .every(k => typeof a[k] === 'number' && Number.isFinite(a[k])))
                    .map(a => ({
                        id: a.id || newId('a'),
                        kind: a.kind === 'redact' ? 'redact' : 'blur',
                        x: a.x, y: a.y, width: a.width, height: a.height,
                        // Existing Area blurs were always 20px, so missing levels must
                        // migrate to Strong to preserve their appearance.
                        level: safeBlurLevel(a.level, 2),
                        scope: a.scope || scope
                    })),
                replacements: (raw.replacements || []).filter(r => r && r.oldText)
                    .map(r => ({
                        id: r.id || newId('t'),
                        oldText: r.oldText,
                        newText: r.newText,
                        scope: r.scope || scope
                    })),
                annotations: (raw.annotations || []).map(sanitizeAnnotation)
                    .filter(annotation => annotation !== null)
            };
        }

        // v1 -> v2
        /** @type {Rule[]} */
        const rules = [];
        (raw.blurs || []).forEach(b => {
            if (b && b.selector) {
                rules.push({ id: newId('r'), kind: 'blur', selector: b.selector, level: b.level || 1, scope });
            }
        });
        (raw.hidden || []).forEach(selector => {
            if (selector) rules.push({ id: newId('r'), kind: 'hide', selector, level: 0, scope });
        });
        return {
            rules,
            areas: (raw.drawnAreas || []).map(a => ({
                id: a.id || newId('a'),
                kind: 'blur',
                x: a.x, y: a.y, width: a.width, height: a.height,
                level: 2,
                scope
            })),
            replacements: (raw.replacements || []).map(r => ({
                id: newId('t'), oldText: r.oldText, newText: r.newText, scope
            })),
            // v1 predates annotations entirely.
            annotations: []
        };
    }

    /**
     * @param {Scope} scope
     * @returns {SerializedChanges}
     */
    function serializeScope(scope) {
        return {
            v: SCHEMA_VERSION,
            rules: state.rules.filter(r => r.scope === scope),
            areas: state.areas.filter(a => a.scope === scope),
            replacements: state.replacements.filter(r => r.scope === scope),
            // Annotations are page-scoped by nature - "put this arrow at these coordinates
            // on every page of the domain" has no meaning - and only saved once the user
            // has explicitly asked to keep them. A note still being typed has no text yet
            // and must not be written out as an invisible empty mark.
            annotations: scope === 'page'
                ? state.annotations.filter(a => a.persist && (a.kind !== 'text' || a.text !== ''))
                : []
        };
    }

    /**
     * @param {ContentPayload} payload
     * @returns {boolean}
     */
    function isEmptyPayload(payload) {
        return !payload.rules.length && !payload.areas.length
            && !payload.replacements.length && !(payload.annotations || []).length;
    }

    /** @returns {number} */
    function ruleCount() {
        return state.rules.length + state.areas.length
            + state.replacements.length + state.annotations.length;
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    function escapeSelectorPart(value) {
        if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    // Our own classes are added as a side effect of hiding/blurring, so they must never
    // end up in a saved selector - on a fresh page load the class is not there yet and
    // the selector would never match.
    /**
     * @param {Element} el
     * @returns {string[]}
     */
    function stableClassesOf(el) {
        if (!el.classList) return [];
        return Array.from(el.classList).filter(c => c && !c.startsWith('ceb-'));
    }

    /**
     * @param {string} selector
     * @param {Element} el
     * @returns {boolean}
     */
    function selectorMatchesOnly(selector, el) {
        try {
            return Boolean(selector) && document.querySelector(selector) === el;
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {Element} el
     * @returns {string}
     */
    function structuralPath(el) {
        const path = [];
        /** @type {Element | null} */
        let node = el;
        while (node && node.nodeType === ELEMENT_NODE_ID && node !== document.documentElement) {
            const tagName = node.tagName;
            /** @type {Element | null} */
            const parent = node.parentElement;
            let segment = tagName.toLowerCase();
            if (parent) {
                const sameTag = Array.from(parent.children).filter(s => s.tagName === tagName);
                if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            path.unshift(segment);
            node = parent;
        }
        return path.join(' > ');
    }

    // Generate unique selector for element
    /**
     * @param {Element | null | undefined} el
     * @returns {string}
     */
    function getElementSelector(el) {
        if (!el || el.nodeType !== ELEMENT_NODE_ID) return '';
        if (el === document.body) return 'body';
        if (el === document.documentElement) return 'html';

        const candidates = [];

        if (el.id) candidates.push(`#${escapeSelectorPart(el.id)}`);

        const path = [];
        /** @type {Element | null} */
        let node = el;
        while (node && node.nodeType === ELEMENT_NODE_ID && node !== document.documentElement) {
            if (node.id) {
                path.unshift(`#${escapeSelectorPart(node.id)}`);
                break;
            }
            const tagName = node.tagName;
            let segment = tagName.toLowerCase();
            const classes = stableClassesOf(node).slice(0, 2);
            if (classes.length) {
                segment += classes.map(c => `.${escapeSelectorPart(c)}`).join('');
            }
            /** @type {Element | null} */
            const parent = node.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(s => s.tagName === tagName);
                if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            path.unshift(segment);
            node = parent;
        }
        if (path.length) candidates.push(path.join(' > '));

        candidates.push(structuralPath(el));

        // Only keep a selector that actually round-trips back to this exact element.
        for (const candidate of candidates) {
            if (selectorMatchesOnly(candidate, el)) return candidate;
        }
        return '';
    }
