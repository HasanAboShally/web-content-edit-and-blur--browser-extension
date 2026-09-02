// Page event dispatch and the single idempotent bootstrap. Loaded last.

    function handlePickerMouseOver(event) {
        if (!isPickerMode(currentModeId)) return;
        if (isExtensionUi(event.target)) return;

        const target = event.target;
        if (target === document.body || target === document.documentElement) return;
        if (isOwnOverlay(target)) return;

        setPickerBase(target);
    }

    function handlePickerMouseOut(event) {
        if (!isPickerMode(currentModeId)) return;
        if (event.relatedTarget) return;
        clearPicker();
    }

    // The overlay is viewport-positioned, so it has to follow scroll and resize.
    function syncViewportOverlays() {
        if (pickerTarget) drawPickerOverlay();
        if (selectedPrivacy) syncPrivacySelection();
    }

    function handlePageMessage(message, sender, sendResponse) {
        if (typeof message === 'string') {
            // Legacy support
            modeChanged(message);
        } else if (message.action === 'setMode') {
            modeChanged(message.mode);
        } else if (message.action === 'toggleToolbar') {
            toggleToolbarVisibility();
        } else if (message.action === 'showToolbar') {
            writeStorage({ toolbarClosed: false });
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
    }

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

    function isFormControl(target) {
        return Boolean(target && typeof target.matches === 'function'
            && target.matches('input, textarea, select, [contenteditable="true"]'));
    }

    function nudgeSelectedAnnotation(dx, dy) {
        const note = selectedAnnotation();
        if (!note) return false;
        note.points = note.points.map(p => [p[0] + dx, p[1] + dy]);
        // One key press is one reversible move. No toast: key repeat would create a wall
        // of notifications while the user is simply positioning an object.
        commit();
        return true;
    }

    function nudgeSelectedArea(dx, dy) {
        const selection = selectedPrivacyItem();
        if (!selection || selection.type !== 'area') return false;
        selection.item.x += dx;
        selection.item.y += dy;
        commit();
        return true;
    }

    function handlePageKeydown(event) {
        const selected = currentModeId === 'annotate' ? selectedAnnotation() : null;
        const privacySelection = selectedPrivacyItem();
        if (areaDrag && event.key === 'Escape') {
            event.preventDefault();
            cancelAreaDrag();
            syncPrivacySelection();
            return;
        }
        if (privacySelection && event.key === 'Escape') {
            event.preventDefault();
            clearPrivacySelection();
            return;
        }
        if (privacySelection && !isFormControl(event.target)
            && (event.key === 'Delete' || event.key === 'Backspace')) {
            event.preventDefault();
            removeSelectedPrivacy();
            return;
        }
        if (privacySelection?.type === 'area' && !isFormControl(event.target)
            && !event.altKey && !event.ctrlKey && !event.metaKey
            && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const distance = event.shiftKey ? 10 : 1;
            const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
            const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
            nudgeSelectedArea(dx, dy);
            return;
        }
        if (selected && !noteDrag && !noteDrawing && event.key === 'Escape') {
            event.preventDefault();
            selectAnnotation(null);
            return;
        }

        if (selected && !isFormControl(event.target)
            && (event.key === 'Delete' || event.key === 'Backspace')) {
            event.preventDefault();
            removeAnnotation(selected.id);
            return;
        }

        if (selected && !isFormControl(event.target) && !event.altKey && !event.ctrlKey && !event.metaKey
            && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const distance = event.shiftKey ? 10 : 1;
            const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
            const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
            nudgeSelectedAnnotation(dx, dy);
            return;
        }

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
    }

    // Extension chrome must never be selected, edited or blocked by an active page mode.
    // Keeping this list central also lets dialogs remain usable while a mode is active.
    function isExtensionUi(el) {
        return Boolean(el && typeof el.closest === 'function' &&
            el.closest('#ceb-toolbar, #ceb-panel, #ceb-toast, #ceb-mode-badge, '
                + '#ceb-text-editor, #ceb-picker-hud, #ceb-picker-outline'));
    }

    function handlePageClick(event) {
        // Extension controls stay interactive in every mode.
        if (isExtensionUi(event.target)) return;

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
    }

    function installModeChangedToolbarHook() {
        const originalModeChanged = modeChanged;
        const wrappedModeChanged = function(newModeId) {
            originalModeChanged(newModeId);
            
            // Show toolbar if mode is not idle and user hasn't closed it
            if (newModeId !== 'idle' && isTopFrame) {
                readStorage(['toolbarClosed'], null).then(result => {
                    if (result && !result.toolbarClosed) {
                        createToolbar();
                    }
                });
            }
            
            updateToolbarState();
        };
        modeChanged = wrappedModeChanged;
        return () => {
            if (modeChanged === wrappedModeChanged) modeChanged = originalModeChanged;
        };
    }

    function bootstrapPage() {
        if (window.__cebInitialized) return;
        window.__cebInitialized = 'initializing';

        const listeners = new AbortController();
        const signal = listeners.signal;
        let routeTimer = null;
        let storageListenerInstalled = false;
        let runtimeListenerInstalled = false;
        let restoreModeChanged = null;

        try {
            initImageLoader();
            restoreModeChanged = installModeChangedToolbarHook();

            // Register every long-lived side effect here, after all declarations load.
            window.addEventListener('popstate', handleRouteChange, { signal });
            window.addEventListener('hashchange', handleRouteChange, { signal });
            document.addEventListener('mouseover', handlePickerMouseOver, { signal });
            document.addEventListener('mouseout', handlePickerMouseOut, { signal });
            window.addEventListener('scroll', syncViewportOverlays, { passive: true, signal });
            window.addEventListener('resize', syncViewportOverlays, { signal });
            document.addEventListener('keydown', handlePageKeydown, { signal });
            document.addEventListener('click', handlePageClick, { capture: true, signal });
            routeTimer = setInterval(checkForRouteChange, 400);

            try {
                chrome.storage.onChanged.addListener(handleStorageChanged);
                storageListenerInstalled = true;
            } catch (e) {
                // Cross-tab sync is optional if the extension context disappeared.
            }

            // Register the probe listener last. Once the worker can see this frame, all
            // synchronous setup has succeeded and duplicate injection is safe to skip.
            chrome.runtime.onMessage.addListener(handlePageMessage);
            runtimeListenerInstalled = true;
            window.__cebInitialized = true;

            // Restore last so every listener is ready for messages racing the async read.
            restoreFromStorage();
        } catch (error) {
            listeners.abort();
            if (routeTimer !== null) clearInterval(routeTimer);
            if (storageListenerInstalled) {
                try { chrome.storage.onChanged.removeListener(handleStorageChanged); } catch (e) {}
            }
            if (runtimeListenerInstalled) {
                try { chrome.runtime.onMessage.removeListener(handlePageMessage); } catch (e) {}
            }
            if (restoreModeChanged) restoreModeChanged();
            delete window.__cebInitialized;
            throw error;
        }
    }

    bootstrapPage();
