// Annotation geometry, rendering, and hit testing.

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Step badges are numbered by their position among the other badges rather than
    // carrying a stored number. Deleting badge 2 renumbers the rest instead of leaving
    // a gap, and undo restores the sequence for free.
    function stepNumberOf(a) {
        const steps = state.annotations.filter(x => x.kind === 'step');
        const index = steps.findIndex(x => x.id === a.id);
        return index === -1 ? steps.length + 1 : index + 1;
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
        } else if (a.kind === 'marker') {
            const el = common(document.createElementNS(SVG_NS, 'path'));
            el.setAttribute('d', penPath(pts));
            // Flat caps read as a chisel tip; round ones would give the stroke the
            // lozenge ends of a felt pen. The wrapper supplies the multiply blend that
            // makes this behave like ink rather than paint — see renderAnnotation.
            el.setAttribute('stroke-linecap', 'butt');
            svg.appendChild(el);
        } else if (a.kind === 'step') {
            const r = a.size;
            const cx = pts[0][0];
            const cy = pts[0][1];
            const disc = document.createElementNS(SVG_NS, 'circle');
            disc.setAttribute('cx', String(cx));
            disc.setAttribute('cy', String(cy));
            disc.setAttribute('r', String(r));
            disc.setAttribute('fill', a.color);
            disc.setAttribute('stroke', '#ffffff');
            disc.setAttribute('stroke-width', '2');
            svg.appendChild(disc);

            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', String(cx));
            label.setAttribute('y', String(cy));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'central');
            label.setAttribute('fill', '#ffffff');
            label.setAttribute('font-size', String(Math.round(r * 1.15)));
            label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            label.setAttribute('font-weight', '700');
            label.textContent = String(stepNumberOf(a));
            svg.appendChild(label);
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

        // Annotations are never hit-testable. They sit above the page, so leaving them
        // clickable meant a mark laid over a link swallowed the click — and, because the
        // handler used to be "click to remove", silently deleted itself instead of
        // following the link. All interaction now goes through the annotate overlay,
        // which hit-tests against the geometry, so marks only respond in Annotate mode.
        const shared = `
            position: absolute;
            left: ${bounds.x}px;
            top: ${bounds.y}px;
            z-index: 2147483641;
            pointer-events: none;
        `;

        if (a.kind === 'text') {
            el.textContent = a.text;
            el.style.cssText = shared + `
                width: ${a.boxW}px;
                color: ${a.color};
                font: 600 ${a.size}px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                white-space: pre-wrap;
                overflow-wrap: break-word;
                padding: 2px 4px;
                text-shadow: 0 1px 2px rgba(255,255,255,.85), 0 -1px 2px rgba(255,255,255,.85),
                             1px 0 2px rgba(255,255,255,.85), -1px 0 2px rgba(255,255,255,.85);
            `;
        } else {
            el.style.cssText = shared + `
                width: ${bounds.width}px;
                height: ${bounds.height}px;
            `;
            // What makes a highlighter a highlighter. Plain alpha over black text washes
            // it out to grey; multiply is how real ink behaves — yellow over white gives
            // yellow, yellow over black text stays black, so the words stay readable.
            if (a.kind === 'marker') el.style.mixBlendMode = 'multiply';
            el.appendChild(buildAnnotationShape(a, bounds));
        }

        document.body.appendChild(el);
        return el;
    }

    function removeAnnotation(id) {
        if (selectedNoteId === id) selectedNoteId = null;
        clearHandles();
        state.annotations = state.annotations.filter(a => a.id !== id);
        commit('Annotation removed');
    }

    function clearRenderedAnnotations() {
        document.querySelectorAll('.ceb-annotation').forEach(el => el.remove());
    }

    // ---------- Hit testing ----------
    //
    // Every kind is reduced to a polyline (or a filled box) so one distance test covers
    // all of them. Testing against the ink rather than the bounding box is what lets you
    // draw inside a circle you have already drawn — a box test would treat that whole
    // hollow middle as "on the ellipse" and start a move instead.

    const DRAG_THRESHOLD = 4;     // below this a drag is really a click

    // Text and step badges are solid objects, so anywhere inside them counts. Everything
    // else is a line, so only the neighbourhood of the stroke does.
    function touchesAnnotation(a, point) {
        if (a.kind === 'text') return touchesTextAnnotation(a, point);
        if (ANCHORED_KINDS.includes(a.kind)) {
            const b = annotationBounds(a);
            return point[0] >= b.x - HIT_SLOP && point[0] <= b.x + b.width + HIT_SLOP
                && point[1] >= b.y - HIT_SLOP && point[1] <= b.y + b.height + HIT_SLOP;
        }
        const outline = annotationOutline(a);
        // Half the stroke width, so a fat marker is grabbable across its whole band.
        const slop = HIT_SLOP + a.size / 2;
        for (let i = 0; i < outline.length - 1; i += 1) {
            if (distanceToSegment(point, outline[i], outline[i + 1]) <= slop) return true;
        }
        return outline.length === 1
            && Math.hypot(point[0] - outline[0][0], point[1] - outline[0][1]) <= slop;
    }

    // A note is grabbable where its words are, not across the width of the box they wrap
    // in. annotationBounds reports boxW — a fixed default regardless of how much was
    // typed — so measuring that instead let a two-character note claim a wide strip of
    // blank page and swallow drags that started nowhere near anything visible. Measuring
    // the laid-out line boxes also fixes the reverse: a wrapped note used to be grabbable
    // only on its first line, because the height was assumed to be a single line.
    function touchesTextAnnotation(a, point) {
        const lines = textLineRects(a.id);
        if (lines) {
            return lines.some(r => point[0] >= r.x - HIT_SLOP && point[0] <= r.x + r.width + HIT_SLOP
                && point[1] >= r.y - HIT_SLOP && point[1] <= r.y + r.height + HIT_SLOP);
        }
        // Not rendered yet, so fall back to the declared box.
        const b = annotationBounds(a);
        const height = Math.max(a.size * 1.35, 16);
        return point[0] >= b.x - HIT_SLOP && point[0] <= b.x + b.width + HIT_SLOP
            && point[1] >= b.y - HIT_SLOP && point[1] <= b.y + height + HIT_SLOP;
    }

    // One rect per line box of the rendered note, in document space.
    function textLineRects(id) {
        const el = annotationElement(id);
        if (!el || !el.firstChild) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects());
        if (!rects.length) return null;
        return rects.map(r => ({
            x: r.left + window.scrollX,
            y: r.top + window.scrollY,
            width: r.width,
            height: r.height
        }));
    }

    function annotationElement(id) {
        return Array.from(document.querySelectorAll('.ceb-annotation'))
            .find(el => el.dataset.cebNoteId === id) || null;
    }

    // Topmost first: later annotations are painted over earlier ones, so they win.
    function annotationAt(point) {
        for (let i = state.annotations.length - 1; i >= 0; i -= 1) {
            if (touchesAnnotation(state.annotations[i], point)) return state.annotations[i];
        }
        return null;
    }

