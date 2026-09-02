// Toolbar markup. Styling order lives in page/styles.json.

    function toolbarTemplate() {
        const template = document.createElement('template');
        // Static extension-owned markup. Keeping the literal assignment here lets
        // Mozilla's validator prove that no page or imported data reaches the HTML sink.
        template.innerHTML = `
            <div class="ceb-toolbar-header">
                <svg class="ceb-toolbar-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
                </svg>
                <span class="ceb-toolbar-title">Content Edit &amp; Blur</span>
                <button class="ceb-toolbar-collapse" type="button" aria-label="Collapse toolbar" aria-expanded="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <button class="ceb-toolbar-close" type="button" aria-label="Close toolbar">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="ceb-toolbar-body">
                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Content</div>
                    <div class="ceb-tb-row ceb-mode-grid ceb-content-grid">
                        <button class="ceb-tb-btn" data-mode="edit" title="Edit page text — Alt+R replaces selected text">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                            <span class="ceb-tb-label">Edit</span>
                        </button>
                        <button class="ceb-tb-btn" data-mode="annotate"
                                title="Add arrows, shapes, highlights, notes or freehand drawing">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 20 L20 4"/>
                                <path d="M14 4h6v6"/>
                            </svg>
                            <span class="ceb-tb-label">Annotate</span>
                        </button>
                    </div>
                </div>

                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Privacy</div>
                    <div class="ceb-tb-row ceb-mode-grid ceb-privacy-grid">
                        <button class="ceb-tb-btn" data-mode="blur" title="Blur an element or rectangular area">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"/>
                                <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
                                <circle cx="12" cy="12" r="10" stroke-dasharray="1 3"/>
                            </svg>
                            <span class="ceb-tb-label">Blur</span>
                        </button>
                        <button class="ceb-tb-btn" data-mode="hide" title="Hide elements">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                            <span class="ceb-tb-label">Hide</span>
                        </button>
                        <button class="ceb-tb-btn ceb-advanced-only" data-mode="redact"
                                title="Cover content with a solid irreversible block">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="7" width="18" height="10" rx="1" fill="currentColor"/>
                            </svg>
                            <span class="ceb-tb-label">Redact</span>
                        </button>
                    </div>
                    <div class="ceb-privacy-selection" id="ceb-privacy-selection" hidden>
                        <span class="ceb-privacy-selection-status" id="ceb-privacy-selection-status"
                              aria-live="polite"></span>
                        <button class="ceb-privacy-remove" type="button" id="ceb-btn-privacy-remove"
                                aria-label="Remove selected privacy effect">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            <span>Remove</span>
                        </button>
                    </div>
                    <div class="ceb-privacy-target" id="ceb-privacy-target" hidden>
                        <div class="ceb-tb-section-label">Target</div>
                        <div class="ceb-seg" id="ceb-target-seg" role="group" aria-label="Privacy target">
                            <button class="ceb-seg-btn" type="button" data-target="element"
                                    title="Click a whole page element">Element</button>
                            <button class="ceb-seg-btn" type="button" data-target="area"
                                    title="Drag a precise rectangular area">Area</button>
                        </div>
                    </div>
                    <div class="ceb-privacy-strength" id="ceb-blur-strength" hidden>
                        <div class="ceb-tb-section-label" id="ceb-blur-strength-label">New blur strength</div>
                        <div class="ceb-seg" id="ceb-blur-strength-seg" role="group" aria-label="Blur strength">
                            <button class="ceb-seg-btn" type="button" data-blur-level="1" title="4 pixel blur">Soft</button>
                            <button class="ceb-seg-btn" type="button" data-blur-level="2" title="20 pixel blur">Strong</button>
                        </div>
                    </div>
                </div>

                <div class="ceb-tb-section" id="ceb-annotate-tools" hidden>
                    <div class="ceb-tb-section-label">Annotation</div>
                    <div class="ceb-tb-row ceb-note-tools">
                        <button class="ceb-note-tool" type="button" data-note-tool="arrow" title="Arrow" aria-label="Arrow">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 20 L20 4"/><path d="M14 4h6v6"/>
                            </svg>
                            <span class="ceb-note-tool-label">Arrow</span>
                        </button>
                        <button class="ceb-note-tool" type="button" data-note-tool="ellipse" title="Circle" aria-label="Circle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <ellipse cx="12" cy="12" rx="9" ry="7"/>
                            </svg>
                            <span class="ceb-note-tool-label">Circle</span>
                        </button>
                        <button class="ceb-note-tool" type="button" data-note-tool="marker" title="Highlighter" aria-label="Highlighter">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 14.5 16.5 4l3.5 2.5L12.5 17z"/>
                                <path d="M9 14.5 12.5 17"/>
                                <path d="M4 21h16" stroke-width="3" stroke-linecap="round"/>
                            </svg>
                            <span class="ceb-note-tool-label">Highlight</span>
                        </button>
                        <button class="ceb-note-tool" type="button" data-note-tool="text" title="Text note" aria-label="Text note">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>
                            </svg>
                            <span class="ceb-note-tool-label">Text</span>
                        </button>
                        <button class="ceb-note-tool" data-note-tool="rect" type="button" title="Box" aria-label="Box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="4" y="6" width="16" height="12" rx="2"/>
                            </svg>
                            <span class="ceb-note-tool-label">Box</span>
                        </button>
                        <button class="ceb-note-tool" data-note-tool="pen" type="button" title="Freehand" aria-label="Freehand pen">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 18c4-10 8 6 12-2 2-4 4-2 6-1"/>
                            </svg>
                            <span class="ceb-note-tool-label">Pen</span>
                        </button>
                        <button class="ceb-note-tool ceb-advanced-only" data-note-tool="step" type="button" title="Numbered step" aria-label="Numbered step">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="8.5"/>
                                <path d="M10.5 9.5 12.5 8v8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span class="ceb-note-tool-label">Step</span>
                        </button>
                    </div>
                    <div class="ceb-note-selection" id="ceb-note-selection" hidden>
                        <span class="ceb-note-selection-status" id="ceb-note-selection-status" aria-live="polite"></span>
                        <button class="ceb-note-delete" type="button" id="ceb-btn-note-delete" aria-label="Delete selected annotation">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            <span>Delete</span>
                        </button>
                    </div>
                    <div class="ceb-note-option">
                        <span class="ceb-note-option-label">Color</span>
                        <div class="ceb-note-colors" id="ceb-note-colors" role="group" aria-label="Annotation color"></div>
                    </div>
                    <div class="ceb-note-option" id="ceb-note-width">
                        <label class="ceb-note-option-label" for="ceb-note-width-input">Width</label>
                        <span class="ceb-note-width-sample" aria-hidden="true"></span>
                        <input id="ceb-note-width-input" class="ceb-note-width-input" type="range"
                               min="1" max="20" step="1" value="3">
                        <output id="ceb-note-width-value" class="ceb-note-width-value" for="ceb-note-width-input">3 px</output>
                    </div>
                    <button class="ceb-tb-mini ceb-note-keep" type="button" id="ceb-btn-note-keep" aria-pressed="false">
                        Save annotations too
                    </button>
                </div>

                <div class="ceb-tb-section ceb-advanced-only" id="ceb-scope-tools">
                    <div class="ceb-tb-section-label" id="ceb-scope-label">Apply new rules to</div>
                    <div class="ceb-seg" id="ceb-scope-seg">
                        <button class="ceb-seg-btn" data-scope="page" title="Only this exact URL">This page</button>
                        <button class="ceb-seg-btn" data-scope="site" title="Every page on this domain">Whole site</button>
                    </div>
                </div>

                <div class="ceb-tb-section">
                    <div class="ceb-tb-section-label">Actions</div>
                    <div class="ceb-tb-row ceb-action-row">
                        <button class="ceb-tb-btn ceb-tb-action" type="button" id="ceb-btn-undo" title="Undo" aria-label="Undo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="1 4 1 10 7 10"/>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action" type="button" id="ceb-btn-redo" title="Redo" aria-label="Redo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action" type="button" id="ceb-btn-screenshot" title="Screenshot" aria-label="Take screenshot">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                            </svg>
                        </button>
                        <button class="ceb-tb-btn ceb-tb-action ceb-tb-danger" type="button" id="ceb-btn-reset" title="Clear everything on this page" aria-label="Clear page changes">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="ceb-tb-section ceb-advanced-only">
                    <button class="ceb-tb-disclosure" id="ceb-rules-toggle" aria-expanded="false">
                        <svg class="ceb-tb-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <span>Rules</span>
                        <span class="ceb-tb-count" id="ceb-rules-count">0</span>
                    </button>
                    <div class="ceb-rules-panel" id="ceb-rules-panel" hidden>
                        <div class="ceb-rules-list" id="ceb-rules-list"></div>
                        <div class="ceb-rules-io">
                            <button class="ceb-tb-mini" id="ceb-btn-export">Export</button>
                            <button class="ceb-tb-mini" id="ceb-btn-import">Import</button>
                        </div>
                    </div>
                </div>

                <div class="ceb-tb-restore" id="ceb-restore-section" style="display:none;">
                    <button class="ceb-tb-restore-btn" id="ceb-btn-restore">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="21 8 21 21 3 21 3 8"/>
                            <rect x="1" y="3" width="22" height="5"/>
                        </svg>
                        <span>Restore <span id="ceb-restore-count">0</span> saved changes</span>
                    </button>
                </div>
            </div>
            <div class="ceb-toolbar-footer">
                <div class="ceb-tb-stats" id="ceb-stats"></div>
                <label class="ceb-tb-toggle"
                       title="Remember eligible changes after reload. Saved data stays in this browser.">
                    <input type="checkbox" id="ceb-persist-toggle">
                    <span class="ceb-tb-toggle-slider"></span>
                    <span class="ceb-tb-toggle-label">Remember changes</span>
                </label>
            </div>
            <div class="ceb-toolbar-footer ceb-toolbar-footer-alt">
                 <div class="ceb-seg ceb-seg-sm ceb-seg-ui" id="ceb-ui-seg"
                     role="group" aria-label="Tool set">
                    <button class="ceb-seg-btn" data-ui="essentials"
                        title="Common editing, privacy and annotation tools">Essentials</button>
                    <button class="ceb-seg-btn" data-ui="advanced"
                        title="Adds Redact, site scope, Rules and numbered Steps">Advanced</button>
                </div>
                <button class="ceb-tb-help" type="button" id="ceb-btn-help" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
            </div>
            <div class="ceb-mode-indicator" id="ceb-mode-indicator"></div>
        `;
        return template.content.cloneNode(true);
    }
