// Derived toolbar state. Loaded after toolbar-controller.js because it uses its lifecycle.

    function updateToolbarState() {
        if (!toolbar) return;

        toolbar.setAttribute('data-ui', settings.uiMode);
        const privacySelection = selectedPrivacyItem();

        toolbar.querySelectorAll('.ceb-tb-btn[data-mode]').forEach(btn => {
            const areaEffectActive = currentModeId === 'draw'
                && (btn.dataset.mode === 'blur' || btn.dataset.mode === 'redact')
                && btn.dataset.mode === settings.drawKind;
            const selectionEffectActive = privacySelection
                && btn.dataset.mode === privacySelection.item.kind;
            const active = selectionEffectActive || btn.dataset.mode === currentModeId || areaEffectActive;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });

        toolbar.querySelectorAll('#ceb-scope-seg .ceb-seg-btn').forEach(btn => {
            const scope = privacySelection?.type === 'rule'
                ? privacySelection.item.scope : settings.defaultScope;
            const active = btn.dataset.scope === scope;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        toolbar.querySelectorAll('#ceb-target-seg .ceb-seg-btn').forEach(btn => {
            const target = privacySelection?.type || (currentModeId === 'draw' ? 'area' : 'rule');
            const active = btn.dataset.target === (target === 'area' ? 'area' : 'element');
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        const privacySelectionPanel = toolbar.querySelector('#ceb-privacy-selection');
        const privacySelectionStatus = toolbar.querySelector('#ceb-privacy-selection-status');
        if (privacySelectionPanel) privacySelectionPanel.hidden = !privacySelection;
        if (privacySelectionStatus) {
            privacySelectionStatus.textContent = privacySelectionLabel(privacySelection);
        }

        // The annotation tools take up real space, so they only appear while the mode is
        // active rather than sitting there permanently.
        const noteTools = toolbar.querySelector('#ceb-annotate-tools');
        if (noteTools) noteTools.hidden = currentModeId !== 'annotate';
        const scopeTools = toolbar.querySelector('#ceb-scope-tools');
        const scopeLabel = toolbar.querySelector('#ceb-scope-label');
        const privacyTarget = toolbar.querySelector('#ceb-privacy-target');
        const blurStrength = toolbar.querySelector('#ceb-blur-strength');
        const blurStrengthLabel = toolbar.querySelector('#ceb-blur-strength-label');
        const scopedMode = ['edit', 'blur', 'hide', 'redact'].includes(currentModeId);
        const targetedPrivacyMode = ['blur', 'redact', 'draw'].includes(currentModeId);
        const effectivePrivacyKind = privacySelection?.item.kind
            || (currentModeId === 'draw' ? settings.drawKind : currentModeId);
        if (scopeTools) scopeTools.hidden = !scopedMode;
        if (scopeLabel) scopeLabel.textContent = privacySelection?.type === 'rule'
            ? 'Apply selected effect to' : 'Apply new rules to';
        if (privacyTarget) privacyTarget.hidden = !targetedPrivacyMode;
        if (blurStrength) blurStrength.hidden = effectivePrivacyKind !== 'blur';
        if (blurStrengthLabel) {
            blurStrengthLabel.textContent = privacySelection ? 'Strength' : 'New blur strength';
        }
        const activeBlurLevel = privacySelection?.item.kind === 'blur'
            ? safeBlurLevel(privacySelection.item.level, privacySelection.type === 'area' ? 2 : 1)
            : safeBlurLevel(settings.blurStrength);
        toolbar.querySelectorAll('#ceb-blur-strength-seg .ceb-seg-btn').forEach(btn => {
            const active = Number(btn.dataset.blurLevel) === activeBlurLevel;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });

        const selected = selectedAnnotation();
        toolbar.querySelectorAll('.ceb-note-tool').forEach(btn => {
            const active = !selected && btn.dataset.noteTool === settings.annotateTool;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        const selection = toolbar.querySelector('#ceb-note-selection');
        const selectionStatus = toolbar.querySelector('#ceb-note-selection-status');
        if (selection) selection.hidden = !selected;
        if (selectionStatus) selectionStatus.textContent = selected ? `${annotationName(selected)} selected` : '';
        renderNoteSwatches();
        const activeNoteColor = selected?.color || noteColor(activeTool());
        toolbar.querySelectorAll('.ceb-note-swatch').forEach(btn => {
            const active = btn.dataset.noteColor === activeNoteColor;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        const noteWidth = toolbar.querySelector('#ceb-note-width');
        const noteWidthInput = toolbar.querySelector('#ceb-note-width-input');
        const noteWidthValue = toolbar.querySelector('#ceb-note-width-value');
        const noteWidthSample = toolbar.querySelector('.ceb-note-width-sample');
        const hasWidth = STROKE_KINDS.includes(annotationControlKind());
        const width = selected && STROKE_KINDS.includes(selected.kind)
            ? selected.size : settings.annotateSize;
        if (noteWidth) noteWidth.hidden = !hasWidth;
        if (noteWidthInput) noteWidthInput.value = String(width);
        if (noteWidthValue) noteWidthValue.textContent = `${width} px`;
        if (noteWidthSample) noteWidthSample.style.setProperty('--ceb-note-width', `${width}px`);
        const keepBtn = toolbar.querySelector('#ceb-btn-note-keep');
        if (keepBtn) {
            const remembered = settings.persistEnabled && settings.annotateKeep;
            keepBtn.classList.toggle('active', remembered);
            keepBtn.setAttribute('aria-pressed', String(remembered));
            keepBtn.textContent = remembered ? 'Annotations remembered' : 'Save annotations too';
        }
        toolbar.querySelectorAll('#ceb-ui-seg .ceb-seg-btn').forEach(btn => {
            const active = btn.dataset.ui === settings.uiMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });

        const undoBtn = toolbar.querySelector('#ceb-btn-undo');
        const redoBtn = toolbar.querySelector('#ceb-btn-redo');
        if (undoBtn) undoBtn.disabled = !canUndo();
        if (redoBtn) redoBtn.disabled = !canRedo();
        const persistToggle = toolbar.querySelector('#ceb-persist-toggle');
        if (persistToggle) persistToggle.checked = settings.persistEnabled;

        const indicator = toolbar.querySelector('#ceb-mode-indicator');
        if (indicator) {
            const hints = {
                'edit': 'Click any text to edit • Alt+R to replace',
                'blur': privacySelection
                    ? 'Choose strength or effect • Remove clears it'
                    : 'Click an element to blur • strength is set above',
                'hide': privacySelection
                    ? 'Choose another effect or Remove to restore it'
                    : 'Click an element to hide it',
                'redact': privacySelection
                    ? 'Choose another effect or Remove to restore it'
                    : 'Click an element to redact all of it • follows the element',
                'draw': settings.drawKind === 'redact'
                    ? (privacySelection ? 'Drag to move • handles resize • Remove clears it'
                        : 'Drag a rectangle to redact an area • freehand is Annotate › Pen')
                    : (privacySelection ? 'Choose strength • drag to move • handles resize'
                        : 'Drag a rectangle to blur an area • freehand is Annotate › Pen'),
                'annotate': selected
                    ? 'Edit properties • arrow keys move • Delete removes'
                    : 'Drag to draw • click a mark to select • drag to move'
            };
            if (currentModeId !== 'idle' && hints[currentModeId]) {
                indicator.textContent = hints[currentModeId];
                indicator.classList.add('visible');
            } else {
                indicator.classList.remove('visible');
            }
        }
        requestAnimationFrame(() => {
            if (toolbar) clampToolbarPosition(toolbar);
        });
    }
