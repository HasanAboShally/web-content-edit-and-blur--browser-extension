(function () {
  console.log("Content script loaded!");

  var BLUR_LEVELS = ["0px", "4px", "20px"];
  var TEXT_NODE_ID = 3;
  var ELEMENT_NODE_ID = 1;

  var currentModeId = "idle";

  var imgElement = null;
  var inputElement = null;

  const STORAGE_KEY = "page_edits";

  var dblclickHandler = function (event) {
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

    reader.onload = function (event) {
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

  chrome.runtime.onMessage.addListener(function (newModeId) {
    modeChanged(newModeId);
  });

  document.addEventListener("keydown", function (event) {
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
    function (event) {
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

    inputElement.addEventListener("change", function () {
      loadImageFromFile(imgElement, this.files[0]);
    });
  })();

  // ************************************

  let currentlyEditedElement = null;

  // Function to start observing an element's changes
  function startObserving(target) {
    currentlyEditedElement = target;

    observer.observe(target, {
      attributes: false,
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Function to stop observing and save changes
  function stopObserving() {
    if (currentlyEditedElement) {
      const selector = getUniqueSelector(currentlyEditedElement);
      saveChanges(selector, "innerHTML", currentlyEditedElement.innerHTML);
      currentlyEditedElement = null;
      observer.disconnect();
    }
  }

  // Save changes to storage
  function saveChanges(selector, property, value) {
    chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
      console.log("Loaded edits from storage:", result[STORAGE_KEY]);

      const edits = result[STORAGE_KEY];
      const pageEdits = edits[window.location.href] || [];
      const existingEdit = pageEdits.find((edit) => edit.selector === selector);

      if (existingEdit) {
        console.log(`Updating existing edit for selector: ${selector}`);
        existingEdit[property] = value; // Update existing change
      } else {
        console.log(`Creating new edit for selector: ${selector}`);
        const newEdit = { selector };
        newEdit[property] = value;
        pageEdits.push(newEdit);
      }

      edits[window.location.href] = pageEdits;

      chrome.storage.local.set({ [STORAGE_KEY]: edits }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving to storage:", chrome.runtime.lastError);
        } else {
          console.log("Saved successfully:", edits);
        }
      });
    });
  }

  // Generate a unique selector for an element
  function getUniqueSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.className) {
        selector += "." + Array.from(element.classList).join(".");
      }
      let sibling = element; // Use 'let' here to allow reassignment
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        nth++;
      }
      selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      element = element.parentElement;
    }
    return path.join(" > ");
  }

  // MutationObserver for detecting changes
  const observer = new MutationObserver((mutations) => {
    console.log("Changes detected:", mutations);
    // Additional processing if needed
  });

  function applyChanges() {
    chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
      const pageEdits = result[STORAGE_KEY][window.location.href] || [];
      pageEdits.forEach(({ selector, innerHTML, style }) => {
        const element = document.querySelector(selector);
        if (element) {
          if (innerHTML) element.innerHTML = innerHTML;
          if (style) element.style.cssText = style;
        }
      });
      console.log("Edits applied successfully!", pageEdits);
    });
  }

  // Event listeners to track editing
  document.body.addEventListener("focusin", (event) => {
    if (event.target.isContentEditable) {
      startObserving(event.target);
    }
  });

  document.body.addEventListener("focusout", () => {
    stopObserving();
  });

  // Debugging helper
  chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
    console.log("Loaded saved edits:", result[STORAGE_KEY]);
  });

  // Call applyChanges immediately when the script is loaded
  applyChanges();
})();
