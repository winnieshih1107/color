// Background script for message relay and coordination

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'colorPicked') {
        // Relay color picked message to popup if it's open
        chrome.runtime.sendMessage(request).catch(() => {
            // Popup might be closed, ignore error
        });
    }
    
    return true; // Keep message channel open
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will be handled by the popup, but we can add fallback logic here
    console.log('Extension icon clicked');
});

// Handle tab updates to clean up any lingering color picker state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // Clean up any color picker state when page loads
        chrome.tabs.sendMessage(tabId, { action: 'cleanup' }).catch(() => {
            // Content script might not be injected yet, ignore error
        });
    }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Clean up any stored state for this tab
    console.log('Tab closed:', tabId);
});

// Handle page visibility changes instead of unload events
chrome.tabs.onActivated.addListener((activeInfo) => {
    // Clean up color picker state when switching tabs
    chrome.tabs.sendMessage(activeInfo.tabId, { action: 'cleanup' }).catch(() => {
        // Content script might not be injected yet, ignore error
    });
});