// Toolbar lifecycle, controls, rules panel, and transient dialogs.

    let toolbar = null;
    let isToolbarCollapsed = false;
    let toolbarListeners = null;
    
    function toggleToolbarVisibility() {
        if (toolbar) {
            closeToolbar();
        } else {
            writeStorage({ toolbarClosed: false });
            createToolbar();
        }
    }
    
    function createToolbar() {
        // One toolbar per page, not per frame.
        if (toolbar || !isTopFrame) return;
        
        toolbarListeners = new AbortController();
        
        toolbar = document.createElement('div');
        toolbar.id = 'ceb-toolbar';
        toolbar.setAttribute('data-theme', 'light');
        toolbar.setAttribute('role', 'region');
        toolbar.setAttribute('aria-label', 'Content Edit and Blur tools');
        toolbar.appendChild(toolbarTemplate());
        document.body.appendChild(toolbar);
        document.getElementById('ceb-mode-badge')?.remove();
        requestAnimationFrame(() => clampToolbarPosition(toolbar));

        const signal = toolbarListeners.signal;
        const on = (el, type, handler) => el && el.addEventListener(type, handler, { signal });
        
        makeDraggable(toolbar, toolbar.querySelector('.ceb-toolbar-header'), signal);
        
        on(toolbar.querySelector('.ceb-toolbar-collapse'), 'click', toggleToolbarCollapse);
        on(toolbar.querySelector('.ceb-toolbar-close'), 'click', closeToolbar);
        
        // Mode buttons
        toolbar.querySelectorAll('.ceb-tb-btn[data-mode]').forEach(btn => {
            on(btn, 'click', () => {
                const mode = btn.dataset.mode;
                const privacySelection = selectedPrivacyItem();
                if (KINDS.includes(mode) && privacySelection) {
                    if (privacySelection.type === 'area' && mode === 'hide') {
                        clearPrivacySelection();
                    } else {
                        setSelectedPrivacyKind(mode);
                        if (privacySelection.type === 'rule' && currentModeId !== mode) requestMode(mode);
                        return;
                    }
                }
                if (mode === 'blur' || mode === 'redact') {
                    settings.drawKind = mode;
                    writeStorage({ drawKind: settings.drawKind });
                    // In Area targeting, these buttons change the effect without
                    // throwing the user back to Element targeting.
                    if (currentModeId === 'draw') {
                        updateToolbarState();
                        return;
                    }
                }
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

        // Scope + privacy-target segmented controls
        toolbar.querySelectorAll('#ceb-scope-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => {
                settings.defaultScope = btn.dataset.scope;
                writeStorage({ defaultScope: settings.defaultScope });
                const privacySelection = selectedPrivacyItem();
                if (privacySelection?.type === 'rule'
                    && privacySelection.item.scope !== settings.defaultScope) {
                    privacySelection.item.scope = settings.defaultScope;
                    commit(settings.defaultScope === 'site'
                        ? 'Applied to whole site' : 'Applied to this page only');
                } else {
                    updateToolbarState();
                    showToast(settings.defaultScope === 'site'
                        ? 'New rules apply to the whole site'
                        : 'New rules apply to this page');
                }
            });
        });
        toolbar.querySelectorAll('#ceb-target-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => {
                clearPrivacySelection();
                if (btn.dataset.target === 'area') {
                    if (currentModeId === 'blur' || currentModeId === 'redact') {
                        settings.drawKind = currentModeId;
                        writeStorage({ drawKind: settings.drawKind });
                    }
                    if (currentModeId !== 'draw') requestMode('draw');
                } else if (currentModeId === 'draw') {
                    requestMode(settings.drawKind === 'redact' ? 'redact' : 'blur');
                }
            });
        });
        toolbar.querySelectorAll('#ceb-blur-strength-seg .ceb-seg-btn').forEach(btn => {
            on(btn, 'click', () => setBlurStrength(Number(btn.dataset.blurLevel)));
        });
        on(toolbar.querySelector('#ceb-btn-privacy-remove'), 'click', removeSelectedPrivacy);

        // Annotation tools
        toolbar.querySelectorAll('.ceb-note-tool').forEach(btn => {
            on(btn, 'click', () => {
                selectedNoteId = null;
                clearHandles();
                settings.annotateTool = btn.dataset.noteTool;
                writeStorage({ annotateTool: settings.annotateTool });
                // Picking a tool is also how you enter the mode, so there is no need to
                // press Annotate first.
                if (currentModeId !== 'annotate') requestMode('annotate');
                updateToolbarState();
            });
        });
        renderNoteSwatches();

        on(toolbar.querySelector('#ceb-btn-note-delete'), 'click', () => {
            const selected = selectedAnnotation();
            if (selected) removeAnnotation(selected.id);
        });

        const noteWidth = toolbar.querySelector('#ceb-note-width-input');
        on(noteWidth, 'input', () => {
            const value = safeNumber(
                noteWidth.value,
                ANNOTATION_STROKE_MIN,
                ANNOTATION_STROKE_MAX,
                ANNOTATION_STROKE_DEFAULT
            );
            const selected = selectedAnnotation();
            if (!selected || !STROKE_KINDS.includes(selected.kind)) {
                settings.annotateSize = value;
                writeStorage({ annotateSize: settings.annotateSize });
            }
            const output = toolbar.querySelector('#ceb-note-width-value');
            const sample = toolbar.querySelector('.ceb-note-width-sample');
            if (output) output.textContent = `${value} px`;
            if (sample) sample.style.setProperty('--ceb-note-width', `${value}px`);
        });
        on(noteWidth, 'change', () => {
            const selected = selectedAnnotation();
            if (!selected || !STROKE_KINDS.includes(selected.kind)) return;
            const value = safeNumber(
                noteWidth.value,
                ANNOTATION_STROKE_MIN,
                ANNOTATION_STROKE_MAX,
                ANNOTATION_STROKE_DEFAULT
            );
            settings.annotateSize = value;
            writeStorage({ annotateSize: settings.annotateSize });
            if (selected.size === value) {
                updateToolbarState();
                return;
            }
            selected.size = value;
            commit('Annotation width changed');
        });

        // One page-level decision rather than a flag per mark: the user is deciding
        // whether this page's annotations are a keepsake or scaffolding for one screenshot.
        on(toolbar.querySelector('#ceb-btn-note-keep'), 'click', () => {
            const effective = settings.persistEnabled && settings.annotateKeep;
            settings.annotateKeep = !effective;
            if (settings.annotateKeep && !settings.persistEnabled) {
                settings.persistEnabled = true;
                writeStorage({ persistEnabled: true });
            }
            writeStorage({ annotateKeep: settings.annotateKeep });
            state.annotations.forEach(a => { a.persist = settings.annotateKeep; });
            updateToolbarState();
            if (state.annotations.length) {
                commit(settings.annotateKeep
                    ? 'Annotations will be remembered on this page'
                    : 'Annotations are session-only again');
            } else {
                showToast(settings.annotateKeep
                    ? 'New annotations will be remembered'
                    : 'New annotations are session-only');
            }
        });

        // Essentials / Advanced
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
        
        // Master persistence toggle. Saved data stays local to this browser.
        const persistToggle = toolbar.querySelector('#ceb-persist-toggle');
        persistToggle.checked = settings.persistEnabled;
        on(persistToggle, 'change', () => {
            settings.persistEnabled = persistToggle.checked;
            writeStorage({ persistEnabled: settings.persistEnabled });
            if (settings.persistEnabled) saveChanges();
            updateToolbarState();
            showToast(settings.persistEnabled
                ? 'Changes will be remembered in this browser'
                : 'Changes are session-only; saved data is paused');
        });
        
        updateToolbarState();
        updateToolbarStats();
        renderRulesPanel();
        checkSavedChanges();
        maybeShowOnboarding();
    }

    function setUiMode(mode) {
        settings.uiMode = mode === 'advanced' || mode === 'pro' ? 'advanced' : 'essentials';
        writeStorage({ uiMode: settings.uiMode });
        if (toolbar) toolbar.setAttribute('data-ui', settings.uiMode);
        const privacySelection = selectedPrivacyItem();
        // Leaving Advanced while in an Advanced-only mode would strand the user in a
        // mode whose control disappeared.
        if (settings.uiMode === 'essentials' && currentModeId === 'redact') {
            requestMode('idle');
        }
        if (settings.uiMode === 'essentials' && privacySelection
            && (privacySelection.item.kind === 'redact'
                || (privacySelection.type === 'rule' && privacySelection.item.scope === 'site'))) {
            clearPrivacySelection(false);
            if (currentModeId === 'draw' && privacySelection.item.kind === 'redact') requestMode('idle');
        }
        if (settings.uiMode === 'essentials' && settings.drawKind === 'redact') {
            settings.drawKind = 'blur';
            writeStorage({ drawKind: 'blur' });
        }
        if (settings.uiMode === 'essentials' && settings.defaultScope === 'site') {
            settings.defaultScope = 'page';
            writeStorage({ defaultScope: 'page' });
        }
        // Same for an Advanced-only annotation tool: its button is hidden in Essentials, so the
        // active tool would be one the user can neither see nor change.
        if (settings.uiMode === 'essentials' && ADVANCED_ANNOTATE_TOOLS.includes(settings.annotateTool)) {
            settings.annotateTool = 'arrow';
            writeStorage({ annotateTool: 'arrow' });
            selectAnnotation(null);
        }
        updateToolbarState();
        showToast(settings.uiMode === 'advanced' ? 'Advanced tools shown' : 'Essentials shown');
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
            label: `${a.kind === 'redact' ? 'redact' : `${safeBlurLevel(a.level, 2) === 2 ? 'strong' : 'soft'} blur`} area ${Math.round(a.width)}×${Math.round(a.height)}`,
            title: 'Rectangular area'
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
                : `${ANNOTATION_LABELS[a.kind] || a.kind}${a.persist ? '' : ' (session only)'}`,
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
            scope.type = 'button';
            scope.className = 'ceb-rule-scope';
            scope.textContent = entry.scope === 'site' ? 'site' : 'page';
            scope.title = 'Click to switch between this page and the whole site';
            scope.setAttribute('aria-label', `Apply ${entry.label} to ${entry.scope === 'site' ? 'this page only' : 'the whole site'}`);
            scope.addEventListener('click', () => toggleRuleScope(entry));

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'ceb-rule-del';
            del.textContent = '×';
            del.title = 'Delete this rule';
            del.setAttribute('aria-label', `Delete ${entry.label}`);
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
            ['Click mark', 'Select an annotation to edit it'],
            ['← ↑ ↓ →', 'Move the selected annotation (Shift for 10 px)'],
            ['Delete', 'Remove the selected annotation'],
            ['Enter', 'Commit a text note (Shift+Enter for a new line)'],
            ['Esc', 'Close the note editor']
        ];
        showPanel('Keyboard shortcuts', rows);
    }

    function closeOpenPanel() {
        const panel = document.getElementById('ceb-panel');
        if (!panel) return;
        if (typeof panel._cebDismiss === 'function') panel._cebDismiss();
        else panel.remove();
    }

    // Small transient dialog used for onboarding and the shortcut sheet.
    function showPanel(title, rows) {
        closeOpenPanel();
        const previousFocus = document.activeElement;

        const panel = document.createElement('div');
        panel.id = 'ceb-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        const h = document.createElement('div');
        h.id = 'ceb-panel-title';
        h.className = 'ceb-panel-title';
        h.textContent = title;
        panel.setAttribute('aria-labelledby', h.id);
        panel.appendChild(h);

        rows.forEach(([key, desc]) => {
            const row = document.createElement('div');
            row.className = 'ceb-panel-row';
            const k = document.createElement('kbd');
            k.textContent = key;
            const d = document.createElement('span');
            d.textContent = desc;
            row.appendChild(k);
            row.appendChild(d);
            panel.appendChild(row);
        });

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ceb-panel-close';
        close.textContent = 'Got it';
        const dismiss = () => {
            panel.remove();
            if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
                previousFocus.focus();
            }
        };
        panel._cebDismiss = dismiss;
        close.addEventListener('click', dismiss);
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                dismiss();
            } else if (event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                close.focus();
            }
        });
        panel.appendChild(close);

        document.body.appendChild(panel);
        close.focus();
    }

    async function maybeShowOnboarding() {
        try {
            const { onboarded } = await readStorage(['onboarded']);
            if (onboarded) return;
            writeStorage({ onboarded: true });
            showPanel('Quick start', [
                ['Hover', 'Highlights what you are about to change'],
                ['↑ / ↓', 'Grow or shrink the selection'],
                ['Elements', 'Click Blur, Hide or Redact'],
                ['Area', 'Drag a rectangle to blur or redact'],
                ['Annotate', 'Use Pen for freehand drawing'],
                ['Esc', 'Exit the current mode'],
                ['Advanced', 'Adds redaction, site rules and Steps']
            ]);
        } catch (e) {}
    }
    
    async function checkSavedChanges() {
        if (!toolbar) return;
        try {
            const key = storageKeyForUrl(window.location.href);
            const result = await readStorage([key]);
            const saved = migrateChanges(result[key], 'page');
            const total = saved.rules.length + saved.areas.length
                + saved.replacements.length + saved.annotations.length;

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
    
    // The swatch row belongs to the active tool: the marker's pastels and the line-work
    // palette are not interchangeable, so the row is rebuilt whenever the tool changes.
    function renderNoteSwatches() {
        if (!toolbar) return;
        const row = toolbar.querySelector('#ceb-note-colors');
        if (!row) return;

        const tool = annotationControlKind();
        const palette = paletteFor(tool);
        if (row.dataset.palette === palette.join(',')) return;
        row.dataset.palette = palette.join(',');
        row.textContent = '';

        palette.forEach(hex => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'ceb-note-swatch';
            swatch.dataset.noteColor = hex;
            swatch.style.background = hex;
            swatch.title = annotationColorName(hex);
            swatch.setAttribute('aria-label', `Use ${annotationColorName(hex)}`);
            swatch.addEventListener('click', () => {
                const selected = selectedAnnotation();
                const kind = selected?.kind || activeTool();
                const color = safeColor(hex, paletteFor(kind)[0]);
                if (kind === 'marker') {
                    settings.annotateMarkerColor = safeColor(hex, MARKER_PALETTE[0]);
                    writeStorage({ annotateMarkerColor: settings.annotateMarkerColor });
                } else {
                    settings.annotateColor = safeColor(hex);
                    writeStorage({ annotateColor: settings.annotateColor });
                }
                if (selected && selected.color !== color) {
                    selected.color = color;
                    commit('Annotation color changed');
                    return;
                }
                updateToolbarState();
            });
            row.appendChild(swatch);
        });
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
            collapseBtn.setAttribute('aria-expanded', String(!isToolbarCollapsed));
            collapseBtn.setAttribute('aria-label', isToolbarCollapsed ? 'Expand toolbar' : 'Collapse toolbar');
            collapseBtn.querySelector('polyline')?.setAttribute(
                'points',
                isToolbarCollapsed ? '18 15 12 9 6 15' : '6 9 12 15 18 9'
            );
        }
        requestAnimationFrame(() => {
            if (toolbar) clampToolbarPosition(toolbar);
        });
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
        
        // Save preference
        writeStorage({ toolbarClosed: true });
        updateModeIndicator(currentModeId);
    }
    
    function clampToolbarPosition(element) {
        if (!element || !element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const left = Math.min(maxLeft, Math.max(0, rect.left));
        const top = Math.min(maxTop, Math.max(0, rect.top));
        element.style.left = `${left}px`;
        element.style.right = 'auto';
        element.style.top = `${top}px`;
        element.style.transform = 'none';
    }

    function makeDraggable(element, handle, signal) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button, input')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
        }, { signal });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const rect = element.getBoundingClientRect();
            const maxLeft = Math.max(0, window.innerWidth - rect.width);
            const maxTop = Math.max(0, window.innerHeight - rect.height);
            element.style.left = `${Math.min(maxLeft, Math.max(0, startLeft + deltaX))}px`;
            element.style.right = 'auto';
            element.style.top = `${Math.min(maxTop, Math.max(0, startTop + deltaY))}px`;
        }, { signal });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        }, { signal });
        window.addEventListener('resize', () => clampToolbarPosition(element), { signal });
    }
