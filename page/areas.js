// Rectangular privacy-area model, rendering, and interactions.

    const AREA_DRAG_THRESHOLD = 4;

    function areaAt(point) {
        for (let i = state.areas.length - 1; i >= 0; i -= 1) {
            const area = state.areas[i];
            if (point[0] >= area.x && point[0] <= area.x + area.width
                && point[1] >= area.y && point[1] <= area.y + area.height) return area;
        }
        return null;
    }

    function refreshArea(area) {
        const existing = findAreaElement(area.id);
        const anchor = existing ? existing.nextSibling : null;
        if (existing) existing.remove();
        const rendered = renderArea(area);
        if (rendered && anchor && anchor.parentNode === document.body) {
            document.body.insertBefore(rendered, anchor);
        }
        return rendered;
    }

    function cancelAreaDrag() {
        const drag = areaDrag;
        areaDrag = null;
        if (!drag || !drag.moved) return;
        const area = state.areas.find(item => item.id === drag.id);
        if (!area) return;
        Object.assign(area, drag.from);
        refreshArea(area);
        syncPrivacySelection();
    }

    function updateAreaHover(point) {
        if (!drawOverlay || isDrawing || areaDrag) return;
        const selected = selectedPrivacyItem();
        const selectedArea = selected?.type === 'area' ? selected.item : null;
        const handle = areaHandleAt(selectedArea, point);
        const hovered = areaAt(point);
        drawOverlay.style.cursor = handle
            ? (handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize')
            : hovered ? 'move' : 'crosshair';
    }

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
            z-index: 2147483644;
            cursor: crosshair;
        `;
        document.body.appendChild(drawOverlay);
        
        drawOverlay.addEventListener('mousedown', startDraw);
        drawOverlay.addEventListener('mousemove', updateDraw);
        drawOverlay.addEventListener('mouseup', endDraw);
        drawOverlay.addEventListener('mouseleave', endDraw);
    }
    
    function removeDrawOverlay() {
        cancelAreaDrag();
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
        if (e.button !== 0) return;
        e.preventDefault();

        const point = docPoint(e);
        const selected = selectedPrivacyItem();
        const selectedArea = selected?.type === 'area' ? selected.item : null;
        const selectedHandle = areaHandleAt(selectedArea, point);
        const hit = selectedHandle ? selectedArea : areaAt(point);
        if (hit) {
            selectPrivacy('area', hit.id);
            areaDrag = {
                id: hit.id,
                mode: selectedHandle ? 'resize' : 'move',
                corner: selectedHandle,
                origin: point,
                from: { x: hit.x, y: hit.y, width: hit.width, height: hit.height },
                moved: false
            };
            clearPrivacyHandles();
            return;
        }

        clearPrivacySelection();
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
            z-index: 2147483645;
            pointer-events: none;
        `;
        document.body.appendChild(drawRect);
    }
    
    function updateDraw(e) {
        const point = docPoint(e);
        if (areaDrag) {
            const area = state.areas.find(item => item.id === areaDrag.id);
            if (!area) {
                areaDrag = null;
                return;
            }
            const dx = point[0] - areaDrag.origin[0];
            const dy = point[1] - areaDrag.origin[1];
            if (Math.hypot(dx, dy) > AREA_DRAG_THRESHOLD) areaDrag.moved = true;
            if (!areaDrag.moved) return;

            if (areaDrag.mode === 'move') {
                area.x = areaDrag.from.x + dx;
                area.y = areaDrag.from.y + dy;
            } else {
                Object.assign(area, resizedArea(areaDrag.from, areaDrag.corner, point));
            }
            refreshArea(area);
            return;
        }

        if (!isDrawing) {
            updateAreaHover(point);
            return;
        }
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
        if (areaDrag) {
            const drag = areaDrag;
            areaDrag = null;
            const area = state.areas.find(item => item.id === drag.id);
            if (!area) return;
            if (drag.moved) {
                commit(drag.mode === 'move' ? 'Area moved' : 'Area resized');
            } else {
                selectPrivacy('area', area.id);
            }
            return;
        }

        if (!isDrawing) return;
        isDrawing = false;
        
        const x = Math.min(e.clientX, drawStartX);
        const y = Math.min(e.clientY, drawStartY);
        const width = Math.abs(e.clientX - drawStartX);
        const height = Math.abs(e.clientY - drawStartY);
        
        if (width > 10 && height > 10) {
            // Store in document coordinates so the area stays anchored to the content
            // it covers rather than to the viewport.
            const area = {
                id: newId('a'),
                kind: settings.drawKind === 'redact' ? 'redact' : 'blur',
                x: x + window.scrollX,
                y: y + window.scrollY,
                width,
                height,
                level: safeBlurLevel(settings.blurStrength),
                scope: 'page'
            };
            state.areas.push(area);
            selectedPrivacy = { type: 'area', id: area.id };
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

        const blurValue = BLUR_LEVELS[safeBlurLevel(area.level, 2)];
        const fill = area.kind === 'redact'
            ? 'background: #000;'
            : `backdrop-filter: blur(${blurValue}); -webkit-backdrop-filter: blur(${blurValue}); background: rgba(128, 128, 128, 0.3);`;

        el.style.cssText = `
            position: absolute;
            left: ${area.x}px;
            top: ${area.y}px;
            width: ${area.width}px;
            height: ${area.height}px;
            ${fill}
            z-index: 2147483640;
            border-radius: ${area.kind === 'redact' ? '2px' : '4px'};
            pointer-events: none;
        `;
        
        document.body.appendChild(el);
        return el;
    }

    function findAreaElement(id) {
        return Array.from(document.querySelectorAll('.ceb-blur-area'))
            .find(el => el.dataset.cebAreaId === id) || null;
    }

    function removeArea(id) {
        if (selectedPrivacy?.type === 'area' && selectedPrivacy.id === id) clearPrivacySelection(false);
        state.areas = state.areas.filter(a => a.id !== id);
        commit('Area removed');
    }

    function clearRenderedAreas() {
        document.querySelectorAll('.ceb-blur-area').forEach(el => el.remove());
    }
