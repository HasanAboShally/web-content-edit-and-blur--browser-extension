var MODES = [
	{
		id:"idle",
		displayName:"",
		badgeColor:"#222",
	},
	{
		id:"edit",
		displayName:"Edit",
		badgeColor:"#2ECC71",
	},
	{
		id:"blur",
		displayName:"Blur",
		badgeColor:"#E67E22",
	}
];

var tabModeIndexes = {};

function initOnTab(tabId, callback){
	
	tabModeIndexes[tabId] = 0;

	chrome.tabs.executeScript(tabId, { file:"page-code.js", allFrames: true }, function(){
		// [todo: switch to promises -_-]

		if (typeof callback == 'function') { 
			callback(); 
		}
	});
	
	chrome.tabs.insertCSS(tabId, { file:"page-style.css", allFrames: true });
}

function switchMode(tabId, modeId){

	var mode = MODES.find(mode => mode.id == modeId)

	chrome.tabs.sendMessage(tabId, mode.id);

	chrome.browserAction.setBadgeText({text: mode.displayName, tabId: tabId});
	chrome.browserAction.setBadgeBackgroundColor({ color: mode.badgeColor , tabId: tabId});

	chrome.browserAction.setIcon({
		path: {
			"19": "images/icons/19x19/icon-"+mode.id+".png",
			"38": "images/icons/38x38/icon-"+mode.id+".png"
		},
		tabId: tabId
	});
}

function getNextModeId(currentModeId){
	return currentModeId ? ((currentModeId + 1) % MODES.length) : 1;
}

function switchToNextMode(tabId){
	tabModeIndexes[tabId] = getNextModeId(tabModeIndexes[tabId]);
	switchMode(tabId, MODES[tabModeIndexes[tabId]].id);
}

chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
	if (changeInfo.status == 'complete') {
		delete tabModeIndexes[tabId];
	}
});

chrome.browserAction.onClicked.addListener(function(tab) {

	if(tabModeIndexes[tab.id] == undefined){
		initOnTab(tab.id,function(){
			switchToNextMode(tab.id)
		});
		return;
	}

	switchToNextMode(tab.id);
});

chrome.runtime.onMessage.addListener(function(message, sender){
	if(message == "idle"){
		tabModeIndexes[sender.tab.id] = 0;
		switchMode(sender.tab.id, "idle");
	}
});
