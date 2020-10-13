(function() {
    
    var BLUR_LEVELS= ["0px","4px","20px"];

    var currentModeId="idle";

    var imgElement = null;
    var inputElement = null;

    var dblclickHandler = function(event){

        if( event.target.tagName != "IMG"){
            return;
        }

        imgElement = event.target;

        inputElement.click();
    };

    function loadImageFromFile(imgElement, file){
        
        if(!imgElement || !file){
            return;
        }

        var reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = function (event) {
            var imgSource = event.target.result;
            imgElement.src = imgSource;
        };
    };

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
        
        if(newModeId === 'edit'){
            document.querySelector('*').addEventListener('dblclick',dblclickHandler);
        }
        else{
            document.querySelector('*').removeEventListener('dblclick',dblclickHandler);
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

    (function initImageLoader(){
        inputElement = document.createElement("input");
        inputElement.type = "file";
        inputElement.accept = "image/*";

        inputElement.addEventListener("change", function(){
            loadImageFromFile(imgElement, this.files[0]);
        });
    
    })();

 })();
 