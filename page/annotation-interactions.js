// Annotation creation, editing, selection, dragging, and resizing.

    let annotateOverlay = null;
    let noteDrawing = false;
    let notePreview = null;
    let noteStart = null;        // document coords of the gesture's origin
    let notePoints = [];         // pen only
    let noteMinGap = PEN_MIN_GAP; // grows as a stroke gets long, to bound its cost
    let noteDrag = null;         // in-flight move/resize of an existing annotation
    let textEditor = null;       // live contenteditable box, if any
    let selectedNoteId = null;   // contextual editing selection; never persisted

    function isAnnotateTool(kind) {
        return ANNOTATION_KINDS.includes(kind);
    }

    function activeTool() {
        return isAnnotateTool(settings.annotateTool) ? settings.annotateTool : 'arrow';
    }

    function selectedAnnotation() {
        if (!selectedNoteId) return null;
        const note = state.annotations.find(a => a.id === selectedNoteId) || null;
        if (!note) selectedNoteId = null;
        return note;
    }

    function annotationControlKind() {
        return selectedAnnotation()?.kind || activeTool();
    }

    function annotationName(note) {
        const label = ANNOTATION_LABELS[note?.kind] || note?.kind || 'annotation';
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    // The marker tracks its own colour: switching from a red arrow to the highlighter
    // should not hand you a red highlighter, which multiplies down to near black.
    function noteColor(kind) {
        return kind === 'marker'
            ? safeColor(settings.annotateMarkerColor, MARKER_PALETTE[0])
            : safeColor(settings.annotateColor, ANNOTATION_PALETTE[0]);
    }

    function noteSize(kind) {
        if (kind === 'text') return 16;
        if (kind === 'marker') return MARKER_SIZE;
        if (kind === 'step') return STEP_RADIUS;
        return safeNumber(
            settings.annotateSize,
            ANNOTATION_STROKE_MIN,
            ANNOTATION_STROKE_MAX,
            ANNOTATION_STROKE_DEFAULT
        );
    }

    // ---------- Handles ----------

    let noteHandles = null;
    let hoveredNoteId = null;

    function clearHandles() {
        if (noteHandles) {
            noteHandles.remove();
            noteHandles = null;
        }
        hoveredNoteId = null;
    }

    function drawHandles(a) {
        if (noteHandles) {
            noteHandles.remove();
            noteHandles = null;
        }
        const selected = a?.id === selectedNoteId;
        if (!a || (!selected && !TWO_POINT_KINDS.includes(a.kind))) return;

        noteHandles = document.createElement('div');
        noteHandles.id = 'ceb-note-handles';
        noteHandles.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;'
            + 'z-index:2147483645;pointer-events:none;';

        if (selected) {
            const bounds = annotationBounds(a);
            const outline = document.createElement('div');
            outline.className = 'ceb-note-selection-outline';
            outline.style.cssText = `
                position: absolute;
                left: ${bounds.x - 2}px;
                top: ${bounds.y - 2}px;
                width: ${Math.max(4, bounds.width + 4)}px;
                height: ${Math.max(4, bounds.height + 4)}px;
                box-sizing: border-box;
                border: 1px dashed #2563eb;
                border-radius: 5px;
                background: rgba(37,99,235,.035);
            `;
            noteHandles.appendChild(outline);
        }

        if (TWO_POINT_KINDS.includes(a.kind)) {
            a.points.slice(0, 2).forEach(p => {
                const dot = document.createElement('div');
                dot.className = 'ceb-note-handle';
                dot.style.cssText = `
                    position: absolute;
                    left: ${p[0] - HANDLE_RADIUS}px;
                    top: ${p[1] - HANDLE_RADIUS}px;
                    width: ${HANDLE_RADIUS * 2}px;
                    height: ${HANDLE_RADIUS * 2}px;
                    box-sizing: border-box;
                    border-radius: 50%;
                    background: #fff;
                    border: 2px solid #2563eb;
                    box-shadow: 0 1px 3px rgba(0,0,0,.4);
                `;
                noteHandles.appendChild(dot);
            });
        }
        document.body.appendChild(noteHandles);
    }

    function selectAnnotation(id) {
        selectedNoteId = state.annotations.some(a => a.id === id) ? id : null;
        clearHandles();
        const selected = selectedAnnotation();
        if (selected && currentModeId === 'annotate') {
            drawHandles(selected);
            hoveredNoteId = `selected:${selected.id}`;
        }
        updateToolbarState();
    }

    function syncAnnotationSelection() {
        const selected = selectedAnnotation();
        if (!selected || currentModeId !== 'annotate') {
            if (!selected) clearHandles();
            return;
        }
        drawHandles(selected);
        hoveredNoteId = `selected:${selected.id}`;
    }

    // Cursor and handles are the only hint that a mark can be grabbed, so they have to
    // track the pointer even when nothing is being dragged.
    function updateHoverAffordance(point) {
        if (!annotateOverlay) return;
        const hovered = annotationAt(point);
        const affordance = selectedAnnotation() || hovered;
        const key = affordance
            ? `${affordance.id === selectedNoteId ? 'selected' : 'hover'}:${affordance.id}`
            : null;
        if (key !== hoveredNoteId) {
            hoveredNoteId = key;
            drawHandles(affordance);
        }
        annotateOverlay.style.cursor = !hovered ? 'crosshair'
            : handleAt(hovered, point) !== -1 ? 'nwse-resize'
            : 'move';
    }

    // Repaints one annotation in place. renderState() rebuilds every rule on the page,
    // which is far too much work to do on each mousemove of a drag.
    function refreshAnnotation(a) {
        const existing = annotationElement(a.id);
        // renderAnnotation appends, so refreshing would bump the mark to the end of the
        // paint order — dragging one would silently restack it above its neighbours while
        // state.annotations, which hit testing walks to decide what is on top, kept the
        // original order. Putting it back keeps what you see and what you grab agreeing.
        const anchor = existing ? existing.nextSibling : null;
        if (existing) existing.remove();
        const el = renderAnnotation(a);
        if (el && anchor && anchor.parentNode === document.body) {
            document.body.insertBefore(el, anchor);
        }
        return el;
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
            z-index: 2147483644;
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
        cancelNoteDrag();
        selectedNoteId = null;
        if (annotateOverlay) {
            annotateOverlay.remove();
            annotateOverlay = null;
        }
        clearNotePreview();
        clearHandles();
        noteDrawing = false;
    }

    // Puts a half-finished drag back where it started and forgets it. Any path that ends a
    // gesture without reaching endNote lands here — Escape, a mode switch, the toolbar
    // being torn down — and Escape mid-drag is the universal "cancel this" gesture.
    // Without the revert the mark stays at its dragged position on screen but the move
    // never reaches history or storage, so state and history[historyIndex] disagree: the
    // next undo discards the move *and* eats the action before it, and a persisted mark
    // snaps back on reload.
    function cancelNoteDrag() {
        const drag = noteDrag;
        noteDrag = null;
        if (!drag || !drag.moved) return;
        const note = state.annotations.find(a => a.id === drag.id);
        if (!note) return;
        note.points = drag.from.map(p => p.slice());
        refreshAnnotation(note);
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
        const tool = activeTool();
        const draft = {
            id: 'preview', kind: tool, points,
            text: '', color: noteColor(tool),
            size: noteSize(tool), boxW: 220, persist: false, scope: 'page'
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
        if (tool === 'marker') notePreview.style.mixBlendMode = 'multiply';
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

        const point = docPoint(e);

        // Grabbing an existing mark takes priority over starting a new one, so a shape
        // that landed slightly off can be nudged into place rather than deleted and
        // redrawn. Only the ink is grabbable, so you can still draw inside a circle.
        const hovered = annotationAt(point);
        if (hovered) {
            selectedNoteId = hovered.id;
            updateToolbarState();
            const handle = handleAt(hovered, point);
            noteDrag = {
                mode: handle === -1 ? 'move' : 'resize',
                id: hovered.id,
                index: handle,
                origin: point,
                from: hovered.points.map(p => p.slice()),
                moved: false
            };
            clearHandles();
            return;
        }

        selectAnnotation(null);

        // Text and step badges are placed, not dragged.
        if (activeTool() === 'text') {
            createTextAnnotation(point);
            return;
        }
        if (activeTool() === 'step') {
            createStepAnnotation(point);
            return;
        }

        noteDrawing = true;
        noteStart = point;
        notePoints = [noteStart];
        noteMinGap = PEN_MIN_GAP;
    }

    function updateNote(e) {
        const point = docPoint(e);

        if (noteDrag) {
            const note = state.annotations.find(a => a.id === noteDrag.id);
            if (!note) {
                noteDrag = null;
                return;
            }
            const dx = point[0] - noteDrag.origin[0];
            const dy = point[1] - noteDrag.origin[1];
            // Distinguishes a drag from a click. Without a threshold, the tremor in a
            // normal click would register as a one-pixel move and burn a history entry.
            if (Math.hypot(dx, dy) > DRAG_THRESHOLD) noteDrag.moved = true;
            // Nothing shifts until the threshold is crossed. Applying the delta first meant
            // the tremor in an ordinary click nudged the mark by a pixel or two — a move
            // with no history entry and nothing written to storage behind it.
            if (!noteDrag.moved) return;

            if (noteDrag.mode === 'move') {
                note.points = noteDrag.from.map(p => [p[0] + dx, p[1] + dy]);
            } else {
                note.points = noteDrag.from.map(p => p.slice());
                note.points[noteDrag.index] = point;
            }
            refreshAnnotation(note);
            return;
        }

        if (!noteDrawing) {
            updateHoverAffordance(point);
            return;
        }

        if (FREEHAND_KINDS.includes(activeTool())) {
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
        if (noteDrag) {
            const drag = noteDrag;
            noteDrag = null;
            const note = state.annotations.find(a => a.id === drag.id);
            if (!note) return;

            if (drag.moved) {
                commit(drag.mode === 'move' ? 'Annotation moved' : 'Annotation resized');
                return;
            }
            // A stationary click on a resize handle does nothing. The cursor over a handle
            // promises a resize, and the handles sit right on the shape, so treating that
            // click as "remove" deleted the mark the user was reaching out to adjust.
            if (drag.mode !== 'move') {
                selectAnnotation(note.id);
                return;
            }
            if (note.kind === 'text') {
                // Deleting someone's typed note on a stray click would be hostile; the
                // worst a misclick can do here is open the editor.
                selectAnnotation(null);
                openTextEditor(note.id);
            } else {
                selectAnnotation(note.id);
            }
            return;
        }

        if (!noteDrawing) return;
        noteDrawing = false;
        clearNotePreview();

        const tool = activeTool();
        const points = FREEHAND_KINDS.includes(tool) ? notePoints.slice() : [noteStart, docPoint(e)];

        // Ignore a stray click that was not really a drag.
        const spanX = Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]));
        const spanY = Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
        if (Math.hypot(spanX, spanY) < 8) return;

        const note = pushAnnotation({ kind: tool, points });
        if (!note) return;
        selectedNoteId = note.id;
        commit(tool === 'arrow' ? 'Arrow added'
            : tool === 'ellipse' ? 'Circle added'
            : tool === 'rect' ? 'Box added'
            : tool === 'marker' ? 'Highlight added' : 'Drawing added');
    }

    function pushAnnotation(partial) {
        const note = sanitizeAnnotation({
            kind: partial.kind,
            points: partial.points,
            text: partial.text || '',
            color: noteColor(partial.kind),
            size: noteSize(partial.kind),
            boxW: 220,
            persist: settings.annotateKeep === true
        });
        if (note) state.annotations.push(note);
        return note;
    }

    function createStepAnnotation(point) {
        const note = pushAnnotation({ kind: 'step', points: [point] });
        if (!note) return;
        selectedNoteId = note.id;
        commit('Step added');
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
            z-index: 2147483645;
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
