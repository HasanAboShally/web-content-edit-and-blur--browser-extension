(function() {
    
    var BLUR_LEVELS= ["0px","4px","20px"];

    var currentModeId="idle";


    function toggleElementBlur(elm){
         // [todo]: handle the case in which the element already has a css 'filter' property.  

         var elmBlurLevel = elm.getAttribute("blur-level") || 0;
         var nextBlurLevel = (elmBlurLevel+1) % BLUR_LEVELS.length;

         elm.style.webkitFilter = "blur(" + BLUR_LEVELS[nextBlurLevel] + ")";

         elm.setAttribute("blur-level", nextBlurLevel );
    }

    function modeChanged(newModeId){

        document.body.setAttribute("contenteditable", newModeId == "edit");

        if(newModeId === 'idle'){
            document.body.classList.remove('disable-links');
            
        } else{
            document.body.classList.add('disable-links');
        }

        currentModeId = newModeId;
    }

    chrome.runtime.onMessage.addListener(function(newModeId) {
        modeChanged(newModeId);
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" && currentModeId != "idle") {
            chrome.runtime.sendMessage( message = "idle" );
        }
    });

    document.querySelector('*').addEventListener('click', function(event){

        if(currentModeId === 'blur'){
            toggleElementBlur(event.target)
        }

        if(currentModeId != 'idle'){
            event.stopPropagation();
            event.preventDefault();
            return false;
        }

    },true);

 })();
 