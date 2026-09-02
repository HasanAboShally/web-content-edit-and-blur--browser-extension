// Guarded page-side access to extension runtime and storage APIs.

    let extensionContextInvalidated = false;
    let invalidationNoticePending = false;

    function scheduleInvalidatedContextNotice() {
        if (!isTopFrame || invalidationNoticePending) return;
        invalidationNoticePending = true;
        // Defer until the current handler has finished showing its normal feedback so
        // this actionable message cannot immediately be overwritten by a success toast.
        queueMicrotask(() => {
            invalidationNoticePending = false;
            showToast('Extension reloaded — refresh this page to reconnect');
        });
    }

    function noteInvalidatedContext(error) {
        if (!/extension context invalidated/i.test(String(error?.message || error))) return;
        extensionContextInvalidated = true;
        scheduleInvalidatedContextNotice();
    }

    // Chrome APIs throw synchronously after an extension reload, before a promise even
    // exists. They can also reject asynchronously. Keep that lifecycle edge in one
    // adapter so every caller gets a settled promise and stale page UI never reports an
    // uncaught error. A normal sleeping service worker does not invalidate the context.
    function callExtensionApi(operation, fallback) {
        if (extensionContextInvalidated) {
            scheduleInvalidatedContextNotice();
            return Promise.resolve(fallback);
        }
        try {
            return Promise.resolve(operation()).catch(error => {
                noteInvalidatedContext(error);
                return fallback;
            });
        } catch (e) {
            noteInvalidatedContext(e);
            return Promise.resolve(fallback);
        }
    }

    function readStorage(keys, fallback = {}) {
        return callExtensionApi(() => chrome.storage.local.get(keys), fallback);
    }

    function writeStorage(values) {
        return callExtensionApi(() => chrome.storage.local.set(values));
    }

    // Every message to the service worker goes through here for the same reason. Always
    // returns a promise so callers can attach .finally() for cleanup that must run either
    // way, including screenshot chrome restoration.
    function sendToBackground(payload) {
        return callExtensionApi(() => chrome.runtime.sendMessage(payload));
    }
