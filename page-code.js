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
    //
    // scope is 'page' (this exact URL) or 'site' (every page on this origin).
    const SCHEMA_VERSION = 2;
    const KINDS = ['blur', 'hide', 'redact'];

    let state = { rules: [], areas: [], replacements: [] };

    // Pro settings, mirrored from chrome.storage so the render path stays synchronous.
    let settings = {
        uiMode: 'simple',       // 'simple' | 'pro'
        defaultScope: 'page',   // scope applied to newly created rules
        blurStrength: 1,        // index into BLUR_LEVELS for new blur rules
        drawKind: 'blur'        // 'blur' | 'redact' for newly drawn areas
    };

    let idCounter = 0;
    function newId(prefix) {
        idCounter += 1;
        return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
    }

    function cloneState(s) {
        return {
            rules: s.rules.map(r => ({ ...r })),
            areas: s.areas.map(a => ({ ...a })),
            replacements: s.replacements.map(r => ({ ...r }))
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
        const empty = { rules: [], areas: [], replacements: [] };
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
                    }))
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
            }))
        };
    }

    function serializeScope(scope) {
        return {
            v: SCHEMA_VERSION,
            rules: state.rules.filter(r => r.scope === scope),
            areas: state.areas.filter(a => a.scope === scope),
            replacements: state.replacements.filter(r => r.scope === scope)
        };
    }

    function isEmptyPayload(payload) {
        return !payload.rules.length && !payload.areas.length && !payload.replacements.length;
    }

    function ruleCount() {
        return state.rules.length + state.areas.length + state.replacements.length;
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

        document.body.classList.remove("ceb-mode-idle", "ceb-mode-edit", "ceb-mode-blur", "ceb-mode-hide", "ceb-mode-redact", "ceb-mode-draw");
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

        currentModeId = newModeId;

        if (!isPickerMode(newModeId)) clearPicker();
        
        // Show mode indicator
        updateModeIndicator(newModeId);
    }

    function isPickerMode(mode) {
        return mode === 'blur' || mode === 'hide' || mode === 'redact';
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
    
    // Screenshot download
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
        chrome.runtime.sendMessage(payload).catch(() => {});
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
        state = {
            rules: state.rules.filter(r => r.scope === 'site'),
            areas: state.areas.filter(a => a.scope === 'site'),
            replacements: state.replacements.filter(r => r.scope === 'site')
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
    }

    // The content script restores its own state rather than waiting to be handed it,
    // which removes the injection/message race the background script used to sleep
    // through. Keyed on this frame's own URL, and merged with any site-wide rules.
    async function restoreFromStorage() {
        try {
            const stored = await chrome.storage.local.get([
                'persistEnabled', 'uiMode', 'defaultScope', 'blurStrength', 'drawKind',
                storageKeyForUrl(window.location.href),
                siteKeyForUrl(window.location.href)
            ]);

            settings.uiMode = stored.uiMode === 'pro' ? 'pro' : 'simple';
            settings.defaultScope = stored.defaultScope === 'site' ? 'site' : 'page';
            settings.blurStrength = typeof stored.blurStrength === 'number' ? stored.blurStrength : 1;
            settings.drawKind = stored.drawKind === 'redact' ? 'redact' : 'blur';

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
            replacements: s.replacements.filter(r => r.scope !== 'site')
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
            t: d.replacements.map(x => `${x.id}|${x.oldText}|${x.newText}`).sort()
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
            replacements: state.replacements.filter(r => r.scope === 'site')
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
        if (target.classList && target.classList.contains('ceb-blur-area')) return;

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
        chrome.runtime.sendMessage({ action: 'requestModeChange', mode: 'idle' }).catch(() => {});
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

            // Let a drawn area handle its own click so it can be removed
            if (event.target.classList && event.target.classList.contains('ceb-blur-area')) return;
            
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
                const newMode = (currentModeId === mode) ? 'idle' : mode;
                modeChanged(newMode);
                chrome.runtime.sendMessage({ action: 'requestModeChange', mode: newMode }).catch(() => {});
            });
        });
        
        // Action buttons
        on(toolbar.querySelector('#ceb-btn-undo'), 'click', undo);
        on(toolbar.querySelector('#ceb-btn-redo'), 'click', redo);
        on(toolbar.querySelector('#ceb-btn-screenshot'), 'click', () => {
            chrome.runtime.sendMessage({ action: 'takeScreenshot' }).catch(() => {});
        });
        on(toolbar.querySelector('#ceb-btn-reset'), 'click', () => {
            const pageScoped = state.rules.filter(r => r.scope !== 'site').length
                + state.areas.filter(a => a.scope !== 'site').length
                + state.replacements.filter(r => r.scope !== 'site').length;
            if (!pageScoped) {
                showToast(ruleCount() ? 'Only site-wide rules here — clear them in Rules' : 'Nothing to clear');
                return;
            }
            // Undoable, so this is no longer the destructive dead end it used to be.
            clearAllRules();
        });
        on(toolbar.querySelector('#ceb-btn-restore'), 'click', () => {
            chrome.runtime.sendMessage({ action: 'restoreChanges' }).catch(() => {});
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
            modeChanged('idle');
            chrome.runtime.sendMessage({ action: 'requestModeChange', mode: 'idle' }).catch(() => {});
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
            ['Alt+Shift+E', 'Toggle this toolbar']
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