(function() {
    var BLUR_LEVELS = ["0px", "4px", "20px"];
    var TEXT_NODE_ID = 3;
    var ELEMENT_NODE_ID = 1;

    var currentModeId = "idle";

    var imgElement = null;
    var inputElement = null;

    var dblclickHandler = function(event) {
        if (event.target.tagName != "IMG") {
            return;
        }

        imgElement = event.target;

        inputElement.click();
    };

    function loadImageFromFile(imgElement, file) {
        if (!imgElement || !file) {
            return;
        }

        var reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function(event) {
            var imgSource = event.target.result;
            imgElement.src = imgSource;
        };
    }

    function toggleElementBlur(elm) {
        // [todo]: handle the case in which the element already has a css 'filter' property.

        var elmBlurLevel = elm.getAttribute("blur-level") || 0;
        var nextBlurLevel = (elmBlurLevel + 1) % BLUR_LEVELS.length;

        elm.style.webkitFilter = "blur(" + BLUR_LEVELS[nextBlurLevel] + ")";

        elm.setAttribute("blur-level", nextBlurLevel);
    }

    function modeChanged(newModeId) {
        document.body.setAttribute("contenteditable", newModeId == "edit");

        if (newModeId === "idle") {
            document.body.classList.remove("disable-links");
        } else {
            document.body.classList.add("disable-links");
        }

        if (newModeId === "edit") {
            document.querySelector("*").addEventListener("dblclick", dblclickHandler);
        } else {
            document
                .querySelector("*")
                .removeEventListener("dblclick", dblclickHandler);
        }

        currentModeId = newModeId;
    }

    function replaceAllTextInNode(node, oldText, newText) {
        if (node.nodeType == TEXT_NODE_ID) {
            node.data = node.data.replaceAll(oldText, newText);
            return;
        }

        if (node.nodeType == ELEMENT_NODE_ID && node.nodeName != "SCRIPT") {
            for (var i = 0; i < node.childNodes.length; i++) {
                replaceAllTextInNode(node.childNodes[i], oldText, newText);
            }
        }
    }

    function triggerTextReplace(oldText) {
        var newText = window.prompt(
            "Replace All Occurrences\n\nPlease notice that the replacing is case-sensitive and that spaces at the end of the selected text get trimmed. \n\nReplace",
            '[The new text you want to replace  "' + oldText + '" with]'
        );

        if (!newText) {
            return;
        }

        // [todo]: consider showing number of occurrences that will be replaced

        var confirmResult = window.confirm(
            'Are you sure you want to replace all occurrences of "' +
            oldText +
            '" with "' +
            newText +
            '"?'
        );

        if (confirmResult) {
            replaceAllTextInNode(document.body, oldText, newText);
        }

        return newText;
    }

    chrome.runtime.onMessage.addListener(function(newModeId) {
        modeChanged(newModeId);
    });

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && currentModeId != "idle") {
            chrome.runtime.sendMessage((message = "idle"));
            return;
        }

        if (
            currentModeId == "edit" &&
            event.altKey /*&& event.shiftKey*/ &&
            event.key.toLowerCase() === "r"
        ) {
            var oldText = window.getSelection().toString();

            if (!oldText) {
                alert("Please select the text you want to replace.");
                return;
            }

            /* remove any spaces from the end of the selected text.
                  This is to make it easier when double clicking to select a word - as browsers' default behaviour is to include the space after the selected word.*/
            oldText = oldText.trimEnd();

            triggerTextReplace(oldText);
        }
    });

    document.querySelector("*").addEventListener(
        "click",
        function(event) {
            if (currentModeId === "blur") {
                toggleElementBlur(event.target);
            }

            if (currentModeId != "idle") {
                event.stopPropagation();
                event.preventDefault();
                return false;
            }
        },
        true
    );

    (function initImageLoader() {
        inputElement = document.createElement("input");
        inputElement.type = "file";
        inputElement.accept = "image/*";

        inputElement.addEventListener("change", function() {
            loadImageFromFile(imgElement, this.files[0]);
        });
    })();
    
})();