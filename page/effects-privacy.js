// State-derived element effects, privacy selection, and guarded extension APIs.

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
        if (!el || isExtensionUi(el)) return false;

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
        syncAnnotationSelection();
        syncPrivacySelection();

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

    function selectedPrivacyItem() {
        if (!selectedPrivacy) return null;
        const collection = selectedPrivacy.type === 'rule' ? state.rules : state.areas;
        const item = collection.find(entry => entry.id === selectedPrivacy.id) || null;
        if (!item) {
            selectedPrivacy = null;
            clearPrivacyHandles();
            return null;
        }
        return { type: selectedPrivacy.type, item };
    }

    function privacySelectionCompatible(selection, mode) {
        if (!selection) return false;
        if (selection.type === 'area') return mode === 'draw';
        return isPickerMode(mode) && selection.item.kind === mode;
    }

    function clearPrivacyHandles() {
        if (privacyHandles) {
            privacyHandles.remove();
            privacyHandles = null;
        }
    }

    function privacyTargetElement(selection) {
        if (!selection || selection.type !== 'rule') return null;
        try {
            return document.querySelector(selection.item.selector);
        } catch (e) {
            return null;
        }
    }

    function drawPrivacySelection(selection) {
        clearPrivacyHandles();
        if (!selection || !privacySelectionCompatible(selection, currentModeId)) return;

        let rect;
        if (selection.type === 'area') {
            rect = {
                left: selection.item.x - window.scrollX,
                top: selection.item.y - window.scrollY,
                width: selection.item.width,
                height: selection.item.height
            };
        } else {
            const target = privacyTargetElement(selection);
            if (!target) return;
            rect = target.getBoundingClientRect();
        }

        privacyHandles = document.createElement('div');
        privacyHandles.id = 'ceb-privacy-handles';
        privacyHandles.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;'
            + 'z-index:2147483645;pointer-events:none;';

        const outline = document.createElement('div');
        outline.className = 'ceb-privacy-selection-outline';
        outline.style.cssText = `
            position: fixed;
            left: ${rect.left - 2}px;
            top: ${rect.top - 2}px;
            width: ${Math.max(4, rect.width + 4)}px;
            height: ${Math.max(4, rect.height + 4)}px;
            box-sizing: border-box;
            border: 2px dashed #2563eb;
            border-radius: 6px;
            background: rgba(37,99,235,.035);
        `;
        privacyHandles.appendChild(outline);

        if (selection.type === 'area') {
            const corners = [
                ['nw', rect.left, rect.top],
                ['ne', rect.left + rect.width, rect.top],
                ['sw', rect.left, rect.top + rect.height],
                ['se', rect.left + rect.width, rect.top + rect.height]
            ];
            corners.forEach(([corner, x, y]) => {
                const handle = document.createElement('div');
                handle.className = 'ceb-area-handle';
                handle.dataset.cebAreaCorner = corner;
                handle.style.cssText = `
                    position: fixed;
                    left: ${x - 6}px;
                    top: ${y - 6}px;
                    width: 12px;
                    height: 12px;
                    box-sizing: border-box;
                    border-radius: 50%;
                    background: #fff;
                    border: 2px solid #2563eb;
                    box-shadow: 0 1px 3px rgba(0,0,0,.35);
                `;
                privacyHandles.appendChild(handle);
            });
        }

        document.body.appendChild(privacyHandles);
    }

    function syncPrivacySelection() {
        const selection = selectedPrivacyItem();
        if (!privacySelectionCompatible(selection, currentModeId)) {
            clearPrivacyHandles();
            return;
        }
        drawPrivacySelection(selection);
    }

    function selectPrivacy(type, id) {
        const collection = type === 'rule' ? state.rules : state.areas;
        selectedPrivacy = collection.some(entry => entry.id === id) ? { type, id } : null;
        const selection = selectedPrivacyItem();
        if (selection && settings.uiMode === 'essentials'
            && (selection.item.kind === 'redact'
                || (selection.type === 'rule' && selection.item.scope === 'site'))) {
            settings.uiMode = 'advanced';
            writeStorage({ uiMode: settings.uiMode });
        }
        syncPrivacySelection();
        updateToolbarState();
    }

    function clearPrivacySelection(update = true) {
        selectedPrivacy = null;
        clearPrivacyHandles();
        if (update) updateToolbarState();
    }

    function privacySelectionLabel(selection) {
        if (!selection) return '';
        const target = selection.type === 'area' ? 'area' : 'element';
        if (selection.item.kind === 'blur') {
            const strength = safeBlurLevel(selection.item.level, selection.type === 'area' ? 2 : 1) === 2
                ? 'Strong' : 'Soft';
            return `${strength} blur ${target} selected`;
        }
        return `${selection.item.kind === 'hide' ? 'Hidden' : 'Redacted'} ${target} selected`;
    }

    function setSelectedPrivacyKind(kind) {
        const selection = selectedPrivacyItem();
        if (!selection || !KINDS.includes(kind)) return false;
        if (selection.type === 'area' && kind === 'hide') return false;
        if (selection.item.kind === kind) return true;

        if (selection.type === 'rule') {
            state.rules = state.rules.filter(rule => rule === selection.item
                || rule.selector !== selection.item.selector || rule.kind !== kind);
        }
        selection.item.kind = kind;
        if (kind === 'blur') selection.item.level = safeBlurLevel(selection.item.level, settings.blurStrength);
        if (selection.type === 'area') {
            settings.drawKind = kind;
            writeStorage({ drawKind: settings.drawKind });
        }
        commit(kind === 'blur' ? 'Changed to blur'
            : kind === 'hide' ? 'Changed to hide' : 'Changed to redact');
        return true;
    }

    function setBlurStrength(level) {
        const next = safeBlurLevel(level);
        settings.blurStrength = next;
        writeStorage({ blurStrength: next });

        const selection = selectedPrivacyItem();
        if (!selection || selection.item.kind !== 'blur' || selection.item.level === next) {
            updateToolbarState();
            return;
        }
        selection.item.level = next;
        commit(next === 2 ? 'Strong blur applied' : 'Soft blur applied');
    }

    function removeSelectedPrivacy() {
        const selection = selectedPrivacyItem();
        if (!selection) return;
        const label = selection.item.kind === 'blur' ? 'Blur removed'
            : selection.item.kind === 'hide' ? 'Element restored' : 'Redaction removed';
        if (selection.type === 'rule') state.rules = state.rules.filter(rule => rule.id !== selection.item.id);
        else state.areas = state.areas.filter(area => area.id !== selection.item.id);
        clearPrivacySelection(false);
        commit(label);
    }

    // Applying a new effect remains one click. Clicking an effected element again selects
    // it for explicit editing instead of cycling strength or silently removing it.
    function applyKindToElement(elm, kind) {
        if (!elm || isExtensionUi(elm)) return;
        if (elm === document.body || elm === document.documentElement) return;

        // Compute the selector before mutating so nothing we add can leak into it.
        const selector = getElementSelector(elm);
        if (!selector) {
            showToast('Could not target that element. Try ↑/↓ to select a parent.');
            return;
        }

        const existing = ruleForElement(elm, KINDS);
        if (existing) {
            if (isPickerMode(currentModeId)) selectPrivacy('rule', existing.id);
            else showToast(`${existing.kind === 'blur' ? 'Blur' : existing.kind === 'hide' ? 'Hide' : 'Redact'} already applied`);
            return existing;
        }

        const rule = {
            id: newId('r'), kind, selector,
            level: kind === 'blur' ? safeBlurLevel(settings.blurStrength) : 0,
            scope: settings.defaultScope
        };
        state.rules.push(rule);
        if (isPickerMode(currentModeId)) selectedPrivacy = { type: 'rule', id: rule.id };
        commit(kind === 'blur' ? `${rule.level === 2 ? 'Strong' : 'Soft'} blur applied`
            : kind === 'hide' ? 'Element hidden' : 'Element redacted');
        return rule;
    }

    function modeChanged(newModeId) {
        // Redact can be activated from a user-assigned keyboard shortcut. Reveal its
        // Advanced control instead of leaving the user in a mode with no visible owner.
        if (newModeId === 'redact' && settings.uiMode === 'essentials') {
            settings.uiMode = 'advanced';
            writeStorage({ uiMode: settings.uiMode });
        }
        if (newModeId === 'draw' && settings.uiMode === 'essentials' && settings.drawKind === 'redact') {
            settings.drawKind = 'blur';
            writeStorage({ drawKind: settings.drawKind });
        }
        const privacySelection = selectedPrivacyItem();
        if (privacySelection && !privacySelectionCompatible(privacySelection, newModeId)) {
            clearPrivacySelection(false);
        }
        if (newModeId !== currentModeId) closeOpenPanel();
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

    // Switch mode locally and tell the service worker, which owns the badge and the
    // per-tab record. Applying it locally first keeps the UI responsive even if the
    // worker has been terminated and has to spin back up.
    function requestMode(mode) {
        modeChanged(mode);
        sendToBackground({ action: 'requestModeChange', mode });
    }
