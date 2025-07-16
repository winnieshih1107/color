document.addEventListener('DOMContentLoaded', function() {
    const pickColorBtn = document.getElementById('pickColor');
    const colorDisplay = document.getElementById('colorDisplay');
    const colorPreview = document.getElementById('colorPreview');
    const hexValue = document.getElementById('hexValue');
    const rgbValue = document.getElementById('rgbValue');
    const hslValue = document.getElementById('hslValue');
    const copyHex = document.getElementById('copyHex');
    const copyRgb = document.getElementById('copyRgb');
    const copyHsl = document.getElementById('copyHsl');
    const historyList = document.getElementById('historyList');

    // Load color history from storage
    loadColorHistory();

    pickColorBtn.addEventListener('click', async function() {
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Inject content script if not already injected
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Wait a moment for script to load
            setTimeout(() => {
                // Send message to content script to start color picking
                chrome.tabs.sendMessage(tab.id, { action: 'startColorPicking' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Message sending failed:', chrome.runtime.lastError.message);
                        // Try again after a longer delay
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tab.id, { action: 'startColorPicking' });
                        }, 500);
                    }
                });
                
                // Close the popup
                window.close();
            }, 200);
        } catch (error) {
            console.error('Error starting color picker:', error);
            alert('Unable to start color picker. Please try again.');
        }
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'colorPicked') {
            displayColor(request.color);
            saveColorToHistory(request.color);
        }
    });

    function displayColor(color) {
        colorDisplay.style.display = 'block';
        colorPreview.style.backgroundColor = color.hex;
        hexValue.value = color.hex;
        rgbValue.value = color.rgb;
        hslValue.value = color.hsl;
    }

    function rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    function componentToHex(c) {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }

    function rgbToHex(r, g, b) {
        return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    // Copy functionality
    copyHex.addEventListener('click', () => copyToClipboard(hexValue.value));
    copyRgb.addEventListener('click', () => copyToClipboard(rgbValue.value));
    copyHsl.addEventListener('click', () => copyToClipboard(hslValue.value));

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 1000);
        });
    }

    function saveColorToHistory(color) {
        chrome.storage.local.get(['colorHistory'], function(result) {
            let history = result.colorHistory || [];
            
            // Remove duplicate if exists
            history = history.filter(item => item.hex !== color.hex);
            
            // Add new color to beginning
            history.unshift(color);
            
            // Keep only last 10 colors
            history = history.slice(0, 10);
            
            chrome.storage.local.set({ colorHistory: history }, function() {
                loadColorHistory();
            });
        });
    }

    function loadColorHistory() {
        chrome.storage.local.get(['colorHistory'], function(result) {
            const history = result.colorHistory || [];
            historyList.innerHTML = '';
            
            history.forEach(color => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `
                    <div class="history-color" style="background-color: ${color.hex}"></div>
                    <span class="history-hex">${color.hex}</span>
                `;
                historyItem.addEventListener('click', () => {
                    displayColor(color);
                });
                historyList.appendChild(historyItem);
            });
        });
    }
});