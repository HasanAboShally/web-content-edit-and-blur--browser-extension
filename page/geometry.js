// Pure annotation and privacy-area geometry.

    const AREA_MIN_SIZE = 12;
    const AREA_HANDLE_HIT = 11;
    const HIT_SLOP = 8;
    const HANDLE_RADIUS = 6;

    // Stroke is centred on the path, and the arrowhead overhangs the line, so the drawing
    // surface needs to be bigger than the raw geometry or the edges get clipped.
    /**
     * @param {Annotation} annotation
     * @returns {number}
     */
    function annotationPadding(annotation) {
        return annotation.kind === 'arrow' ? annotation.size * 3 + 4 : annotation.size + 4;
    }

    /**
     * @param {Annotation} annotation
     * @returns {Bounds}
     */
    function annotationBounds(annotation) {
        const xs = annotation.points.map(point => point[0]);
        const ys = annotation.points.map(point => point[1]);
        if (annotation.kind === 'text') {
            return { x: xs[0], y: ys[0], width: annotation.boxW, height: 0 };
        }
        if (annotation.kind === 'step') {
            // The point is the badge's centre, not a corner, so it lands under the
            // cursor that placed it.
            const radius = annotation.size + 2;
            return {
                x: xs[0] - radius,
                y: ys[0] - radius,
                width: radius * 2,
                height: radius * 2
            };
        }
        const padding = annotationPadding(annotation);
        return {
            x: Math.min(...xs) - padding,
            y: Math.min(...ys) - padding,
            width: (Math.max(...xs) - Math.min(...xs)) + padding * 2,
            height: (Math.max(...ys) - Math.min(...ys)) + padding * 2
        };
    }

    // A mouse-drawn polyline is visibly jagged. Emitting a quadratic curve through the
    // midpoint of each segment rounds the corners off at almost no cost, which is the
    // difference between a stroke that looks deliberate and one that looks like a wobble.
    /**
     * @param {Point[]} points
     * @returns {string}
     */
    function penPath(points) {
        if (points.length < 3) {
            return points.map((point, index) => `${index ? 'L' : 'M'}${point[0]},${point[1]}`).join(' ');
        }
        let path = `M${points[0][0]},${points[0][1]}`;
        for (let index = 1; index < points.length - 1; index += 1) {
            const midX = (points[index][0] + points[index + 1][0]) / 2;
            const midY = (points[index][1] + points[index + 1][1]) / 2;
            path += ` Q${points[index][0]},${points[index][1]} ${midX},${midY}`;
        }
        const last = points[points.length - 1];
        return `${path} L${last[0]},${last[1]}`;
    }

    // Samples an annotation's outline in document coordinates.
    /**
     * @param {Annotation} annotation
     * @returns {Point[]}
     */
    function annotationOutline(annotation) {
        const points = annotation.points;
        if (annotation.kind === 'ellipse') {
            const centerX = (points[0][0] + points[1][0]) / 2;
            const centerY = (points[0][1] + points[1][1]) / 2;
            const radiusX = Math.abs(points[1][0] - points[0][0]) / 2;
            const radiusY = Math.abs(points[1][1] - points[0][1]) / 2;
            /** @type {Point[]} */
            const outline = [];
            for (let index = 0; index <= 48; index += 1) {
                const angle = (index / 48) * Math.PI * 2;
                outline.push([
                    centerX + Math.cos(angle) * radiusX,
                    centerY + Math.sin(angle) * radiusY
                ]);
            }
            return outline;
        }
        if (annotation.kind === 'rect') {
            const x1 = Math.min(points[0][0], points[1][0]);
            const x2 = Math.max(points[0][0], points[1][0]);
            const y1 = Math.min(points[0][1], points[1][1]);
            const y2 = Math.max(points[0][1], points[1][1]);
            return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
        }
        return points;
    }

    /**
     * @param {Point} point
     * @param {Point} start
     * @param {Point} end
     * @returns {number}
     */
    function distanceToSegment(point, start, end) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) {
            return Math.hypot(point[0] - start[0], point[1] - start[1]);
        }
        let ratio = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
        ratio = Math.max(0, Math.min(1, ratio));
        return Math.hypot(
            point[0] - (start[0] + ratio * dx),
            point[1] - (start[1] + ratio * dy)
        );
    }

    /**
     * @param {Bounds | null | undefined} area
     * @param {Point} point
     * @returns {AreaCorner | null}
     */
    function areaHandleAt(area, point) {
        if (!area) return null;
        /** @type {Record<AreaCorner, Point>} */
        const corners = {
            nw: [area.x, area.y], ne: [area.x + area.width, area.y],
            sw: [area.x, area.y + area.height], se: [area.x + area.width, area.y + area.height]
        };
        const names = /** @type {AreaCorner[]} */ (Object.keys(corners));
        return names.find(corner => {
            const handle = corners[corner];
            return Math.hypot(point[0] - handle[0], point[1] - handle[1]) <= AREA_HANDLE_HIT;
        }) || null;
    }

    /**
     * @param {Bounds} from
     * @param {AreaCorner} corner
     * @param {Point} point
     * @returns {Bounds}
     */
    function resizedArea(from, corner, point) {
        const oppositeX = corner.includes('w') ? from.x + from.width : from.x;
        const oppositeY = corner.includes('n') ? from.y + from.height : from.y;
        const rawWidth = Math.abs(point[0] - oppositeX);
        const rawHeight = Math.abs(point[1] - oppositeY);
        const width = Math.max(AREA_MIN_SIZE, rawWidth);
        const height = Math.max(AREA_MIN_SIZE, rawHeight);
        return {
            x: rawWidth < AREA_MIN_SIZE
                ? (corner.includes('w') ? oppositeX - width : oppositeX)
                : Math.min(point[0], oppositeX),
            y: rawHeight < AREA_MIN_SIZE
                ? (corner.includes('n') ? oppositeY - height : oppositeY)
                : Math.min(point[1], oppositeY),
            width,
            height
        };
    }

    // Which resize handle, if any, the pointer is on. Only shapes dragged out from two
    // corners can be resized; reshaping a freehand scribble or a text box is not a
    // gesture anyone reaches for.
    /**
     * @param {Annotation | null | undefined} annotation
     * @param {Point} point
     * @returns {number}
     */
    function handleAt(annotation, point) {
        if (!annotation || !TWO_POINT_KINDS.includes(annotation.kind)) return -1;
        for (let index = 0; index < 2; index += 1) {
            const distance = Math.hypot(
                point[0] - annotation.points[index][0],
                point[1] - annotation.points[index][1]
            );
            if (distance <= HANDLE_RADIUS + HIT_SLOP) return index;
        }
        return -1;
    }
