// Smart element picker state, geometry, and rendering.

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
