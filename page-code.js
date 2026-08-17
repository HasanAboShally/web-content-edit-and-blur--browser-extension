// Content Edit & Blur v2.0 - Page Script
(function() {
    if (window.__cebInitialized) {
        return;
    }
    window.__cebInitialized = true;

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

    let currentModeId = "idle";
    let imgElement = null;
    let inputElement = null;

    const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
    const MOD = isMac ? '⌘' : 'Ctrl+';
    function undoShortcutLabel() {
        return isMac ? '⌘Z' : 'Ctrl+Z';
    }
    
    // Draw mode state
    let isDrawing = false;
    let drawStartX = 0;
    let drawStartY = 0;
    let drawOverlay = null;
    let drawRect = null;

    // ========== STATE MODEL (v2) ==========
    //
    // v1 stored parallel arrays (blurs / hidden / drawnAreas). That shape has no stable
    // identity per entry, so a rule cannot be listed, re-scoped or deleted individually,
    // and undo had to be a pile of per-action inverse operations that redo cannot reuse.
    //
    //   rule        { id, kind: 'blur'|'hide'|'redact', selector, level, scope }
    //   area        { id, kind: 'blur'|'redact', x, y, width, height, scope }
    //   replacement { id, oldText, newText, scope }
    //   annotation  { id, kind: 'ellipse'|'rect'|'arrow'|'pen'|'text',
    //                 points: [[x,y], ...], text, color, size, boxW, persist, scope }
    //
    // scope is 'page' (this exact URL) or 'site' (every page on this origin).
    //
    // Annotations are the one additive kind - everything else removes or alters existing
    // content. They are also the one kind that is session-only by default: "blur my salary"
    // is a durable intent worth restoring on every visit, "circle this button" is usually
    // for a single screenshot. `persist` opts an annotation into being saved.
    const SCHEMA_VERSION = 2;
    const KINDS = ['blur', 'hide', 'redact'];
    const ANNOTATION_KINDS = ['ellipse', 'rect', 'arrow', 'pen', 'text'];

    // Minimum points each kind needs to be renderable: a start and an end, except free
    // text which is anchored by a single corner.
    const ANNOTATION_MIN_POINTS = { ellipse: 2, rect: 2, arrow: 2, pen: 2, text: 1 };
    // A pen stroke is bounded so a long scribble cannot stall the render path or bloat
    // storage. Both limits are enforced by thinning the stroke, never by cutting it
    // short, so its shape is always preserved end to end.
    const PEN_MAX_POINTS = 600;
    const PEN_MIN_GAP = 2;

    // Evenly thins a list down to at most `max` entries, always keeping the first and
    // last so the stroke still starts and ends where the user put it.
    function decimate(points, max) {
        if (points.length <= max) return points;
        const stride = points.length / max;
        const out = [];
        for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * stride)]);
        out.push(points[points.length - 1]);
        return out;
    }

    const ANNOTATION_PALETTE = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#111827'];

    let state = { rules: [], areas: [], replacements: [], annotations: [] };

    function emptyState() {
        return { rules: [], areas: [], replacements: [], annotations: [] };
    }

    // Pro settings, mirrored from chrome.storage so the render path stays synchronous.
    let settings = {
        uiMode: 'simple',              // 'simple' | 'pro'
        defaultScope: 'page',          // scope applied to newly created rules
        blurStrength: 1,               // index into BLUR_LEVELS for new blur rules
        drawKind: 'blur',              // 'blur' | 'redact' for newly drawn areas
        annotateTool: 'arrow',         // active annotation tool
        annotateColor: ANNOTATION_PALETTE[0],
        annotateKeep: false            // whether new annotations survive a reload
    };

    // Colour reaches SVG presentation attributes and inline CSS, and size reaches
    // stroke-width and font-size, so both are validated rather than trusted. An imported
    // file is untrusted input: anything but an exact 6-digit hex is replaced, which makes
    // it impossible to smuggle in extra declarations the way a raw string could.
    function safeColor(value) {
        return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : ANNOTATION_PALETTE[0];
    }

    function safeNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function safePoints(points, minCount) {
        if (!Array.isArray(points)) return null;
        const clean = points
            .filter(p => Array.isArray(p) && p.length === 2
                && p.every(n => typeof n === 'number' && Number.isFinite(n)))
            .map(p => [p[0], p[1]]);
        return clean.length >= minCount ? clean : null;
    }

    // Returns a fully validated annotation, or null if it cannot be rendered safely.
    function sanitizeAnnotation(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!ANNOTATION_KINDS.includes(raw.kind)) return null;

        const points = safePoints(raw.points, ANNOTATION_MIN_POINTS[raw.kind]);
        if (!points) return null;

        // A stray multi-thousand-point pen stroke would stall the render path. Thin it
        // rather than truncating, which would cut the stroke short instead of keeping
        // its shape.
        const capped = raw.kind === 'pen' ? decimate(points, PEN_MAX_POINTS) : points.slice(0, 2);

        return {
            id: raw.id || newId('n'),
            kind: raw.kind,
            points: capped,
            text: raw.kind === 'text' ? String(raw.text || '').slice(0, 2000) : '',
            color: safeColor(raw.color),
            size: raw.kind === 'text'
                ? safeNumber(raw.size, 10, 72, 16)
                : safeNumber(raw.size, 1, 20, 3),
            boxW: safeNumber(raw.boxW, 40, 1200, 220),
            persist: raw.persist === true,
            scope: 'page'
        };
    }

    let idCounter = 0;
    function newId(prefix) {
        idCounter += 1;
        return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
    }

    function cloneState(s) {
        return {
            rules: s.rules.map(r => ({ ...r })),
            areas: s.areas.map(a => ({ ...a })),
            replacements: s.replacements.map(r => ({ ...r })),
            // points is the only nested value in the model, so it needs its own copy or
            // history snapshots would share the array with live state and undo would be
            // unable to restore a moved annotation.
            annotations: (s.annotations || []).map(a => ({ ...a, points: a.points.map(p => [p[0], p[1]]) }))
        };
    }

    // Opaque origins (about:blank, about:srcdoc, data:) all report origin "null", so every
    // such frame on every website would share one global bucket. Rules made in them are
    // kept in memory for this session but never written to or read from storage.
    // Mirrors isPersistableUrl() in background.js.
    function isPersistableUrl(url) {
        try {
            const u = new URL(url);
            return u.origin !== 'null' && (u.protocol === 'http:' || u.protocol === 'https:');
        } catch (e) {
            return false;
        }
    }

    function storageKeyForUrl(url) {
        try {
            const u = new URL(url);
            return `changes_${u.origin}${u.pathname}`;
        } catch (e) {
            return `changes_${url}`;
        }
    }

    function siteKeyForUrl(url) {
        try {
            return `site_${new URL(url).origin}`;
        } catch (e) {
            return `site_${url}`;
        }
    }

    // Accepts either schema and always returns v2. Existing users keep their data.
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
                        level: typeof r.level === 'number' ? r.level : 1,
                        scope: r.scope || scope
                    })),
                // All four geometry values reach el.style.cssText in renderArea, so a
                // crafted import file could otherwise smuggle in extra CSS declarations.
                // Validate every one, not just x.
                areas: (raw.areas || []).filter(a => a && ['x', 'y', 'width', 'height']
                    .every(k => typeof a[k] === 'number' && Number.isFinite(a[k])))
                    .map(a => ({
                        id: a.id || newId('a'),
                        kind: a.kind === 'redact' ? 'redact' : 'blur',
                        x: a.x, y: a.y, width: a.width, height: a.height,
                        scope: a.scope || scope
                    })),
                replacements: (raw.replacements || []).filter(r => r && r.oldText)
                    .map(r => ({
                        id: r.id || newId('t'),
                        oldText: r.oldText,
                        newText: r.newText,
                        scope: r.scope || scope
                    })),
                annotations: (raw.annotations || []).map(sanitizeAnnotation).filter(Boolean)
            };
        }

        // v1 -> v2
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
                scope
            })),
            replacements: (raw.replacements || []).map(r => ({
                id: newId('t'), oldText: r.oldText, newText: r.newText, scope
            })),
            // v1 predates annotations entirely.
            annotations: []
        };
    }

    function serializeScope(scope) {
        return {
            v: SCHEMA_VERSION,
            rules: state.rules.filter(r => r.scope === scope),
            areas: state.areas.filter(a => a.scope === scope),
            replacements: state.replacements.filter(r => r.scope === scope),
            // Annotations are page-scoped by nature - "put this arrow at these coordinates
            // on every page of the domain" has no meaning - and only saved once the user
            // has explicitly asked to keep them.
            annotations: scope === 'page' ? state.annotations.filter(a => a.persist) : []
        };
    }

    function isEmptyPayload(payload) {
        return !payload.rules.length && !payload.areas.length
            && !payload.replacements.length && !(payload.annotations || []).length;
    }

    function ruleCount() {
        return state.rules.length + state.areas.length
            + state.replacements.length + state.annotations.length;
    }

    function escapeSelectorPart(value) {
        if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    // Our own classes are added as a side effect of hiding/blurring, so they must never
    // end up in a saved selector - on a fresh page load the class is not there yet and
    // the selector would never match.
    function stableClassesOf(el) {
        if (!el.classList) return [];
        return Array.from(el.classList).filter(c => c && !c.startsWith('ceb-'));
    }

    function selectorMatchesOnly(selector, el) {
        try {
            return Boolean(selector) && document.querySelector(selector) === el;
        } catch (e) {
            return false;
        }
    }

    function structuralPath(el) {
        const path = [];
        let node = el;
        while (node && node.nodeType === ELEMENT_NODE_ID && node !== document.documentElement) {
            const parent = node.parentElement;
            let segment = node.tagName.toLowerCase();
            if (parent) {
                const sameTag = Array.from(parent.children).filter(s => s.tagName === node.tagName);
                if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            path.unshift(segment);
            node = parent;
        }
        return path.join(' > ');
    }

    // Generate unique selector for element
    function getElementSelector(el) {
        if (!el || el.nodeType !== ELEMENT_NODE_ID) return '';
        if (el === document.body) return 'body';
        if (el === document.documentElement) return 'html';

        const candidates = [];

        if (el.id) candidates.push(`#${escapeSelectorPart(el.id)}`);

        const path = [];
        let node = el;
        while (node && node.nodeType === ELEMENT_NODE_ID && node !== document.documentElement) {
            if (node.id) {
                path.unshift(`#${escapeSelectorPart(node.id)}`);
                break;
            }
            let segment = node.tagName.toLowerCase();
            const classes = stableClassesOf(node).slice(0, 2);
            if (classes.length) {
                segment += classes.map(c => `.${escapeSelectorPart(c)}`).join('');
            }
            const parent = node.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(s => s.tagName === node.tagName);
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

    // ========== EFFECTS ==========
    //
    // Every visual change is derived from `state` by renderState(). Nothing mutates the
    // DOM directly any more, which is what makes undo/redo and the rules panel possible:
    // they only have to edit state and re-render.

    function applyBlurEffect(elm, level) {
        if (elm.dataset.cebOriginalFilter === undefined) {
            elm.dataset.cebOriginalFilter = elm.style.filter || '';
        }
        const original = elm.dataset.cebOriginalFilter || '';
        const blurValue = BLUR_LEVELS[level] || BLUR_LEVELS[1];
        elm.style.filter = original ? `${original} blur(${blurValue})` : `blur(${blurValue})`;
        elm.dataset.cebFx = 'blur';
        elm.setAttribute('data-ceb-blur-level', level);
    }

    function applyHideEffect(elm) {
        if (elm.dataset.cebOriginalVisibility === undefined) {
            elm.dataset.cebOriginalVisibility = elm.style.visibility || '';
            elm.dataset.cebOriginalOpacity = elm.style.opacity || '';
        }
        elm.style.visibility = 'hidden';
        elm.style.opacity = '0';
        elm.dataset.cebFx = 'hide';
        elm.dataset.cebHidden = 'true';
        elm.classList.add('ceb-hidden-element');
    }

    // Solid, irreversible redaction. brightness(0) maps every pixel in the subtree to
    // black no matter what it is - text, image, video, canvas - and the opaque background
    // covers any transparent region, so nothing survives to be recovered. Unlike blur,
    // this cannot be guessed at or upscaled back.
    function applyRedactEffect(elm) {
        if (elm.dataset.cebOriginalFilter === undefined) {
            elm.dataset.cebOriginalFilter = elm.style.filter || '';
        }
        if (elm.dataset.cebOriginalBg === undefined) {
            elm.dataset.cebOriginalBg = elm.style.backgroundColor || '';
        }
        elm.style.setProperty('background-color', '#000', 'important');
        elm.style.setProperty('filter', 'brightness(0)', 'important');
        elm.dataset.cebFx = 'redact';
        elm.classList.add('ceb-redacted-element');
    }

    function clearEffect(elm) {
        const fx = elm.dataset.cebFx;
        if (!fx) return;

        if (fx === 'blur' || fx === 'redact') {
            elm.style.removeProperty('filter');
            const original = elm.dataset.cebOriginalFilter;
            if (original) elm.style.filter = original;
        }
        if (fx === 'redact') {
            elm.style.removeProperty('background-color');
            const bg = elm.dataset.cebOriginalBg;
            if (bg) elm.style.backgroundColor = bg;
            elm.classList.remove('ceb-redacted-element');
        }
        if (fx === 'hide') {
            elm.style.visibility = elm.dataset.cebOriginalVisibility || '';
            elm.style.opacity = elm.dataset.cebOriginalOpacity || '';
            elm.classList.remove('ceb-hidden-element');
            delete elm.dataset.cebHidden;
        }

        delete elm.dataset.cebFx;
        elm.removeAttribute('data-ceb-blur-level');
    }

    function clearAllEffects() {
        document.querySelectorAll('[data-ceb-fx]').forEach(clearEffect);
    }

    function applyRule(rule) {
        let el;
        try {
            el = document.querySelector(rule.selector);
        } catch (e) {
            return false;
        }
        if (!el || isToolbarElement(el)) return false;

        el.classList.add(rule.kind === 'hide' ? 'ceb-hide-transition' : 'ceb-blur-transition');
        if (rule.kind === 'blur') applyBlurEffect(el, rule.level);
        else if (rule.kind === 'hide') applyHideEffect(el);
        else if (rule.kind === 'redact') applyRedactEffect(el);
        return true;
    }

    // Idempotent: safe to call as often as we like. This is what undo, redo, restore and
    // the rules panel all funnel through.
    function renderState() {
        clearAllEffects();
        state.rules.forEach(applyRule);

        clearRenderedAreas();
        state.areas.forEach(renderArea);

        // After areas, so an annotation can point at something that has been blurred.
        clearRenderedAnnotations();
        state.annotations.forEach(renderAnnotation);

        syncReplacements();
        updateToolbarStats();
        renderRulesPanel();
    }

    // Find the rule covering this element for a given kind family, if any.
    function ruleForElement(el, kinds) {
        return state.rules.find(r => {
            if (kinds && !kinds.includes(r.kind)) return false;
            try {
                return document.querySelector(r.selector) === el;
            } catch (e) {
                return false;
            }
        }) || null;
    }

    // Clicking an element in blur mode cycles strength then removes; in hide/redact mode
    // it toggles.
    function applyKindToElement(elm, kind) {
        if (!elm || isToolbarElement(elm)) return;
        if (elm === document.body || elm === document.documentElement) return;

        // Compute the selector before mutating so nothing we add can leak into it.
        const selector = getElementSelector(elm);
        if (!selector) {
            showToast('Could not target that element');
            return;
        }

        const existing = ruleForElement(elm, [kind]);

        if (kind === 'blur') {
            const current = existing ? existing.level : 0;
            const next = (current + 1) % BLUR_LEVELS.length;
            if (next === 0) {
                state.rules = state.rules.filter(r => r !== existing);
                commit('Blur removed');
            } else if (existing) {
                existing.level = next;
                commit(`Blur level ${next}`);
            } else {
                state.rules.push({ id: newId('r'), kind, selector, level: next, scope: settings.defaultScope });
                commit(`Blur level ${next}`);
            }
            return;
        }

        if (existing) {
            state.rules = state.rules.filter(r => r !== existing);
            commit(kind === 'hide' ? 'Element restored' : 'Redaction removed');
        } else {
            state.rules.push({
                id: newId('r'), kind, selector,
                level: settings.blurStrength,
                scope: settings.defaultScope
            });
            commit(kind === 'hide' ? 'Element hidden' : 'Element redacted');
        }
    }

    function modeChanged(newModeId) {
        // Removing the attribute is not the same as setting it to "false" - leaving
        // contenteditable="false" behind changes behaviour on some pages.
        if (newModeId === "edit") {
            document.body.setAttribute("contenteditable", "true");
        } else {
            document.body.removeAttribute("contenteditable");
        }

        document.body.classList.remove("ceb-mode-idle", "ceb-mode-edit", "ceb-mode-blur", "ceb-mode-hide", "ceb-mode-redact", "ceb-mode-draw", "ceb-mode-annotate");
        document.body.classList.add(`ceb-mode-${newModeId}`);

        if (newModeId === "idle") {
            document.body.classList.remove("ceb-disable-links");
            removeDrawOverlay();
        } else {
            document.body.classList.add("ceb-disable-links");
        }

        if (newModeId === "edit") {
            document.addEventListener("dblclick", dblclickHandler);
        } else {
            document.removeEventListener("dblclick", dblclickHandler);
        }
        
        if (newModeId === "draw") {
            initDrawMode();
        } else {
            removeDrawOverlay();
        }

        if (newModeId === "annotate") {
            initAnnotateMode();
        } else {
            removeAnnotateOverlay();
            // Leaving the mode commits whatever is being typed rather than discarding it.
            finishTextEditing();
        }

        currentModeId = newModeId;

        if (!isPickerMode(newModeId)) clearPicker();
        
        // Show mode indicator
        updateModeIndicator(newModeId);
    }

    function isPickerMode(mode) {
        return mode === 'blur' || mode === 'hide' || mode === 'redact';
    }

    // Elements the extension itself drew on the page. The picker must never treat one
    // as page content: it would both shadow whatever is underneath and persist a rule
    // whose positional selector counts extension-owned nodes, so it would resolve to
    // something else entirely on the next load.
    function isOwnOverlay(target) {
        if (!target || typeof target.closest !== 'function') return false;
        return !!target.closest('.ceb-blur-area, .ceb-annotation');
    }

    // Every message to the service worker goes through here. On an invalidated context
    // (the extension was reloaded or updated while this tab stayed open) chrome.runtime
    // is torn down and sendMessage throws *synchronously* — a trailing .catch() is never
    // even attached, so the exception escapes. Always returns a promise so callers can
    // attach .finally() for cleanup that must run either way.
    function sendToBackground(payload) {
        try {
            return Promise.resolve(chrome.runtime.sendMessage(payload)).catch(() => {});
        } catch (e) {
            return Promise.resolve();
        }
    }

    // Switch mode locally and tell the service worker, which owns the badge and the
    // per-tab record. Applying it locally first keeps the UI responsive even if the
    // worker has been terminated and has to spin back up.
    function requestMode(mode) {
        modeChanged(mode);
        sendToBackground({ action: 'requestModeChange', mode });
    }
    
    // Draw-to-blur functionality
    function initDrawMode() {
        if (drawOverlay || !isTopFrame) return;
        
        drawOverlay = document.createElement('div');
        drawOverlay.id = 'ceb-draw-overlay';
        drawOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2147483646;
            cursor: crosshair;
        `;
        document.body.appendChild(drawOverlay);
        
        drawOverlay.addEventListener('mousedown', startDraw);
        drawOverlay.addEventListener('mousemove', updateDraw);
        drawOverlay.addEventListener('mouseup', endDraw);
    }
    
    function removeDrawOverlay() {
        if (drawOverlay) {
            drawOverlay.remove();
            drawOverlay = null;
        }
        if (drawRect) {
            drawRect.remove();
            drawRect = null;
        }
        isDrawing = false;
    }
    
    function startDraw(e) {
        isDrawing = true;
        drawStartX = e.clientX;
        drawStartY = e.clientY;

        const solid = settings.drawKind === 'redact';
        drawRect = document.createElement('div');
        drawRect.id = 'ceb-draw-rect';
        drawRect.style.cssText = `
            position: fixed;
            border: 2px dashed ${solid ? '#111' : '#9C27B0'};
            background: ${solid ? 'rgba(0,0,0,0.35)' : 'rgba(156, 39, 176, 0.1)'};
            z-index: 2147483647;
            pointer-events: none;
        `;
        document.body.appendChild(drawRect);
    }
    
    function updateDraw(e) {
        if (!isDrawing || !drawRect) return;
        
        const x = Math.min(e.clientX, drawStartX);
        const y = Math.min(e.clientY, drawStartY);
        const width = Math.abs(e.clientX - drawStartX);
        const height = Math.abs(e.clientY - drawStartY);
        
        drawRect.style.left = x + 'px';
        drawRect.style.top = y + 'px';
        drawRect.style.width = width + 'px';
        drawRect.style.height = height + 'px';
    }
    
    function endDraw(e) {
        if (!isDrawing) return;
        isDrawing = false;
        
        const x = Math.min(e.clientX, drawStartX);
        const y = Math.min(e.clientY, drawStartY);
        const width = Math.abs(e.clientX - drawStartX);
        const height = Math.abs(e.clientY - drawStartY);
        
        if (width > 10 && height > 10) {
            // Store in document coordinates so the area stays anchored to the content
            // it covers rather than to the viewport.
            state.areas.push({
                id: newId('a'),
                kind: settings.drawKind === 'redact' ? 'redact' : 'blur',
                x: x + window.scrollX,
                y: y + window.scrollY,
                width,
                height,
                scope: 'page'
            });
            commit(settings.drawKind === 'redact' ? 'Redaction area added' : 'Blur area added');
        }
        
        if (drawRect) {
            drawRect.remove();
            drawRect = null;
        }
    }

    // Rendered absolutely positioned in document coordinates, so the area scrolls with
    // the page instead of hovering over whatever happens to be in the viewport.
    function renderArea(area) {
        const el = document.createElement('div');
        el.className = 'ceb-blur-area';
        el.dataset.cebAreaId = area.id;
        el.dataset.cebAreaKind = area.kind;

        const fill = area.kind === 'redact'
            ? 'background: #000;'
            : 'backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); background: rgba(128, 128, 128, 0.3);';

        el.style.cssText = `
            position: absolute;
            left: ${area.x}px;
            top: ${area.y}px;
            width: ${area.width}px;
            height: ${area.height}px;
            ${fill}
            z-index: 2147483640;
            border-radius: ${area.kind === 'redact' ? '2px' : '4px'};
            cursor: pointer;
        `;
        el.title = 'Click to remove';
        
        el.addEventListener('click', function(event) {
            event.stopPropagation();
            event.preventDefault();
            removeArea(area.id);
        });
        
        document.body.appendChild(el);
        return el;
    }

    function findAreaElement(id) {
        return Array.from(document.querySelectorAll('.ceb-blur-area'))
            .find(el => el.dataset.cebAreaId === id) || null;
    }

    function removeArea(id) {
        state.areas = state.areas.filter(a => a.id !== id);
        commit('Area removed');
    }

    function clearRenderedAreas() {
        document.querySelectorAll('.ceb-blur-area').forEach(el => el.remove());
    }

    // ========== ANNOTATIONS ==========
    //
    // Rendered one element per annotation in document coordinates, the same way areas are,
    // so they scroll with the content instead of floating over the viewport. Shapes are an
    // inline <svg> sized to the stroke's bounding box; text is a plain div.
    //
    // Everything here is built with createElement/setAttribute and textContent rather than
    // innerHTML, so annotation text - which can come from an imported file - is never
    // parsed as markup.

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Stroke is centred on the path, and the arrowhead overhangs the line, so the drawing
    // surface needs to be bigger than the raw geometry or the edges get clipped.
    function annotationPadding(a) {
        return a.kind === 'arrow' ? a.size * 3 + 4 : a.size + 4;
    }

    function annotationBounds(a) {
        const xs = a.points.map(p => p[0]);
        const ys = a.points.map(p => p[1]);
        if (a.kind === 'text') {
            return { x: xs[0], y: ys[0], width: a.boxW, height: 0 };
        }
        const pad = annotationPadding(a);
        return {
            x: Math.min(...xs) - pad,
            y: Math.min(...ys) - pad,
            width: (Math.max(...xs) - Math.min(...xs)) + pad * 2,
            height: (Math.max(...ys) - Math.min(...ys)) + pad * 2
        };
    }

    // A mouse-drawn polyline is visibly jagged. Emitting a quadratic curve through the
    // midpoint of each segment rounds the corners off at almost no cost, which is the
    // difference between a stroke that looks deliberate and one that looks like a wobble.
    function penPath(points) {
        if (points.length < 3) {
            return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
        }
        let d = `M${points[0][0]},${points[0][1]}`;
        for (let i = 1; i < points.length - 1; i += 1) {
            const midX = (points[i][0] + points[i + 1][0]) / 2;
            const midY = (points[i][1] + points[i + 1][1]) / 2;
            d += ` Q${points[i][0]},${points[i][1]} ${midX},${midY}`;
        }
        const last = points[points.length - 1];
        return `${d} L${last[0]},${last[1]}`;
    }

    function buildAnnotationShape(a, bounds) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', String(bounds.width));
        svg.setAttribute('height', String(bounds.height));
        svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
        svg.style.cssText = 'display:block;overflow:visible;pointer-events:none;';

        // Local coordinates, relative to the element's own top-left corner.
        const pts = a.points.map(p => [p[0] - bounds.x, p[1] - bounds.y]);
        const common = el => {
            el.setAttribute('stroke', a.color);
            el.setAttribute('stroke-width', String(a.size));
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke-linecap', 'round');
            el.setAttribute('stroke-linejoin', 'round');
            return el;
        };

        if (a.kind === 'ellipse') {
            const el = common(document.createElementNS(SVG_NS, 'ellipse'));
            el.setAttribute('cx', String((pts[0][0] + pts[1][0]) / 2));
            el.setAttribute('cy', String((pts[0][1] + pts[1][1]) / 2));
            el.setAttribute('rx', String(Math.abs(pts[1][0] - pts[0][0]) / 2));
            el.setAttribute('ry', String(Math.abs(pts[1][1] - pts[0][1]) / 2));
            svg.appendChild(el);
        } else if (a.kind === 'rect') {
            const el = common(document.createElementNS(SVG_NS, 'rect'));
            el.setAttribute('x', String(Math.min(pts[0][0], pts[1][0])));
            el.setAttribute('y', String(Math.min(pts[0][1], pts[1][1])));
            el.setAttribute('width', String(Math.abs(pts[1][0] - pts[0][0])));
            el.setAttribute('height', String(Math.abs(pts[1][1] - pts[0][1])));
            el.setAttribute('rx', '3');
            svg.appendChild(el);
        } else if (a.kind === 'pen') {
            const el = common(document.createElementNS(SVG_NS, 'path'));
            el.setAttribute('d', penPath(pts));
            svg.appendChild(el);
        } else if (a.kind === 'arrow') {
            const [from, to] = pts;
            const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
            const head = a.size * 3.2;

            // Stop the shaft short of the tip, otherwise it pokes through the arrowhead.
            const line = common(document.createElementNS(SVG_NS, 'line'));
            line.setAttribute('x1', String(from[0]));
            line.setAttribute('y1', String(from[1]));
            line.setAttribute('x2', String(to[0] - Math.cos(angle) * head * 0.8));
            line.setAttribute('y2', String(to[1] - Math.sin(angle) * head * 0.8));
            svg.appendChild(line);

            const wing = 0.42;
            const tri = document.createElementNS(SVG_NS, 'polygon');
            tri.setAttribute('points', [
                `${to[0]},${to[1]}`,
                `${to[0] - Math.cos(angle - wing) * head},${to[1] - Math.sin(angle - wing) * head}`,
                `${to[0] - Math.cos(angle + wing) * head},${to[1] - Math.sin(angle + wing) * head}`
            ].join(' '));
            tri.setAttribute('fill', a.color);
            svg.appendChild(tri);
        }
        return svg;
    }

    function renderAnnotation(a) {
        const bounds = annotationBounds(a);
        const el = document.createElement('div');
        el.className = 'ceb-annotation';
        el.dataset.cebNoteId = a.id;
        el.dataset.cebNoteKind = a.kind;

        if (a.kind === 'text') {
            el.textContent = a.text;
            el.style.cssText = `
                position: absolute;
                left: ${bounds.x}px;
                top: ${bounds.y}px;
                width: ${a.boxW}px;
                color: ${a.color};
                font: 600 ${a.size}px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                white-space: pre-wrap;
                overflow-wrap: break-word;
                z-index: 2147483641;
                cursor: text;
                padding: 2px 4px;
                text-shadow: 0 1px 2px rgba(255,255,255,.85), 0 -1px 2px rgba(255,255,255,.85),
                             1px 0 2px rgba(255,255,255,.85), -1px 0 2px rgba(255,255,255,.85);
            `;
            el.title = 'Click to edit';
            el.addEventListener('click', function (event) {
                event.stopPropagation();
                event.preventDefault();
                editTextAnnotation(a.id);
            });
        } else {
            el.style.cssText = `
                position: absolute;
                left: ${bounds.x}px;
                top: ${bounds.y}px;
                width: ${bounds.width}px;
                height: ${bounds.height}px;
                z-index: 2147483641;
                cursor: pointer;
            `;
            el.title = 'Click to remove';
            el.appendChild(buildAnnotationShape(a, bounds));
            el.addEventListener('click', function (event) {
                event.stopPropagation();
                event.preventDefault();
                removeAnnotation(a.id);
            });
        }

        document.body.appendChild(el);
        return el;
    }

    function removeAnnotation(id) {
        state.annotations = state.annotations.filter(a => a.id !== id);
        commit('Annotation removed');
    }

    function clearRenderedAnnotations() {
        document.querySelectorAll('.ceb-annotation').forEach(el => el.remove());
    }

    // ---------- Annotate mode ----------
    //
    // Shapes are dragged out with a live preview; the pen samples the pointer; text is
    // placed with a single click and typed into a contenteditable box straight away, so
    // the common case is click-type-click-away with no intermediate dialog.

    let annotateOverlay = null;
    let noteDrawing = false;
    let notePreview = null;
    let noteStart = null;        // document coords of the gesture's origin
    let notePoints = [];         // pen only
    let noteMinGap = PEN_MIN_GAP; // grows as a stroke gets long, to bound its cost
    let textEditor = null;       // live contenteditable box, if any

    function isAnnotateTool(kind) {
        return ANNOTATION_KINDS.includes(kind);
    }

    function activeTool() {
        return isAnnotateTool(settings.annotateTool) ? settings.annotateTool : 'arrow';
    }

    // Pointer position in document space, so a stroke started near the bottom of a long
    // page keeps its place once the page is scrolled.
    function docPoint(e) {
        return [e.clientX + window.scrollX, e.clientY + window.scrollY];
    }

    function initAnnotateMode() {
        if (annotateOverlay || !isTopFrame) return;

        annotateOverlay = document.createElement('div');
        annotateOverlay.id = 'ceb-annotate-overlay';
        annotateOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 2147483646;
            cursor: crosshair;
        `;
        document.body.appendChild(annotateOverlay);

        annotateOverlay.addEventListener('mousedown', startNote);
        annotateOverlay.addEventListener('mousemove', updateNote);
        annotateOverlay.addEventListener('mouseup', endNote);
        // A drag that ends outside the window would otherwise leave a stuck preview.
        annotateOverlay.addEventListener('mouseleave', endNote);
    }

    function removeAnnotateOverlay() {
        if (annotateOverlay) {
            annotateOverlay.remove();
            annotateOverlay = null;
        }
        clearNotePreview();
        noteDrawing = false;
    }

    function clearNotePreview() {
        if (notePreview) {
            notePreview.remove();
            notePreview = null;
        }
    }

    // The preview is a real annotation rendered into a throwaway element, so what is on
    // screen mid-drag is exactly what gets committed.
    function drawNotePreview(points) {
        clearNotePreview();
        const draft = {
            id: 'preview', kind: activeTool(), points,
            text: '', color: safeColor(settings.annotateColor),
            size: 3, boxW: 220, persist: false, scope: 'page'
        };
        const bounds = annotationBounds(draft);
        notePreview = document.createElement('div');
        notePreview.id = 'ceb-note-preview';
        notePreview.style.cssText = `
            position: absolute;
            left: ${bounds.x}px;
            top: ${bounds.y}px;
            width: ${bounds.width}px;
            height: ${bounds.height}px;
            z-index: 2147483645;
            pointer-events: none;
            opacity: .85;
        `;
        notePreview.appendChild(buildAnnotationShape(draft, bounds));
        document.body.appendChild(notePreview);
    }

    function startNote(e) {
        if (e.button !== 0) return;
        // Without this the browser's default mousedown handling moves focus to the body:
        // that both selects page text while dragging a shape and, for a text note, blurs
        // the editor we are about to focus, which discards it as empty before the user
        // can type a character.
        e.preventDefault();


        // Text is placed, not dragged.
        if (activeTool() === 'text') {
            createTextAnnotation(docPoint(e));
            return;
        }

        noteDrawing = true;
        noteStart = docPoint(e);
        notePoints = [noteStart];
        noteMinGap = PEN_MIN_GAP;
    }

    function updateNote(e) {
        if (!noteDrawing) return;
        const point = docPoint(e);

        if (activeTool() === 'pen') {
            const last = notePoints[notePoints.length - 1];
            // Skip near-duplicate samples: they add nothing visually but bloat what gets
            // stored and slow the smoothing pass down.
            if (Math.hypot(point[0] - last[0], point[1] - last[1]) < noteMinGap) return;
            notePoints.push(point);
            // A long stroke has to be bounded, but dropping the oldest samples would make
            // the beginning of the user's own line disappear as they keep drawing. Halve
            // the resolution instead: the whole stroke survives, just less finely.
            // Thin to half the cap, not to the cap, so the buffer has room to refill
            // before thinning again — otherwise every subsequent sample would trigger
            // another pass and the minimum gap would run away exponentially.
            if (notePoints.length > PEN_MAX_POINTS) {
                notePoints = decimate(notePoints, PEN_MAX_POINTS / 2);
                noteMinGap *= 2;
            }
            drawNotePreview(notePoints);
        } else {
            drawNotePreview([noteStart, point]);
        }
    }

    function endNote(e) {
        if (!noteDrawing) return;
        noteDrawing = false;
        clearNotePreview();

        const tool = activeTool();
        const points = tool === 'pen' ? notePoints.slice() : [noteStart, docPoint(e)];

        // Ignore a stray click that was not really a drag.
        const spanX = Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]));
        const spanY = Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
        if (Math.hypot(spanX, spanY) < 8) return;

        pushAnnotation({ kind: tool, points });
        commit(tool === 'arrow' ? 'Arrow added'
            : tool === 'ellipse' ? 'Circle added'
            : tool === 'rect' ? 'Box added' : 'Drawing added');
    }

    function pushAnnotation(partial) {
        const note = sanitizeAnnotation({
            kind: partial.kind,
            points: partial.points,
            text: partial.text || '',
            color: settings.annotateColor,
            size: partial.kind === 'text' ? 16 : 3,
            boxW: 220,
            persist: settings.annotateKeep === true
        });
        if (note) state.annotations.push(note);
        return note;
    }

    // ---------- Text annotations ----------

    function createTextAnnotation(point) {
        const note = pushAnnotation({ kind: 'text', points: [point], text: '' });
        if (!note) return;
        renderState();
        openTextEditor(note.id);
    }

    function editTextAnnotation(id) {
        openTextEditor(id);
    }

    function openTextEditor(id) {
        finishTextEditing();
        const note = state.annotations.find(a => a.id === id);
        if (!note) return;

        // Hide the rendered copy so the editor sits exactly where the text will land.
        const rendered = Array.from(document.querySelectorAll('.ceb-annotation'))
            .find(el => el.dataset.cebNoteId === id);
        if (rendered) rendered.style.visibility = 'hidden';

        const box = document.createElement('div');
        box.id = 'ceb-text-editor';
        box.contentEditable = 'true';
        box.spellcheck = false;
        box.textContent = note.text;
        box.dataset.cebNoteId = id;
        box.style.cssText = `
            position: absolute;
            left: ${note.points[0][0]}px;
            top: ${note.points[0][1]}px;
            width: ${note.boxW}px;
            min-height: ${note.size}px;
            color: ${note.color};
            font: 600 ${note.size}px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            white-space: pre-wrap;
            overflow-wrap: break-word;
            z-index: 2147483647;
            padding: 2px 4px;
            outline: 2px dashed ${note.color};
            outline-offset: 1px;
            background: rgba(255,255,255,.9);
            cursor: text;
        `;
        document.body.appendChild(box);
        textEditor = box;

        box.addEventListener('keydown', function (event) {
            event.stopPropagation();
            // Enter commits, Shift+Enter makes a new line - the usual caption behaviour.
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                finishTextEditing();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finishTextEditing();
            }
        });
        box.addEventListener('blur', () => finishTextEditing());
        // Clicks inside the editor must not reach the overlay and start a new annotation.
        box.addEventListener('mousedown', event => event.stopPropagation());
        box.addEventListener('click', event => event.stopPropagation());

        box.focus();
        const range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // Commits the editor's contents. An annotation left empty is removed rather than
    // persisted as an invisible click target.
    function finishTextEditing() {
        if (!textEditor) return;
        const box = textEditor;
        textEditor = null;

        const id = box.dataset.cebNoteId;
        const value = (box.textContent || '').trim().slice(0, 2000);
        box.remove();

        const note = state.annotations.find(a => a.id === id);
        if (!note) return;

        if (!value) {
            const wasNew = note.text === '';
            state.annotations = state.annotations.filter(a => a.id !== id);
            // A note that was created and left empty never made it into history, so
            // committing here would push a snapshot identical to the previous one and
            // silently burn the user's next undo. Just drop it.
            if (wasNew) {
                renderState();
                return;
            }
            commit('Note removed');
            return;
        }
        if (note.text === value) {
            renderState();
            return;
        }
        note.text = value;
        commit('Note added');
    }
    
    // Screenshot download
    // The extension's own UI is part of the page, so a naive capture includes the
    // toolbar, the annotate overlay and any live editing chrome. Hide all of it,
    // wait for a paint, then capture.
    const CAPTURE_HIDE = [
        '#ceb-toolbar', '#ceb-mode-badge', '#ceb-toast',
        '#ceb-draw-overlay', '#ceb-annotate-overlay', '#ceb-note-preview',
        '#ceb-text-editor', '#ceb-picker-outline', '#ceb-picker-hud', '#ceb-panel'
    ];

    function captureScreenshot() {
        finishTextEditing();
        const hidden = [];
        CAPTURE_HIDE.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (el.style.visibility === 'hidden') return;
                hidden.push([el, el.style.visibility]);
                el.style.visibility = 'hidden';
            });
        });
        const restore = () => hidden.forEach(([el, prev]) => { el.style.visibility = prev; });
        // Two frames: one to apply the style, one to be sure it has painted before the
        // compositor snapshot is taken.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            // restore must run even when the send fails, or the whole UI stays
            // invisible until the page is reloaded. sendToBackground never throws
            // and always returns a promise, so .finally() is guaranteed to fire.
            sendToBackground({ action: 'takeScreenshot' }).finally(restore);
        }));
    }

    function downloadScreenshot(dataUrl) {
        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        showToast('Screenshot saved!');
    }

    // Floating mode badge. Deliberately not called "ceb-mode-indicator": that id
    // belongs to the hint row inside the toolbar, and sharing it made this function
    // hijack the toolbar's own element.
    function updateModeIndicator(mode) {
        if (!isTopFrame) return;

        let indicator = document.getElementById('ceb-mode-badge');
        
        if (mode === 'idle') {
            if (indicator) indicator.remove();
            return;
        }
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ceb-mode-badge';
            document.body.appendChild(indicator);
        }
        
        const colors = { edit: '#4CAF50', blur: '#FF9800', hide: '#F44336', draw: '#9C27B0' };
        const icons = { edit: '✏️', blur: '🔵', hide: '👁️', draw: '✍️' };
        const labels = { edit: 'Edit', blur: 'Blur', hide: 'Hide', draw: 'Draw to Blur' };
        
        indicator.textContent = `${icons[mode] || '📌'} ${labels[mode] || mode} Mode`;
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: ${colors[mode] || '#666'};
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            font-weight: 600;
            z-index: 2147483647;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            pointer-events: none;
            transition: opacity 0.3s;
        `;
        
        // Fade out after 2 seconds
        setTimeout(() => {
            if (indicator) indicator.style.opacity = '0.3';
        }, 2000);
    }

    // Toast notifications
    function showToast(message, showUndo = false) {
        if (!isTopFrame) return;

        let toast = document.getElementById('ceb-toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ceb-toast';
            document.body.appendChild(toast);
        }
        
        // textContent, not innerHTML - messages can embed text taken straight off the page.
        toast.textContent = '';
        const label = document.createElement('span');
        label.textContent = message;
        toast.appendChild(label);

        if (showUndo) {
            const hint = document.createElement('span');
            hint.style.cssText = 'opacity:0.7;margin-left:12px;font-size:11px';
            hint.textContent = `${undoShortcutLabel()} to undo`;
            toast.appendChild(hint);
        }
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(0);
            background: #202124;
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            z-index: 2147483647;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            opacity: 1;
            transition: opacity 0.3s, transform 0.3s;
            display: flex;
            align-items: center;
        `;
        
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
        
        // Update toolbar stats
        if (typeof updateToolbarStats === 'function') updateToolbarStats();
    }

    function replaceAllTextInNode(node, oldText, newText) {
        if (node.nodeType === TEXT_NODE_ID) {
            node.data = node.data.replaceAll(oldText, newText);
            return;
        }

        if (node.nodeType === ELEMENT_NODE_ID && node.nodeName !== "SCRIPT") {
            for (let i = 0; i < node.childNodes.length; i++) {
                replaceAllTextInNode(node.childNodes[i], oldText, newText);
            }
        }
    }

    function triggerTextReplace(oldText) {
        const newText = window.prompt(
            "Replace All Occurrences\n\nPlease notice that the replacing is case-sensitive.\n\nReplace:",
            '[New text to replace "' + oldText + '" with]'
        );

        if (!newText) return;

        const confirmResult = window.confirm(
            'Are you sure you want to replace all occurrences of "' +
            oldText + '" with "' + newText + '"?'
        );

        if (confirmResult) {
            state.replacements.push({
                id: newId('t'), oldText, newText, scope: settings.defaultScope
            });
            commit(`Replaced all "${oldText}"`);
        }

        return newText;
    }

    const dblclickHandler = function(event) {
        if (event.target.tagName !== "IMG") return;
        imgElement = event.target;
        inputElement.click();
    };

    function loadImageFromFile(imgEl, file) {
        if (!imgEl || !file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            imgEl.src = event.target.result;
            showToast('Image replaced');
        };
    }

    // ========== PERSISTENCE ==========

    let saveTimer = null;
    function saveChanges() {
        // Every click would otherwise round-trip to the service worker.
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushChanges, 150);
    }

    // Set once this frame has actually read the site scope out of storage.
    let siteScopeLoaded = false;

    function flushChanges(href) {
        const target = href || window.location.href;
        if (!isPersistableUrl(target)) return;
        const payload = {
            action: 'saveChanges',
            page: serializeScope('page'),
            // The background would otherwise key the write off sender.url, which is stale
            // on a pushState app — route A's rules would land under route B's key. This
            // frame knows which route its page-scoped state belongs to, so it says.
            pageKey: storageKeyForUrl(target)
        };
        // The background treats an empty scope as "delete the key". A frame that never
        // loaded the site scope has no idea what is in it, so sending its (empty) view
        // would wipe every site rule for the origin — including ones another tab just
        // made. Omit the key entirely and the background leaves it untouched.
        if (siteScopeLoaded) payload.site = serializeScope('site');
        sendToBackground(payload);
    }

    // ========== SPA ROUTE CHANGES ==========
    //
    // On a pushState app the document is never torn down, so without this the in-memory
    // page-scoped rules follow the user from route to route and get written under
    // whichever route they happen to be on. History methods cannot be patched from a
    // content script (isolated world), so poll alongside the events we can hear.

    let currentHref = window.location.href;

    function handleRouteChange() {
        const next = window.location.href;
        if (storageKeyForUrl(next) === storageKeyForUrl(currentHref)) {
            currentHref = next;
            return;
        }
        const previous = currentHref;
        currentHref = next;

        // Persist the outgoing route under its own key before switching away.
        clearTimeout(saveTimer);
        flushChanges(previous);

        // Page-scoped rules belong to the route that created them; site rules carry over.
        // Annotations are inherently page-scoped, so they go with the outgoing route.
        state = {
            rules: state.rules.filter(r => r.scope === 'site'),
            areas: state.areas.filter(a => a.scope === 'site'),
            replacements: state.replacements.filter(r => r.scope === 'site'),
            annotations: []
        };
        renderState();
        resetHistory();
        loadPageScopeFor(next);
    }

    async function loadPageScopeFor(url) {
        if (!isPersistableUrl(url)) return;
        try {
            const key = storageKeyForUrl(url);
            const stored = await chrome.storage.local.get(['persistEnabled', key]);
            if (stored.persistEnabled === false) return;
            // Bail if another route change happened while this read was in flight.
            if (storageKeyForUrl(window.location.href) !== key) return;

            const pageData = migrateChanges(stored[key], 'page');
            mergeInto(state, cloneState(pageData));
            renderState();
            history = history.map(snap => {
                const merged = cloneState(snap);
                mergeInto(merged, cloneState(pageData));
                return merged;
            });
            updateToolbarState();
        } catch (e) {
            // Extension context gone.
        }
    }

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    setInterval(() => {
        if (window.location.href !== currentHref) handleRouteChange();
    }, 400);

    // Text replacements mutate text nodes in place, so unlike blur/hide/redact they
    // cannot be re-derived from state by re-rendering. Track what is currently applied
    // and move only the delta.
    const appliedReplacements = new Map();

    function syncReplacements() {
        const target = new Map(state.replacements.map(r => [r.id, r]));

        // Revert anything applied that is no longer wanted (undo, or a deleted rule).
        Array.from(appliedReplacements.entries()).reverse().forEach(([id, applied]) => {
            if (!target.has(id)) {
                replaceAllTextInNode(document.body, applied.newText, applied.oldText);
                appliedReplacements.delete(id);
            }
        });

        // Apply anything wanted that is not yet applied.
        target.forEach((r, id) => {
            if (!appliedReplacements.has(id)) {
                replaceAllTextInNode(document.body, r.oldText, r.newText);
                appliedReplacements.set(id, { oldText: r.oldText, newText: r.newText });
            }
        });
    }

    // Kept for the explicit Restore button and for messages from the background script.
    function applySavedChanges(changes, siteChanges) {
        if (changes) mergeIntoState(migrateChanges(changes, 'page'));
        if (siteChanges) mergeIntoState(migrateChanges(siteChanges, 'site'));
        renderState();
        resetHistory();
    }

    function mergeIntoState(incoming) {
        mergeInto(state, incoming);
    }

    function mergeInto(target, incoming) {
        const seen = new Set(target.rules.map(r => `${r.kind}|${r.selector}`));
        incoming.rules.forEach(r => {
            const key = `${r.kind}|${r.selector}`;
            if (!seen.has(key)) {
                seen.add(key);
                target.rules.push(r);
            }
        });
        const areaIds = new Set(target.areas.map(a => a.id));
        incoming.areas.forEach(a => { if (!areaIds.has(a.id)) target.areas.push(a); });
        const repIds = new Set(target.replacements.map(r => r.id));
        incoming.replacements.forEach(r => { if (!repIds.has(r.id)) target.replacements.push(r); });
        if (!target.annotations) target.annotations = [];
        const noteIds = new Set(target.annotations.map(a => a.id));
        (incoming.annotations || []).forEach(a => { if (!noteIds.has(a.id)) target.annotations.push(a); });
    }

    // The content script restores its own state rather than waiting to be handed it,
    // which removes the injection/message race the background script used to sleep
    // through. Keyed on this frame's own URL, and merged with any site-wide rules.
    async function restoreFromStorage() {
        try {
            const stored = await chrome.storage.local.get([
                'persistEnabled', 'uiMode', 'defaultScope', 'blurStrength', 'drawKind',
                'annotateTool', 'annotateColor', 'annotateKeep',
                storageKeyForUrl(window.location.href),
                siteKeyForUrl(window.location.href)
            ]);

            settings.uiMode = stored.uiMode === 'pro' ? 'pro' : 'simple';
            settings.defaultScope = stored.defaultScope === 'site' ? 'site' : 'page';
            settings.blurStrength = typeof stored.blurStrength === 'number' ? stored.blurStrength : 1;
            settings.drawKind = stored.drawKind === 'redact' ? 'redact' : 'blur';
            settings.annotateTool = ANNOTATION_KINDS.includes(stored.annotateTool)
                ? stored.annotateTool : 'arrow';
            settings.annotateColor = safeColor(stored.annotateColor);
            settings.annotateKeep = stored.annotateKeep === true;

            if (stored.persistEnabled === false) return;
            // Opaque-origin frames share a global key, so they neither read nor write.
            if (!isPersistableUrl(window.location.href)) return;

            const pageData = migrateChanges(stored[storageKeyForUrl(window.location.href)], 'page');
            const siteData = migrateChanges(stored[siteKeyForUrl(window.location.href)], 'site');
            siteScopeLoaded = true;

            // Merge, never overwrite. The message listener is registered synchronously
            // but this read is async, so a context-menu action (background injects, then
            // immediately messages) can land first. Assigning to `state` here would
            // silently discard it.
            mergeInto(state, cloneState(siteData));
            mergeInto(state, cloneState(pageData));

            renderState();

            // Restored rules are the baseline — undo must not peel them off. Folding them
            // into every existing snapshot keeps that true while leaving anything the user
            // did during the read undoable.
            history = history.map(snap => {
                const merged = cloneState(snap);
                mergeInto(merged, cloneState(siteData));
                mergeInto(merged, cloneState(pageData));
                return merged;
            });
            updateToolbarState();
        } catch (e) {
            // Extension context can be gone (reloaded/updated) - nothing to restore.
        }
    }

    // Another tab on this origin can add or remove site-wide rules at any time. Without
    // this, each frame keeps writing back its own stale snapshot of the site scope and the
    // last tab to save silently destroys the others' rules. Adopting the change also means
    // site rules appear live across tabs instead of only after a reload.
    function adoptSiteScope(siteData) {
        const pageOnly = s => ({
            rules: s.rules.filter(r => r.scope !== 'site'),
            areas: s.areas.filter(a => a.scope !== 'site'),
            replacements: s.replacements.filter(r => r.scope !== 'site'),
            // Never site-scoped, so a change arriving from another tab leaves them alone.
            annotations: (s.annotations || []).map(a => ({ ...a, points: a.points.map(p => [p[0], p[1]]) }))
        });
        state = pageOnly(state);
        mergeInto(state, cloneState(siteData));
        // Undo must not resurrect a rule another tab deleted, nor peel off one it added.
        history = history.map(snap => {
            const merged = pageOnly(cloneState(snap));
            mergeInto(merged, cloneState(siteData));
            return merged;
        });
        renderState();
        updateToolbarState();
    }

    // Order- and key-order-independent identity for a scope payload, so the echo of this
    // frame's own write is recognised reliably.
    function scopeSignature(d) {
        return JSON.stringify({
            r: d.rules.map(x => `${x.id}|${x.kind}|${x.selector}|${x.level}`).sort(),
            a: d.areas.map(x => `${x.id}|${x.kind}|${x.x}|${x.y}|${x.width}|${x.height}`).sort(),
            t: d.replacements.map(x => `${x.id}|${x.oldText}|${x.newText}`).sort(),
            // Always empty for the site scope today, but included so that making
            // annotations site-scopable later cannot silently reintroduce the write-back
            // loop this signature exists to break.
            n: (d.annotations || []).map(x => `${x.id}|${x.kind}|${x.color}`).sort()
        });
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !siteScopeLoaded) return;
            const key = siteKeyForUrl(window.location.href);
            if (!(key in changes)) return;
            const incoming = migrateChanges(changes[key].newValue, 'site');
            if (scopeSignature(incoming) === scopeSignature(serializeScope('site'))) return;
            adoptSiteScope(incoming);
        });
    } catch (e) {
        // Extension context unavailable — cross-tab sync is a nicety, not a requirement.
    }

    // ========== HISTORY ==========
    //
    // Snapshots of state rather than inverse operations. Inverse ops cannot support redo
    // without writing a second implementation of every action, and they drift out of sync
    // the moment a rule is edited from the rules panel instead of by clicking the page.

    const MAX_HISTORY = 60;
    let history = [cloneState(state)];
    let historyIndex = 0;

    function resetHistory() {
        history = [cloneState(state)];
        historyIndex = 0;
        updateToolbarState();
    }

    function commit(label) {
        history = history.slice(0, historyIndex + 1);
        history.push(cloneState(state));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;

        renderState();
        saveChanges();
        if (label) showToast(label, true);
        updateToolbarState();
    }

    function canUndo() { return historyIndex > 0; }
    function canRedo() { return historyIndex < history.length - 1; }

    function undo() {
        if (!canUndo()) {
            showToast('Nothing to undo');
            return;
        }
        historyIndex -= 1;
        state = cloneState(history[historyIndex]);
        renderState();
        saveChanges();
        updateToolbarState();
        showToast('Undone');
    }

    function redo() {
        if (!canRedo()) {
            showToast('Nothing to redo');
            return;
        }
        historyIndex += 1;
        state = cloneState(history[historyIndex]);
        renderState();
        saveChanges();
        updateToolbarState();
        showToast('Redone');
    }

    function clearAllRules() {
        // Page-scoped only. A button labelled "this page" must not silently delete rules
        // the user set for the whole domain — the rules panel is where those get removed.
        // Mirrors resetPage() in the background script.
        const keptSite = state.rules.filter(r => r.scope === 'site').length
            + state.areas.filter(a => a.scope === 'site').length
            + state.replacements.filter(r => r.scope === 'site').length;
        state = {
            rules: state.rules.filter(r => r.scope === 'site'),
            areas: state.areas.filter(a => a.scope === 'site'),
            replacements: state.replacements.filter(r => r.scope === 'site'),
            annotations: []
        };
        commit(keptSite
            ? `Page cleared — ${keptSite} site-wide rule${keptSite === 1 ? '' : 's'} kept`
            : 'All changes cleared');
    }

    // ========== SMART ELEMENT PICKER ==========
    //
    // Hovering targets the literal element under the cursor, which on a real page is
    // nearly always a leaf <span> inside the card the user actually meant. Track the base
    // target plus a depth offset up the ancestor chain, and let arrow keys walk it.

    let pickerBase = null;      // raw element under the cursor
    let pickerTarget = null;    // pickerBase walked up `pickerDepth` levels
    let pickerDepth = 0;
    let pickerOutline = null;
    let pickerHud = null;

    const MODE_COLORS = { blur: '#FF9800', hide: '#F44336', redact: '#111827', draw: '#9C27B0', edit: '#4CAF50' };

    function ancestorAt(el, depth) {
        let node = el;
        for (let i = 0; i < depth; i++) {
            const parent = node.parentElement;
            if (!parent || parent === document.body || parent === document.documentElement) break;
            node = parent;
        }
        return node;
    }

    function maxPickerDepth(el) {
        let depth = 0;
        let node = el;
        while (node.parentElement && node.parentElement !== document.body && node.parentElement !== document.documentElement) {
            node = node.parentElement;
            depth += 1;
        }
        return depth;
    }

    function setPickerBase(el) {
        if (!el || el === pickerBase) return;
        pickerBase = el;
        pickerDepth = 0;
        updatePickerTarget();
    }

    function updatePickerTarget() {
        if (!pickerBase || !pickerBase.isConnected) {
            clearPicker();
            return;
        }
        pickerTarget = ancestorAt(pickerBase, pickerDepth);
        drawPickerOverlay();
    }

    // An overlay rather than an outline on the element itself: setting styles on the page's
    // own elements fights with the effects we apply and can shift layout.
    function drawPickerOverlay() {
        if (!isTopFrame || !pickerTarget) return;

        const rect = pickerTarget.getBoundingClientRect();
        const color = MODE_COLORS[currentModeId] || '#1a73e8';

        if (!pickerOutline) {
            pickerOutline = document.createElement('div');
            pickerOutline.id = 'ceb-picker-outline';
            document.body.appendChild(pickerOutline);
        }
        pickerOutline.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid ${color};
            background: ${color}1a;
            border-radius: 3px;
            z-index: 2147483644;
            pointer-events: none;
            transition: all 0.08s ease-out;
        `;

        if (!pickerHud) {
            pickerHud = document.createElement('div');
            pickerHud.id = 'ceb-picker-hud';
            document.body.appendChild(pickerHud);
        }

        pickerHud.textContent = '';
        const tag = document.createElement('strong');
        tag.textContent = describeElement(pickerTarget);
        const meta = document.createElement('span');
        meta.style.cssText = 'opacity:.75;margin-left:8px';
        meta.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
        pickerHud.appendChild(tag);
        pickerHud.appendChild(meta);

        if (maxPickerDepth(pickerBase) > 0) {
            const hint = document.createElement('span');
            hint.style.cssText = 'opacity:.6;margin-left:10px;font-size:10px';
            hint.textContent = pickerDepth > 0 ? `↑↓ select · ${pickerDepth} up` : '↑↓ select parent';
            pickerHud.appendChild(hint);
        }

        // Sit above the element unless that would go off-screen.
        const hudTop = rect.top > 28 ? rect.top - 26 : Math.min(rect.bottom + 4, window.innerHeight - 26);
        pickerHud.style.cssText = `
            position: fixed;
            left: ${Math.max(4, Math.min(rect.left, window.innerWidth - 220))}px;
            top: ${hudTop}px;
            background: ${color};
            color: #fff;
            padding: 3px 8px;
            border-radius: 4px;
            font: 600 11px/1.5 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            white-space: nowrap;
            z-index: 2147483645;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0,0,0,.25);
        `;
    }

    function describeElement(el) {
        let label = el.tagName.toLowerCase();
        if (el.id) return `${label}#${el.id}`;
        const cls = stableClassesOf(el)[0];
        if (cls) label += `.${cls}`;
        return label;
    }

    function clearPicker() {
        pickerBase = null;
        pickerTarget = null;
        pickerDepth = 0;
        if (pickerOutline) { pickerOutline.remove(); pickerOutline = null; }
        if (pickerHud) { pickerHud.remove(); pickerHud = null; }
    }

    function movePicker(delta) {
        if (!pickerBase) return false;
        const next = pickerDepth + delta;
        if (next < 0 || next > maxPickerDepth(pickerBase)) return false;
        pickerDepth = next;
        updatePickerTarget();
        return true;
    }

    document.addEventListener('mouseover', function(event) {
        if (!isPickerMode(currentModeId)) return;
        if (isToolbarElement(event.target)) return;

        const target = event.target;
        if (target === document.body || target === document.documentElement) return;
        if (isOwnOverlay(target)) return;

        setPickerBase(target);
    });

    document.addEventListener('mouseout', function(event) {
        if (!isPickerMode(currentModeId)) return;
        if (event.relatedTarget) return;
        clearPicker();
    });

    // The overlay is viewport-positioned, so it has to follow scroll and resize.
    window.addEventListener('scroll', () => { if (pickerTarget) drawPickerOverlay(); }, { passive: true });
    window.addEventListener('resize', () => { if (pickerTarget) drawPickerOverlay(); });

    // Message listener
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (typeof message === 'string') {
            // Legacy support
            modeChanged(message);
        } else if (message.action === 'setMode') {
            modeChanged(message.mode);
        } else if (message.action === 'toggleToolbar') {
            toggleToolbarVisibility();
        } else if (message.action === 'showToolbar') {
            chrome.storage.local.set({ toolbarClosed: false });
            createToolbar();
        } else if (message.action === 'applySavedChanges') {
            applySavedChanges(message.changes, message.siteChanges);
        } else if (message.action === 'undo') {
            undo();
        } else if (message.action === 'redo') {
            redo();
        } else if (message.action === 'blurElement') {
            const target = contextMenuTarget();
            if (target) applyKindToElement(target, 'blur');
        } else if (message.action === 'hideElement') {
            const target = contextMenuTarget();
            if (target) applyKindToElement(target, 'hide');
        } else if (message.action === 'redactElement') {
            const target = contextMenuTarget();
            if (target) applyKindToElement(target, 'redact');
        } else if (message.action === 'downloadScreenshot') {
            downloadScreenshot(message.dataUrl);
        } else if (message.action === 'importRules') {
            importRules(message.data);
        } else if (message.action === 'exportRules') {
            sendResponse({ data: buildExport() });
            return true;
        } else if (message.action === 'getMode') {
            // The service worker is terminated after ~30s idle and loses its in-memory
            // tab state, while this script keeps running in whatever mode it was in.
            // It asks us on re-init so a shortcut press still toggles the mode off.
            sendResponse({ mode: currentModeId });
            return true;
        }
    });

    // The right-clicked element is recorded by context-target.js, which is always
    // present. The picker target is only a fallback for when a mode is already active.
    function contextMenuTarget() {
        const target = window.__cebLastContextTarget || pickerTarget;
        if (!target || !target.isConnected) return null;
        if (target === document.body || target === document.documentElement) return null;
        return target;
    }

    function exitMode() {
        modeChanged('idle');
        sendToBackground({ action: 'requestModeChange', mode: 'idle' });
    }

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && currentModeId !== "idle") {
            event.preventDefault();
            exitMode();
            showToast('Exited');
            return;
        }

        // Arrow keys walk the picker up and down the ancestor chain. Only claim them when
        // a picker mode is live and something is actually hovered, so normal scrolling
        // still works everywhere else.
        if (isPickerMode(currentModeId) && pickerBase) {
            if (event.key === 'ArrowUp' || event.key === '[') {
                if (movePicker(1)) event.preventDefault();
                return;
            }
            if (event.key === 'ArrowDown' || event.key === ']') {
                if (movePicker(-1)) event.preventDefault();
                return;
            }
            if (event.key === 'Enter' && pickerTarget) {
                event.preventDefault();
                applyKindToElement(pickerTarget, currentModeId);
                return;
            }
        }

        const mod = event.ctrlKey || event.metaKey;

        // Undo/redo are gated on having something of our own to undo, not on being in a
        // mode. Users routinely press Escape to view the result cleanly before deciding
        // to undo, and gating on mode made the shortcut silently do nothing there.
        // When we have nothing queued we leave the key alone so the page keeps it.

        // Redo: Ctrl/Cmd+Shift+Z, or Ctrl+Y on the Windows convention.
        if (mod && event.shiftKey && event.key.toLowerCase() === 'z') {
            if (canRedo()) {
                event.preventDefault();
                redo();
            }
            return;
        }
        if (mod && !event.shiftKey && event.key.toLowerCase() === 'y') {
            if (canRedo()) {
                event.preventDefault();
                redo();
            }
            return;
        }

        // Ctrl+Z / Cmd+Z for undo. In edit mode the browser's native contenteditable
        // undo is the better behaviour for text, so we only take over once we have our
        // own actions to reverse.
        if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') {
            if (canUndo()) {
                event.preventDefault();
                undo();
            }
            return;
        }

        if (
            currentModeId === "edit" &&
            event.altKey &&
            event.key.toLowerCase() === "r"
        ) {
            const oldText = window.getSelection().toString();

            if (!oldText) {
                alert("Please select the text you want to replace.");
                return;
            }

            triggerTextReplace(oldText.trimEnd());
        }
    });

    // Helper to check if element is part of toolbar
    function isToolbarElement(el) {
        return Boolean(el && typeof el.closest === 'function' &&
            (el.id === 'ceb-toolbar' || el.closest('#ceb-toolbar') ||
             el.id === 'ceb-picker-hud' || el.id === 'ceb-picker-outline'));
    }

    document.addEventListener(
        "click",
        function(event) {
            // Skip if clicking on toolbar
            if (isToolbarElement(event.target)) return;

            // Let a drawn area or an annotation handle its own click so it can be
            // removed or edited.
            if (isOwnOverlay(event.target)) return;
            
            // Skip if in draw mode (handled by overlay)
            if (currentModeId === "draw") return;

            if (isPickerMode(currentModeId)) {
                // Act on the picker's current candidate, which may be an ancestor of
                // whatever was literally clicked.
                const target = pickerTarget && pickerTarget.isConnected ? pickerTarget : event.target;
                applyKindToElement(target, currentModeId);
                event.stopPropagation();
                event.preventDefault();
                return false;
            }

            if (currentModeId !== "idle") {
                event.stopPropagation();
                event.preventDefault();
                return false;
            }
        },
        true
    );

    // ========== EXPORT / IMPORT ==========

    function buildExport() {
        return {
            format: 'content-edit-blur',
            version: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            url: window.location.href,
            origin: window.location.origin,
            page: serializeScope('page'),
            site: serializeScope('site')
        };
    }

    function importRules(data) {
        if (!data || data.format !== 'content-edit-blur') {
            showToast('Not a valid rules file');
            return;
        }
        const pageData = migrateChanges(data.page, 'page');
        const siteData = migrateChanges(data.site, 'site');

        // Fresh ids on import so re-importing the same file cannot collide with what is
        // already here.
        [...pageData.rules, ...siteData.rules].forEach(r => { r.id = newId('r'); });
        [...pageData.areas, ...siteData.areas].forEach(a => { a.id = newId('a'); });
        [...pageData.replacements, ...siteData.replacements].forEach(r => { r.id = newId('t'); });
        [...pageData.annotations, ...siteData.annotations].forEach(a => { a.id = newId('n'); });

        mergeIntoState(pageData);
        mergeIntoState(siteData);
        commit(`Imported ${pageData.rules.length + siteData.rules.length} rules`);
    }

    function downloadExport() {
        const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ceb-rules-${window.location.hostname || 'page'}-${Date.now()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Rules exported');
    }

    function promptImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    importRules(JSON.parse(String(reader.result)));
                } catch (e) {
                    showToast('Could not read that file');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    // Initialize image loader
    (function initImageLoader() {
        inputElement = document.createElement("input");
        inputElement.type = "file";
        inputElement.accept = "image/*";

        inputElement.addEventListener("change", function() {
            loadImageFromFile(imgElement, this.files[0]);
        });
    })();
    
    // ========== FLOATING TOOLBAR ==========
    let toolbar = null;
    let isToolbarCollapsed = false;
    let toolbarListeners = null;
    
    function toggleToolbarVisibility() {
        if (toolbar) {
            closeToolbar();
        } else {
            chrome.storage.local.set({ toolbarClosed: false });
            createToolbar();
        }
    }
    
    function createToolbar() {
        // One toolbar per page, not per frame.
        if (toolbar || !isTopFrame) return;
        
        // Detect dark mode
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = prefersDark ? 'dark' : 'light';

        toolbarListeners = new AbortController();
        
        toolbar = document.createElement('div');
        toolbar.id = 'ceb-toolbar';
        toolbar.setAttribute('data-theme', theme);
        toolbar.innerHTML = `
            <div class="ceb-toolbar-header">
                <svg class="ceb-toolbar-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
                </svg>
                <span class="ceb-toolbar-title">Content Edit &amp; Blur</span>
                <button class="ceb-toolbar-collapse" aria-label="Collapse">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <button class="ceb-toolbar-close" aria-label="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ceb-toolbar-body">
                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Text Editing</div>
                    <button class="ceb-tb-btn ceb-tb-btn-wide" data-mode="edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        <span class="ceb-tb-label">Edit Text</span>
                        <span class="ceb-tb-hint">Alt+R to replace</span>
                    </button>
                </div>
                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Privacy Tools</div>
                    <div class="ceb-tb-row">
                        <button class="ceb-tb-btn" data-mode="blur" title="Blur elements — click again for a stronger blur">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"/>
                                <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
                                <circle cx="12" cy="12" r="10" stroke-dasharray="1 3"/>
                            </svg>
                            <span class="ceb-tb-label">Blur</span>
                        </button>
                        <button class="ceb-tb-btn" data-mode="hide" title="Hide elements">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                            <span class="ceb-tb-label">Hide</span>
                        </button>
                        <button class="ceb-tb-btn" data-mode="draw" title="Drag to cover an area">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <path d="M8 8h8v8H8z" stroke-dasharray="2 2"/>
                            </svg>
                            <span class="ceb-tb-label">Draw</span>
                        </button>
                    </div>
                    <button class="ceb-tb-btn ceb-tb-btn-wide ceb-pro-only" data-mode="redact"
                            title="Solid block — unlike blur this cannot be reversed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="7" width="18" height="10" rx="1" fill="currentColor"/>
                        </svg>
                        <span class="ceb-tb-label">Redact</span>
                        <span class="ceb-tb-hint">Irreversible solid block</span>
                    </button>
                    <button class="ceb-tb-btn ceb-tb-btn-wide" data-mode="annotate"
                            title="Draw arrows and circles, or add a note">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 20 L20 4"/>
                            <path d="M14 4h6v6"/>
                        </svg>
                        <span class="ceb-tb-label">Annotate</span>
                        <span class="ceb-tb-hint">Arrows, circles and notes</span>
                    </button>
                </div>

                <div class="ceb-tb-section" id="ceb-annotate-tools" hidden>
                    <div class="ceb-tb-section-label">Annotation</div>
                    <div class="ceb-tb-row ceb-note-tools">
                        <button class="ceb-note-tool" data-note-tool="arrow" title="Arrow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 20 L20 4"/><path d="M14 4h6v6"/>
                            </svg>
                        </button>
                        <button class="ceb-note-tool" data-note-tool="ellipse" title="Circle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <ellipse cx="12" cy="12" rx="9" ry="7"/>
                            </svg>
                        </button>
                        <button class="ceb-note-tool" data-note-tool="text" title="Note text">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>
                            </svg>
                        </button>
                        <button class="ceb-note-tool ceb-pro-only" data-note-tool="rect" title="Box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="4" y="6" width="16" height="12" rx="2"/>
                            </svg>
                        </button>
                        <button class="ceb-note-tool ceb-pro-only" data-note-tool="pen" title="Freehand">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 18c4-10 8 6 12-2 2-4 4-2 6-1"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ceb-tb-row ceb-note-colors" id="ceb-note-colors"></div>
                    <button class="ceb-tb-mini ceb-note-keep" id="ceb-btn-note-keep">
                        Keep after reload
                    </button>
                </div>

                <div class="ceb-tb-section ceb-pro-only">
                    <div class="ceb-tb-section-label">Apply To</div>
                    <div class="ceb-seg" id="ceb-scope-seg">
                        <button class="ceb-seg-btn" data-scope="page" title="Only this exact URL">This page</button>
                        <button class="ceb-seg-btn" data-scope="site" title="Every page on this domain">Whole site</button>
                    </div>
                    <div class="ceb-seg ceb-seg-sm" id="ceb-drawkind-seg">
                        <button class="ceb-seg-btn" data-drawkind="blur">Draw: blur</button>
                        <button class="ceb-seg-btn" data-drawkind="redact">Draw: solid</button>
                    </div>
                </div>

                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Actions</div>
                    <div class="ceb-tb-row">
                        <button class="ceb-tb-btn ceb-tb-action" id="ceb-btn-undo" title="Undo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="1 4 1 10 7 10"/>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action ceb-pro-only" id="ceb-btn-redo" title="Redo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action" id="ceb-btn-screenshot" title="Screenshot">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action ceb-tb-danger" id="ceb-btn-reset" title="Clear everything on this page">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="ceb-tb-section ceb-pro-only">
                    <button class="ceb-tb-disclosure" id="ceb-rules-toggle" aria-expanded="false">
                        <svg class="ceb-tb-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <span>Rules</span>
                        <span class="ceb-tb-count" id="ceb-rules-count">0</span>
                    </button>
                    <div class="ceb-rules-panel" id="ceb-rules-panel" hidden>
                        <div class="ceb-rules-list" id="ceb-rules-list"></div>
                        <div class="ceb-rules-io">
                            <button class="ceb-tb-mini" id="ceb-btn-export">Export</button>
                            <button class="ceb-tb-mini" id="ceb-btn-import">Import</button>
                        </div>
                    </div>
                </div>

                <div class="ceb-tb-restore" id="ceb-restore-section" style="display:none;">
                    <button class="ceb-tb-restore-btn" id="ceb-btn-restore">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="21 8 21 21 3 21 3 8"/>
                            <rect x="1" y="3" width="22" height="5"/>
                        </svg>
                        <span>Restore <span id="ceb-restore-count">0</span> saved changes</span>
                    </button>
                </div>
            </div>
            <div class="ceb-toolbar-footer">
                <div class="ceb-tb-stats" id="ceb-stats"></div>
                <label class="ceb-tb-toggle" title="Auto-save changes">
                    <input type="checkbox" id="ceb-persist-toggle">
                    <span class="ceb-tb-toggle-slider"></span>
                    <span class="ceb-tb-toggle-label">Auto-save</span>
                </label>
            </div>
            <div class="ceb-toolbar-footer ceb-toolbar-footer-alt">
                <div class="ceb-seg ceb-seg-sm ceb-seg-ui" id="ceb-ui-seg">
                    <button class="ceb-seg-btn" data-ui="simple">Simple</button>
                    <button class="ceb-seg-btn" data-ui="pro">Pro</button>
                </div>
                <button class="ceb-tb-help" id="ceb-btn-help" title="Keyboard shortcuts">?</button>
            </div>
            <div class="ceb-mode-indicator" id="ceb-mode-indicator"></div>
        `;
        
        const style = document.createElement('style');
        style.id = 'ceb-toolbar-styles';
        style.textContent = `
            #ceb-toolbar {
                --ceb-bg: #ffffff;
                --ceb-bg-secondary: #f8f9fa;
                --ceb-border: #e0e0e0;
                --ceb-text: #202124;
                --ceb-text-secondary: #5f6368;
                --ceb-accent: #1a73e8;
                --ceb-accent-blur: #ea8600;
                --ceb-accent-hide: #d93025;
                position: fixed;
                top: 16px;
                right: 16px;
                width: 240px;
                background: var(--ceb-bg);
                border-radius: 12px;
                box-shadow: 0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08);
                z-index: 2147483645;
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                user-select: none;
            }
            #ceb-toolbar[data-theme="dark"] {
                --ceb-bg: #292a2d;
                --ceb-bg-secondary: #35363a;
                --ceb-border: #48494d;
                --ceb-text: #e8eaed;
                --ceb-text-secondary: #9aa0a6;
            }
            #ceb-toolbar.collapsed .ceb-toolbar-body,
            #ceb-toolbar.collapsed .ceb-toolbar-footer,
            #ceb-toolbar.collapsed .ceb-mode-indicator { display: none; }
            #ceb-toolbar.collapsed { width: auto; }
            #ceb-toolbar.collapsed .ceb-toolbar-header { border-radius: 12px; }
            #ceb-toolbar.collapsed .ceb-toolbar-title { display: none; }
            .ceb-toolbar-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: linear-gradient(135deg, #1a73e8, #8e24aa);
                border-radius: 12px 12px 0 0;
                cursor: move;
            }
            .ceb-toolbar-logo { width: 18px; height: 18px; stroke: white; }
            .ceb-toolbar-title {
                flex: 1;
                font-size: 12px;
                font-weight: 600;
                color: white;
            }
            .ceb-toolbar-collapse, .ceb-toolbar-close {
                width: 24px; height: 24px;
                border: none;
                background: rgba(255,255,255,0.15);
                color: white;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s;
            }
            .ceb-toolbar-collapse:hover, .ceb-toolbar-close:hover {
                background: rgba(255,255,255,0.25);
            }
            .ceb-toolbar-body { padding: 12px; }
            .ceb-tb-section { margin-bottom: 12px; }
            .ceb-tb-section:last-child { margin-bottom: 0; }
            .ceb-tb-section-label {
                font-size: 10px;
                font-weight: 600;
                color: var(--ceb-text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
            }
            .ceb-tb-row {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }
            .ceb-tb-btn {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 10px 8px;
                background: var(--ceb-bg-secondary);
                border: 1px solid var(--ceb-border);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .ceb-tb-btn:hover {
                background: var(--ceb-bg);
                border-color: var(--ceb-accent);
            }
            .ceb-tb-btn svg { width: 20px; height: 20px; stroke: var(--ceb-text); }
            .ceb-tb-label { font-size: 11px; font-weight: 500; color: var(--ceb-text); }
            .ceb-tb-btn.active {
                background: #e8f0fe;
                border-color: var(--ceb-accent);
                border-width: 2px;
            }
            .ceb-tb-btn.active svg { stroke: var(--ceb-accent); }
            .ceb-tb-btn.active .ceb-tb-label { color: var(--ceb-accent); }
            .ceb-tb-btn.active[data-mode="blur"], .ceb-tb-btn.active[data-mode="draw"] {
                background: #fef7e0; border-color: var(--ceb-accent-blur);
            }
            .ceb-tb-btn.active[data-mode="blur"] svg, .ceb-tb-btn.active[data-mode="draw"] svg { stroke: var(--ceb-accent-blur); }
            .ceb-tb-btn.active[data-mode="blur"] .ceb-tb-label, .ceb-tb-btn.active[data-mode="draw"] .ceb-tb-label { color: var(--ceb-accent-blur); }
            .ceb-tb-btn.active[data-mode="hide"] { background: #fce8e6; border-color: var(--ceb-accent-hide); }
            .ceb-tb-btn.active[data-mode="hide"] svg { stroke: var(--ceb-accent-hide); }
            .ceb-tb-btn.active[data-mode="hide"] .ceb-tb-label { color: var(--ceb-accent-hide); }
            .ceb-tb-btn.active[data-mode="annotate"] { background: #ffe4e6; border-color: #e11d48; }
            .ceb-tb-btn.active[data-mode="annotate"] svg { stroke: #e11d48; }
            .ceb-tb-btn.active[data-mode="annotate"] .ceb-tb-label { color: #e11d48; }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="annotate"] { background: rgba(225,29,72,.22); }

            /* Flex, not the shared 3/4-column grid: five tools would otherwise wrap
               and leave one orphan on a second row. */
            .ceb-note-tools { display: flex; gap: 4px; }
            .ceb-note-tool {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 7px 0;
                border: 1px solid var(--ceb-border);
                border-radius: 7px;
                background: var(--ceb-surface);
                color: var(--ceb-text-dim);
                cursor: pointer;
            }
            .ceb-note-tool svg { width: 17px; height: 17px; }
            .ceb-note-tool:hover { border-color: var(--ceb-text-dim); color: var(--ceb-text); }
            .ceb-note-tool.active { background: #ffe4e6; border-color: #e11d48; color: #e11d48; }
            #ceb-toolbar[data-theme="dark"] .ceb-note-tool.active { background: rgba(225,29,72,.22); }

            .ceb-note-colors { display: flex; gap: 8px; margin-top: 8px; }
            .ceb-note-swatch {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid transparent;
                box-shadow: 0 0 0 1px var(--ceb-border) inset;
                cursor: pointer;
                padding: 0;
            }
            .ceb-note-swatch.active { border-color: var(--ceb-text); }

            .ceb-note-keep { width: 100%; margin-top: 6px; text-align: center; }
            .ceb-note-keep.active { background: #ffe4e6; border-color: #e11d48; color: #e11d48; }
            #ceb-toolbar[data-theme="dark"] .ceb-note-keep.active { background: rgba(225,29,72,.22); }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active { background: rgba(26,115,232,0.2); }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="blur"],
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="draw"] { background: rgba(234,134,0,0.2); }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="hide"] { background: rgba(217,48,37,0.2); }
            .ceb-tb-btn-wide {
                flex-direction: row;
                justify-content: flex-start;
                padding: 10px 12px;
                gap: 10px;
            }
            .ceb-tb-btn-wide .ceb-tb-label { flex: 1; text-align: left; font-size: 12px; }
            .ceb-tb-hint {
                font-size: 9px;
                color: var(--ceb-text-secondary);
                background: var(--ceb-bg);
                padding: 2px 6px;
                border-radius: 4px;
            }
            .ceb-tb-action { padding: 8px; }
            .ceb-tb-action svg { width: 18px; height: 18px; }
            .ceb-tb-danger:hover { border-color: var(--ceb-accent-hide); }
            .ceb-tb-danger:hover svg { stroke: var(--ceb-accent-hide); }
            .ceb-tb-restore {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--ceb-border);
            }
            .ceb-tb-restore-btn {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: #e8f0fe;
                border: 1px solid var(--ceb-accent);
                border-radius: 8px;
                color: var(--ceb-accent);
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s;
            }
            .ceb-tb-restore-btn:hover { background: #d2e3fc; }
            .ceb-tb-restore-btn svg { width: 16px; height: 16px; stroke: var(--ceb-accent); }
            .ceb-toolbar-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                border-top: 1px solid var(--ceb-border);
                font-size: 11px;
            }
            .ceb-tb-stats { color: var(--ceb-text-secondary); }
            .ceb-tb-toggle {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
            }
            .ceb-tb-toggle input { display: none; }
            .ceb-tb-toggle-slider {
                width: 28px; height: 16px;
                background: #ccc;
                border-radius: 8px;
                position: relative;
                transition: background 0.2s;
            }
            .ceb-tb-toggle-slider::before {
                content: '';
                position: absolute;
                width: 12px; height: 12px;
                background: white;
                border-radius: 50%;
                top: 2px; left: 2px;
                transition: transform 0.2s;
            }
            .ceb-tb-toggle input:checked + .ceb-tb-toggle-slider { background: var(--ceb-accent); }
            .ceb-tb-toggle input:checked + .ceb-tb-toggle-slider::before { transform: translateX(12px); }
            .ceb-tb-toggle-label { color: var(--ceb-text-secondary); font-size: 11px; }
            .ceb-mode-indicator {
                padding: 8px 12px;
                font-size: 11px;
                color: white;
                background: var(--ceb-accent);
                text-align: center;
                border-radius: 0 0 12px 12px;
                display: none;
            }
            .ceb-mode-indicator.visible { display: block; }
            .ceb-blur-transition { transition: filter 0.3s ease !important; }
            .ceb-hide-transition { transition: opacity 0.3s ease, visibility 0.3s ease !important; }

            /* --- Simple / Pro --- */
            #ceb-toolbar[data-ui="simple"] .ceb-pro-only { display: none !important; }
            #ceb-toolbar[data-ui="simple"] .ceb-tb-row { grid-template-columns: repeat(3, 1fr); }
            #ceb-toolbar[data-ui="pro"] .ceb-tb-row { grid-template-columns: repeat(4, 1fr); }
            .ceb-toolbar-footer-alt { justify-content: space-between; gap: 8px; }
            #ceb-toolbar.collapsed .ceb-toolbar-footer-alt { display: none; }

            /* --- Segmented controls --- */
            .ceb-seg {
                display: grid;
                grid-auto-flow: column;
                grid-auto-columns: 1fr;
                gap: 2px;
                padding: 2px;
                background: var(--ceb-bg-secondary);
                border: 1px solid var(--ceb-border);
                border-radius: 8px;
            }
            .ceb-seg + .ceb-seg { margin-top: 6px; }
            .ceb-seg-btn {
                border: none;
                background: transparent;
                color: var(--ceb-text-secondary);
                font: 500 11px/1 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                padding: 6px 4px;
                border-radius: 6px;
                cursor: pointer;
                transition: background .15s, color .15s;
            }
            .ceb-seg-btn:hover { color: var(--ceb-text); }
            .ceb-seg-btn.active {
                background: var(--ceb-bg);
                color: var(--ceb-accent);
                box-shadow: 0 1px 3px rgba(0,0,0,.12);
            }
            .ceb-seg-sm .ceb-seg-btn { font-size: 10px; padding: 5px 4px; }
            .ceb-seg-ui { width: 118px; }

            /* --- Rules panel --- */
            .ceb-tb-disclosure {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 7px 8px;
                background: var(--ceb-bg-secondary);
                border: 1px solid var(--ceb-border);
                border-radius: 8px;
                color: var(--ceb-text);
                font: 600 11px/1 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: pointer;
            }
            .ceb-tb-disclosure:hover { border-color: var(--ceb-accent); }
            .ceb-tb-caret { width: 12px; height: 12px; stroke: var(--ceb-text-secondary); transition: transform .15s; }
            .ceb-tb-disclosure[aria-expanded="true"] .ceb-tb-caret { transform: rotate(90deg); }
            .ceb-tb-disclosure span:nth-of-type(1) { flex: 1; text-align: left; }
            .ceb-tb-count {
                background: var(--ceb-accent);
                color: #fff;
                border-radius: 9px;
                padding: 1px 6px;
                font-size: 10px;
            }
            .ceb-rules-panel { margin-top: 6px; }
            .ceb-rules-list { max-height: 168px; overflow-y: auto; }
            .ceb-rule {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 5px 6px;
                border-radius: 6px;
                font-size: 11px;
                color: var(--ceb-text);
                cursor: default;
            }
            .ceb-rule:hover { background: var(--ceb-bg-secondary); }
            .ceb-rule-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
            .ceb-rule-dot[data-kind="blur"]   { background: var(--ceb-accent-blur); }
            .ceb-rule-dot[data-kind="hide"]   { background: var(--ceb-accent-hide); }
            .ceb-rule-dot[data-kind="redact"] { background: #111827; box-shadow: 0 0 0 1px var(--ceb-border); }
            .ceb-rule-dot[data-kind="area"]   { background: #9C27B0; }
            .ceb-rule-dot[data-kind="text"]   { background: #4CAF50; }
            .ceb-rule-label {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                font-size: 10px;
            }
            .ceb-rule-scope {
                font-size: 9px;
                padding: 1px 5px;
                border-radius: 4px;
                background: var(--ceb-bg-secondary);
                border: 1px solid var(--ceb-border);
                color: var(--ceb-text-secondary);
                cursor: pointer;
                flex: none;
            }
            .ceb-rule-scope:hover { border-color: var(--ceb-accent); color: var(--ceb-accent); }
            .ceb-rule-del {
                border: none;
                background: transparent;
                color: var(--ceb-text-secondary);
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                padding: 0 2px;
                flex: none;
            }
            .ceb-rule-del:hover { color: var(--ceb-accent-hide); }
            .ceb-rules-empty {
                padding: 10px 6px;
                font-size: 11px;
                color: var(--ceb-text-secondary);
                text-align: center;
            }
            .ceb-rules-io { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
            .ceb-tb-mini {
                padding: 6px;
                background: var(--ceb-bg-secondary);
                border: 1px solid var(--ceb-border);
                border-radius: 6px;
                color: var(--ceb-text);
                font: 500 11px/1 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: pointer;
            }
            .ceb-tb-mini:hover { border-color: var(--ceb-accent); color: var(--ceb-accent); }
            .ceb-tb-help {
                width: 22px; height: 22px;
                border: 1px solid var(--ceb-border);
                background: var(--ceb-bg-secondary);
                color: var(--ceb-text-secondary);
                border-radius: 50%;
                cursor: pointer;
                font: 600 11px/1 'Segoe UI', sans-serif;
                flex: none;
            }
            .ceb-tb-help:hover { border-color: var(--ceb-accent); color: var(--ceb-accent); }
            .ceb-tb-btn:disabled { opacity: .4; cursor: not-allowed; }
            .ceb-tb-btn:disabled:hover { background: var(--ceb-bg-secondary); border-color: var(--ceb-border); }
            .ceb-tb-btn.active[data-mode="redact"] { background: #e8eaed; border-color: #111827; }
            .ceb-tb-btn.active[data-mode="redact"] svg { stroke: #111827; }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="redact"] { background: rgba(255,255,255,.14); }
            #ceb-toolbar[data-theme="dark"] .ceb-tb-btn.active[data-mode="redact"] svg { stroke: #e8eaed; }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(toolbar);

        const signal = toolbarListeners.signal;
        const on = (el, type, handler) => el && el.addEventListener(type, handler, { signal });
        
        makeDraggable(toolbar, toolbar.querySelector('.ceb-toolbar-header'), signal);
        
        on(toolbar.querySelector('.ceb-toolbar-collapse'), 'click', toggleToolbarCollapse);
        on(toolbar.querySelector('.ceb-toolbar-close'), 'click', closeToolbar);
        
        // Mode buttons
        toolbar.querySelectorAll('.ceb-tb-btn[data-mode]').forEach(btn => {
            on(btn, 'click', () => {
                const mode = btn.dataset.mode;
                requestMode((currentModeId === mode) ? 'idle' : mode);
            });
        });
        
        // Action buttons
        on(toolbar.querySelector('#ceb-btn-undo'), 'click', undo);
        on(toolbar.querySelector('#ceb-btn-redo'), 'click', redo);
        on(toolbar.querySelector('#ceb-btn-screenshot'), 'click', () => {
            captureScreenshot();
        });
        on(toolbar.querySelector('#ceb-btn-reset'), 'click', () => {
            const pageScoped = state.rules.filter(r => r.scope !== 'site').length
                + state.areas.filter(a => a.scope !== 'site').length
                + state.replacements.filter(r => r.scope !== 'site').length
                + state.annotations.length;
            if (!pageScoped) {
                showToast(ruleCount() ? 'Only site-wide rules here — clear them in Rules' : 'Nothing to clear');
                return;
            }
            // Undoable, so this is no longer the destructive dead end it used to be.
            clearAllRules();
        });
        on(toolbar.querySelector('#ceb-btn-restore'), 'click', () => {
            sendToBackground({ action: 'restoreChanges' });
        });

        // Scope + draw-kind segmented controls
        toolbar.querySelectorAll('#ceb-scope-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => {
                settings.defaultScope = btn.dataset.scope;
                chrome.storage.local.set({ defaultScope: settings.defaultScope });
                updateToolbarState();
                showToast(settings.defaultScope === 'site'
                    ? 'New rules apply to the whole site'
                    : 'New rules apply to this page');
            });
        });
        toolbar.querySelectorAll('#ceb-drawkind-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => {
                settings.drawKind = btn.dataset.drawkind;
                chrome.storage.local.set({ drawKind: settings.drawKind });
                updateToolbarState();
            });
        });

        // Annotation tools
        toolbar.querySelectorAll('.ceb-note-tool').forEach(btn => {
            on(btn, 'click', () => {
                settings.annotateTool = btn.dataset.noteTool;
                chrome.storage.local.set({ annotateTool: settings.annotateTool });
                // Picking a tool is also how you enter the mode, so there is no need to
                // press Annotate first.
                if (currentModeId !== 'annotate') requestMode('annotate');
                updateToolbarState();
            });
        });

        const colorRow = toolbar.querySelector('#ceb-note-colors');
        if (colorRow) {
            ANNOTATION_PALETTE.forEach(hex => {
                const swatch = document.createElement('button');
                swatch.className = 'ceb-note-swatch';
                swatch.dataset.noteColor = hex;
                swatch.style.background = hex;
                swatch.title = hex;
                on(swatch, 'click', () => {
                    settings.annotateColor = safeColor(hex);
                    chrome.storage.local.set({ annotateColor: settings.annotateColor });
                    updateToolbarState();
                });
                colorRow.appendChild(swatch);
            });
        }

        // One page-level decision rather than a flag per mark: the user is deciding
        // whether this page's annotations are a keepsake or scaffolding for one screenshot.
        on(toolbar.querySelector('#ceb-btn-note-keep'), 'click', () => {
            settings.annotateKeep = !settings.annotateKeep;
            chrome.storage.local.set({ annotateKeep: settings.annotateKeep });
            state.annotations.forEach(a => { a.persist = settings.annotateKeep; });
            updateToolbarState();
            if (state.annotations.length) {
                commit(settings.annotateKeep
                    ? 'Annotations will be kept on this page'
                    : 'Annotations are session-only again');
            } else {
                showToast(settings.annotateKeep
                    ? 'New annotations will be kept'
                    : 'New annotations are session-only');
            }
        });

        // Simple / Pro
        toolbar.querySelectorAll('#ceb-ui-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => {
                setUiMode(btn.dataset.ui);
            });
        });

        on(toolbar.querySelector('#ceb-btn-help'), 'click', showShortcutHelp);

        // Rules panel
        const rulesToggle = toolbar.querySelector('#ceb-rules-toggle');
        on(rulesToggle, 'click', () => {
            const panel = toolbar.querySelector('#ceb-rules-panel');
            const open = rulesToggle.getAttribute('aria-expanded') === 'true';
            rulesToggle.setAttribute('aria-expanded', String(!open));
            panel.hidden = open;
            if (!open) renderRulesPanel();
        });
        on(toolbar.querySelector('#ceb-btn-export'), 'click', downloadExport);
        on(toolbar.querySelector('#ceb-btn-import'), 'click', promptImport);
        
        // Auto-save toggle
        const persistToggle = toolbar.querySelector('#ceb-persist-toggle');
        chrome.storage.local.get(['persistEnabled'], (result) => {
            persistToggle.checked = result.persistEnabled !== false;
        });
        on(persistToggle, 'change', () => {
            chrome.storage.local.set({ persistEnabled: persistToggle.checked });
            showToast(persistToggle.checked ? 'Auto-save on' : 'Auto-save off');
        });
        
        updateToolbarState();
        updateToolbarStats();
        renderRulesPanel();
        checkSavedChanges();
        maybeShowOnboarding();
    }

    function setUiMode(mode) {
        settings.uiMode = mode === 'pro' ? 'pro' : 'simple';
        chrome.storage.local.set({ uiMode: settings.uiMode });
        if (toolbar) toolbar.setAttribute('data-ui', settings.uiMode);
        // Leaving Pro while in a Pro-only mode would strand the user in a mode with no
        // visible way back out.
        if (settings.uiMode === 'simple' && currentModeId === 'redact') {
            requestMode('idle');
        }
        // Same for a Pro-only annotation tool: its button is hidden in Simple, so the
        // active tool would be one the user can neither see nor change.
        if (settings.uiMode === 'simple' && ['rect', 'pen'].includes(settings.annotateTool)) {
            settings.annotateTool = 'arrow';
            chrome.storage.local.set({ annotateTool: 'arrow' });
        }
        updateToolbarState();
        showToast(settings.uiMode === 'pro' ? 'Pro tools shown' : 'Simple mode');
    }

    // ========== RULES PANEL ==========

    function ruleEntries() {
        const entries = [];
        state.rules.forEach(r => entries.push({
            id: r.id, kind: r.kind, scope: r.scope, label: r.selector,
            type: 'rule',
            title: `${r.kind}: ${r.selector}`
        }));
        state.areas.forEach(a => entries.push({
            id: a.id, kind: 'area', scope: a.scope, type: 'area',
            label: `${a.kind === 'redact' ? 'solid' : 'blur'} area ${Math.round(a.width)}×${Math.round(a.height)}`,
            title: 'Drawn area'
        }));
        state.replacements.forEach(r => entries.push({
            id: r.id, kind: 'text', scope: r.scope, type: 'replacement',
            label: `"${r.oldText}" → "${r.newText}"`,
            title: 'Text replacement'
        }));
        state.annotations.forEach(a => entries.push({
            id: a.id, kind: 'annotation', scope: 'page', type: 'annotation',
            label: a.kind === 'text'
                ? `note: "${a.text.slice(0, 30)}${a.text.length > 30 ? '…' : ''}"`
                : `${a.kind}${a.persist ? '' : ' (session only)'}`,
            title: a.persist ? 'Annotation — kept after reload' : 'Annotation — not saved'
        }));
        return entries;
    }

    function renderRulesPanel() {
        if (!toolbar) return;
        const list = toolbar.querySelector('#ceb-rules-list');
        const count = toolbar.querySelector('#ceb-rules-count');
        if (!list) return;

        const entries = ruleEntries();
        if (count) count.textContent = String(entries.length);

        list.textContent = '';
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'ceb-rules-empty';
            empty.textContent = 'No rules yet';
            list.appendChild(empty);
            return;
        }

        entries.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'ceb-rule';
            row.title = entry.title;

            const dot = document.createElement('span');
            dot.className = 'ceb-rule-dot';
            dot.dataset.kind = entry.kind;

            // textContent throughout: selectors and replacement text come off the page.
            const label = document.createElement('span');
            label.className = 'ceb-rule-label';
            label.textContent = entry.label;

            const scope = document.createElement('button');
            scope.className = 'ceb-rule-scope';
            scope.textContent = entry.scope === 'site' ? 'site' : 'page';
            scope.title = 'Click to switch between this page and the whole site';
            scope.addEventListener('click', () => toggleRuleScope(entry));

            const del = document.createElement('button');
            del.className = 'ceb-rule-del';
            del.textContent = '×';
            del.title = 'Delete this rule';
            del.addEventListener('click', () => deleteRule(entry));

            // Hovering a row flashes the element it targets, so a cryptic selector is
            // still identifiable.
            row.addEventListener('mouseenter', () => highlightRuleTarget(entry));
            row.addEventListener('mouseleave', clearRuleHighlight);

            row.appendChild(dot);
            row.appendChild(label);
            row.appendChild(scope);
            row.appendChild(del);
            list.appendChild(row);
        });
    }

    let ruleHighlight = null;
    function highlightRuleTarget(entry) {
        clearRuleHighlight();
        let rect = null;

        if (entry.type === 'rule') {
            const rule = state.rules.find(r => r.id === entry.id);
            if (!rule) return;
            let el;
            try { el = document.querySelector(rule.selector); } catch (e) { return; }
            if (!el) return;
            rect = el.getBoundingClientRect();
        } else if (entry.type === 'area') {
            const area = state.areas.find(a => a.id === entry.id);
            if (!area) return;
            rect = {
                left: area.x - window.scrollX, top: area.y - window.scrollY,
                width: area.width, height: area.height
            };
        }
        if (!rect) return;

        ruleHighlight = document.createElement('div');
        ruleHighlight.id = 'ceb-rule-highlight';
        ruleHighlight.style.cssText = `
            position: fixed;
            left: ${rect.left}px; top: ${rect.top}px;
            width: ${rect.width}px; height: ${rect.height}px;
            border: 2px solid #1a73e8;
            background: rgba(26,115,232,.12);
            border-radius: 3px;
            z-index: 2147483644;
            pointer-events: none;
        `;
        document.body.appendChild(ruleHighlight);
    }

    function clearRuleHighlight() {
        if (ruleHighlight) { ruleHighlight.remove(); ruleHighlight = null; }
    }

    function toggleRuleScope(entry) {
        // Annotations are positional, so "show this arrow on every page of the domain"
        // has no sensible meaning.
        if (entry.type === 'annotation') {
            showToast('Annotations apply to this page only');
            return;
        }
        const next = entry.scope === 'site' ? 'page' : 'site';
        const collection = entry.type === 'rule' ? state.rules
            : entry.type === 'area' ? state.areas : state.replacements;
        const item = collection.find(i => i.id === entry.id);
        if (!item) return;
        item.scope = next;
        commit(next === 'site' ? 'Applied to whole site' : 'Applied to this page only');
    }

    function deleteRule(entry) {
        clearRuleHighlight();
        if (entry.type === 'rule') state.rules = state.rules.filter(r => r.id !== entry.id);
        else if (entry.type === 'area') state.areas = state.areas.filter(a => a.id !== entry.id);
        else if (entry.type === 'annotation') state.annotations = state.annotations.filter(a => a.id !== entry.id);
        else state.replacements = state.replacements.filter(r => r.id !== entry.id);
        commit('Rule deleted');
    }

    function showShortcutHelp() {
        const rows = [
            ['Esc', 'Exit the current mode'],
            [`${MOD}Z`, 'Undo'],
            [`${MOD}⇧Z`, 'Redo'],
            ['↑ / ↓', 'Select parent / child element'],
            ['Enter', 'Apply to the selected element'],
            ['Alt+R', 'Replace selected text (Edit mode)'],
            ['Alt+1/2/3', 'Edit / Blur / Hide mode'],
            ['Alt+Shift+E', 'Toggle this toolbar'],
            ['Enter', 'Commit a text note (Shift+Enter for a new line)'],
            ['Esc', 'Close the note editor']
        ];
        showPanel('Keyboard shortcuts', rows);
    }

    // Small transient panel used for the shortcut sheet.
    function showPanel(title, rows) {
        document.getElementById('ceb-panel')?.remove();

        const panel = document.createElement('div');
        panel.id = 'ceb-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: #202124;
            color: #e8eaed;
            padding: 18px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,.4);
            z-index: 2147483647;
            font: 13px/1.6 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            min-width: 280px;
        `;

        const h = document.createElement('div');
        h.textContent = title;
        h.style.cssText = 'font-weight:600;margin-bottom:12px;font-size:14px';
        panel.appendChild(h);

        rows.forEach(([key, desc]) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:3px 0';
            const k = document.createElement('kbd');
            k.textContent = key;
            k.style.cssText = 'background:#3c4043;border-radius:4px;padding:2px 7px;font:600 11px ui-monospace,Menlo,monospace;flex:none';
            const d = document.createElement('span');
            d.textContent = desc;
            d.style.cssText = 'opacity:.85;text-align:right';
            row.appendChild(k);
            row.appendChild(d);
            panel.appendChild(row);
        });

        const close = document.createElement('button');
        close.textContent = 'Got it';
        close.style.cssText = 'margin-top:14px;width:100%;padding:8px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font:500 12px "Segoe UI",sans-serif';
        close.addEventListener('click', () => panel.remove());
        panel.appendChild(close);

        document.body.appendChild(panel);
    }

    async function maybeShowOnboarding() {
        try {
            const { onboarded } = await chrome.storage.local.get(['onboarded']);
            if (onboarded) return;
            chrome.storage.local.set({ onboarded: true });
            showPanel('Quick start', [
                ['Hover', 'Highlights what you are about to change'],
                ['↑ / ↓', 'Grow or shrink the selection'],
                ['Click', 'Apply blur / hide / redact'],
                ['Esc', 'Exit the current mode'],
                ['Pro', 'Unlocks redaction, site rules and more']
            ]);
        } catch (e) {}
    }
    
    async function checkSavedChanges() {
        if (!toolbar) return;
        try {
            const key = storageKeyForUrl(window.location.href);
            const result = await chrome.storage.local.get([key]);
            const saved = migrateChanges(result[key], 'page');
            const total = saved.rules.length + saved.areas.length + saved.replacements.length;

            const section = toolbar.querySelector('#ceb-restore-section');
            const countEl = toolbar.querySelector('#ceb-restore-count');
            // Only offer a restore when the page is not already showing them.
            if (total > 0 && ruleCount() === 0) {
                if (countEl) countEl.textContent = String(total);
                if (section) section.style.display = '';
            } else if (section) {
                section.style.display = 'none';
            }
        } catch (e) {}
    }
    
    function updateToolbarState() {
        if (!toolbar) return;

        toolbar.setAttribute('data-ui', settings.uiMode);

        toolbar.querySelectorAll('.ceb-tb-btn[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === currentModeId);
        });

        toolbar.querySelectorAll('#ceb-scope-seg .ceb-seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.scope === settings.defaultScope);
        });
        toolbar.querySelectorAll('#ceb-drawkind-seg .ceb-seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.drawkind === settings.drawKind);
        });

        // The annotation tools take up real space, so they only appear while the mode is
        // active rather than sitting there permanently.
        const noteTools = toolbar.querySelector('#ceb-annotate-tools');
        if (noteTools) noteTools.hidden = currentModeId !== 'annotate';

        toolbar.querySelectorAll('.ceb-note-tool').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.noteTool === settings.annotateTool);
        });
        toolbar.querySelectorAll('.ceb-note-swatch').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.noteColor === settings.annotateColor);
        });
        const keepBtn = toolbar.querySelector('#ceb-btn-note-keep');
        if (keepBtn) {
            keepBtn.classList.toggle('active', settings.annotateKeep);
            keepBtn.textContent = settings.annotateKeep ? 'Kept after reload' : 'Keep after reload';
        }
        toolbar.querySelectorAll('#ceb-ui-seg .ceb-seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ui === settings.uiMode);
        });

        const undoBtn = toolbar.querySelector('#ceb-btn-undo');
        const redoBtn = toolbar.querySelector('#ceb-btn-redo');
        if (undoBtn) undoBtn.disabled = !canUndo();
        if (redoBtn) redoBtn.disabled = !canRedo();

        const indicator = toolbar.querySelector('#ceb-mode-indicator');
        if (indicator) {
            const hints = {
                'edit': 'Click any text to edit • Alt+R to replace',
                'blur': 'Click to blur • ↑↓ to select parent',
                'hide': 'Click to hide • ↑↓ to select parent',
                'redact': 'Click for a solid block • cannot be undone by viewers',
                'draw': settings.drawKind === 'redact' ? 'Drag to draw a solid block' : 'Drag to draw a blur area'
            };
            if (currentModeId !== 'idle' && hints[currentModeId]) {
                indicator.textContent = hints[currentModeId];
                indicator.classList.add('visible');
            } else {
                indicator.classList.remove('visible');
            }
        }
    }
    
    function updateToolbarStats() {
        if (!toolbar) return;
        const stats = toolbar.querySelector('#ceb-stats');
        if (stats) {
            const total = ruleCount();
            const siteCount = state.rules.filter(r => r.scope === 'site').length;
            let text = total > 0 ? `${total} change${total > 1 ? 's' : ''}` : '';
            if (siteCount > 0) text += ` · ${siteCount} site-wide`;
            stats.textContent = text;
        }
        renderRulesPanel();
    }
    
    function toggleToolbarCollapse() {
        if (!toolbar) return;
        isToolbarCollapsed = !isToolbarCollapsed;
        toolbar.classList.toggle('collapsed', isToolbarCollapsed);
        const collapseBtn = toolbar.querySelector('.ceb-toolbar-collapse');
        if (collapseBtn) {
            collapseBtn.innerHTML = isToolbarCollapsed 
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="18 15 12 9 6 15"/>
                   </svg>`
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                   </svg>`;
        }
    }
    
    function closeToolbar() {
        // Drops the document-level drag listeners too, which used to accumulate on
        // every open/close cycle.
        if (toolbarListeners) {
            toolbarListeners.abort();
            toolbarListeners = null;
        }
        if (toolbar) {
            toolbar.remove();
            toolbar = null;
        }
        const style = document.getElementById('ceb-toolbar-styles');
        if (style) style.remove();
        
        // Save preference
        chrome.storage.local.set({ toolbarClosed: true });
    }
    
    function makeDraggable(element, handle, signal) {
        let isDragging = false;
        let startX, startY, startRight, startTop;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            startRight = window.innerWidth - rect.right;
            startTop = rect.top;
            e.preventDefault();
        }, { signal });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            element.style.right = Math.max(0, startRight - deltaX) + 'px';
            element.style.top = Math.max(0, startTop + deltaY) + 'px';
            element.style.transform = 'none';
        }, { signal });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        }, { signal });
    }
    
    // Show toolbar when a mode is activated
    const originalModeChanged = modeChanged;
    modeChanged = function(newModeId) {
        originalModeChanged(newModeId);
        
        // Show toolbar if mode is not idle and user hasn't closed it
        if (newModeId !== 'idle' && isTopFrame) {
            chrome.storage.local.get(['toolbarClosed'], (result) => {
                if (!result.toolbarClosed) {
                    createToolbar();
                }
            });
        }
        
        updateToolbarState();
    };

    // Restore anything saved for this page. Runs last so every helper above is defined.
    restoreFromStorage();
    
})();