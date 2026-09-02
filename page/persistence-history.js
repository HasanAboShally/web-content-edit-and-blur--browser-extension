// Persistence, SPA route partitioning, cross-tab sync, and snapshot history.

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
        selectedNoteId = null;
        clearHandles();
        cancelAreaDrag();
        clearPrivacySelection(false);
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

    function checkForRouteChange() {
        if (window.location.href !== currentHref) handleRouteChange();
    }

    async function loadPageScopeFor(url) {
        if (!isPersistableUrl(url)) return;
        try {
            const key = storageKeyForUrl(url);
            const stored = await readStorage(['persistEnabled', key]);
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
            const stored = await readStorage([
                'persistEnabled', 'uiMode', 'defaultScope', 'blurStrength', 'drawKind',
                'annotateTool', 'annotateColor', 'annotateMarkerColor', 'annotateKeep',
                'annotateSize',
                storageKeyForUrl(window.location.href),
                siteKeyForUrl(window.location.href)
            ]);

            // Migrate the old Simple/Pro names without changing anyone's saved choice.
            settings.uiMode = stored.uiMode === 'advanced' || stored.uiMode === 'pro'
                ? 'advanced' : 'essentials';
            if (stored.uiMode === 'simple' || stored.uiMode === 'pro') {
                writeStorage({ uiMode: settings.uiMode });
            }
            settings.persistEnabled = stored.persistEnabled !== false;
            settings.defaultScope = stored.defaultScope === 'site' ? 'site' : 'page';
            settings.blurStrength = safeBlurLevel(stored.blurStrength);
            settings.drawKind = stored.drawKind === 'redact' ? 'redact' : 'blur';
            settings.annotateTool = ANNOTATION_KINDS.includes(stored.annotateTool)
                ? stored.annotateTool : 'arrow';
            settings.annotateColor = safeColor(stored.annotateColor);
            settings.annotateMarkerColor = safeColor(stored.annotateMarkerColor, MARKER_PALETTE[0]);
            settings.annotateKeep = stored.annotateKeep === true;
            settings.annotateSize = safeNumber(
                stored.annotateSize,
                ANNOTATION_STROKE_MIN,
                ANNOTATION_STROKE_MAX,
                ANNOTATION_STROKE_DEFAULT
            );
            // Site-wide creation is intentionally an Advanced decision. Never retain an
            // invisible site scope when restoring the Essentials view.
            if (settings.uiMode === 'essentials') {
                settings.defaultScope = 'page';
                if (stored.defaultScope === 'site') writeStorage({ defaultScope: 'page' });
                if (settings.drawKind === 'redact') {
                    settings.drawKind = 'blur';
                    writeStorage({ drawKind: 'blur' });
                }
                if (ADVANCED_ANNOTATE_TOOLS.includes(settings.annotateTool)) {
                    settings.annotateTool = 'arrow';
                    writeStorage({ annotateTool: 'arrow' });
                }
            }

            if (!settings.persistEnabled) {
                updateToolbarState();
                return;
            }
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

    function handleStorageChanged(changes, area) {
        if (area !== 'local' || !siteScopeLoaded) return;
        const key = siteKeyForUrl(window.location.href);
        if (!(key in changes)) return;
        const incoming = migrateChanges(changes[key].newValue, 'site');
        if (scopeSignature(incoming) === scopeSignature(serializeScope('site'))) return;
        adoptSiteScope(incoming);
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
        // A text note exists in state from the moment it is placed, before a character is
        // typed — finishTextEditing is what decides whether it becomes real or is dropped.
        // Anything that commits while an editor is still open would otherwise bake that
        // empty, invisible note into the snapshot, so undo would resurrect it and state
        // and history would disagree about what is on the page.
        history = history.slice(0, historyIndex + 1);
        history.push(cloneState(withoutEmptyNotes(state)));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;

        renderState();
        saveChanges();
        if (label) showToast(label, true);
        updateToolbarState();
    }

    function withoutEmptyNotes(s) {
        return { ...s, annotations: (s.annotations || []).filter(a => a.kind !== 'text' || a.text !== '') };
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
