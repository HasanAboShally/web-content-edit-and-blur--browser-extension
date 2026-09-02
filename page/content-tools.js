// Screenshots, notifications, text/image replacement, and rule import/export.

    const CAPTURE_HIDE = [
        '#ceb-toolbar', '#ceb-mode-badge', '#ceb-toast',
        '#ceb-draw-overlay', '#ceb-annotate-overlay', '#ceb-note-preview', '#ceb-note-handles',
        '#ceb-privacy-handles', '#ceb-text-editor', '#ceb-picker-outline', '#ceb-picker-hud', '#ceb-panel'
    ];

    function captureScreenshot() {
        finishTextEditing();
        const hidden = [];
        CAPTURE_HIDE.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (el.style.visibility === 'hidden') return;
                hidden.push([el, el.style.visibility]);
                el.style.visibility = 'hidden';
            });
        });
        const restore = () => hidden.forEach(([el, prev]) => { el.style.visibility = prev; });
        // Two frames: one to apply the style, one to be sure it has painted before the
        // compositor snapshot is taken.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            // restore must run even when the send fails, or the whole UI stays
            // invisible until the page is reloaded. sendToBackground never throws
            // and always returns a promise, so .finally() is guaranteed to fire.
            sendToBackground({ action: 'takeScreenshot' }).finally(restore);
        }));
    }

    function downloadScreenshot(dataUrl) {
        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        showToast('Screenshot saved!');
    }

    // The toolbar already communicates the current mode. A compact badge is only useful
    // when the toolbar has been closed; showing both made the badge cover toolbar controls.
    function updateModeIndicator(mode) {
        if (!isTopFrame) return;

        let indicator = document.getElementById('ceb-mode-badge');
        
        if (mode === 'idle' || toolbar) {
            if (indicator) indicator.remove();
            return;
        }
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ceb-mode-badge';
            document.body.appendChild(indicator);
        }
        
        const labels = {
            edit: 'Edit text', blur: 'Blur', hide: 'Hide', redact: 'Redact',
            draw: 'Area', annotate: 'Annotate'
        };
        indicator.textContent = `${labels[mode] || mode} mode`;
        indicator.dataset.mode = mode;
        indicator.setAttribute('role', 'status');
        indicator.classList.remove('is-muted');
        
        // Fade out after 2 seconds
        setTimeout(() => {
            if (indicator?.isConnected) indicator.classList.add('is-muted');
        }, 2000);
    }

    // Toast notifications
    function showToast(message, showUndo = false) {
        if (!isTopFrame) return;

        let toast = document.getElementById('ceb-toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ceb-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.classList.remove('is-leaving');
        
        // textContent, not innerHTML - messages can embed text taken straight off the page.
        toast.textContent = '';
        const label = document.createElement('span');
        label.textContent = message;
        toast.appendChild(label);

        if (showUndo) {
            const hint = document.createElement('span');
            hint.className = 'ceb-toast-hint';
            hint.textContent = `${undoShortcutLabel()} to undo`;
            toast.appendChild(hint);
        }
        
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.add('is-leaving');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
        
        // Update toolbar stats
        if (typeof updateToolbarStats === 'function') updateToolbarStats();
    }

    function replaceAllTextInNode(node, oldText, newText) {
        if (node.nodeType === TEXT_NODE_ID) {
            node.data = node.data.replaceAll(oldText, newText);
            return;
        }

        if (node.nodeType === ELEMENT_NODE_ID && node.nodeName !== "SCRIPT") {
            for (let i = 0; i < node.childNodes.length; i++) {
                replaceAllTextInNode(node.childNodes[i], oldText, newText);
            }
        }
    }

    function triggerTextReplace(oldText) {
        const newText = window.prompt(
            "Replace All Occurrences\n\nPlease notice that the replacing is case-sensitive.\n\nReplace:",
            '[New text to replace "' + oldText + '" with]'
        );

        if (!newText) return;

        const confirmResult = window.confirm(
            'Are you sure you want to replace all occurrences of "' +
            oldText + '" with "' + newText + '"?'
        );

        if (confirmResult) {
            state.replacements.push({
                id: newId('t'), oldText, newText, scope: settings.defaultScope
            });
            commit(`Replaced all "${oldText}"`);
        }

        return newText;
    }

    const dblclickHandler = function(event) {
        if (event.target.tagName !== "IMG") return;
        imgElement = event.target;
        inputElement.click();
    };

    function loadImageFromFile(imgEl, file) {
        if (!imgEl || !file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            imgEl.src = event.target.result;
            showToast('Image replaced');
        };
    }

    function buildExport() {
        return {
            format: 'content-edit-blur',
            version: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            url: window.location.href,
            origin: window.location.origin,
            page: serializeScope('page'),
            site: serializeScope('site')
        };
    }

    function importRules(data) {
        if (!data || data.format !== 'content-edit-blur') {
            showToast('Not a valid rules file');
            return;
        }
        const pageData = migrateChanges(data.page, 'page');
        const siteData = migrateChanges(data.site, 'site');

        // Fresh ids on import so re-importing the same file cannot collide with what is
        // already here.
        [...pageData.rules, ...siteData.rules].forEach(r => { r.id = newId('r'); });
        [...pageData.areas, ...siteData.areas].forEach(a => { a.id = newId('a'); });
        [...pageData.replacements, ...siteData.replacements].forEach(r => { r.id = newId('t'); });
        [...pageData.annotations, ...siteData.annotations].forEach(a => { a.id = newId('n'); });

        mergeIntoState(pageData);
        mergeIntoState(siteData);
        commit(`Imported ${pageData.rules.length + siteData.rules.length} rules`);
    }

    function downloadExport() {
        const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ceb-rules-${window.location.hostname || 'page'}-${Date.now()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Rules exported');
    }

    function promptImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    importRules(JSON.parse(String(reader.result)));
                } catch (e) {
                    showToast('Could not read that file');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    function initImageLoader() {
        inputElement = document.createElement("input");
        inputElement.type = "file";
        inputElement.accept = "image/*";

        inputElement.addEventListener("change", function() {
            loadImageFromFile(imgElement, this.files[0]);
        });
    }
