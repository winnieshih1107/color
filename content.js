let isColorPickingActive = false;
let colorPickingOverlay = null;
let colorPickingCursor = null;
let colorPickingCanvas = null;
let colorPickingContext = null;
let colorPreviewWindow = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'startColorPicking') {
        startColorPicking();
        sendResponse({ status: 'started' });
    } else if (request.action === 'cleanup') {
        // Clean up any color picker state
        stopColorPicking();
        sendResponse({ status: 'cleaned' });
    }
    return true; // Keep the message channel open for async response
});

function startColorPicking() {
    if (isColorPickingActive) return;
    
    isColorPickingActive = true;
    
    // Try to use EyeDropper API first (Chrome 95+)
    if ('EyeDropper' in window) {
        useEyeDropperAPI();
    } else {
        // Fallback to manual color picking
        createColorPickingOverlay();
        attachColorPickingEvents();
        document.body.style.cursor = 'crosshair';
    }
}

async function useEyeDropperAPI() {
    try {
        const eyeDropper = new EyeDropper();
        const result = await eyeDropper.open();
        
        if (result.sRGBHex) {
            const color = parseHexColor(result.sRGBHex);
            
            // Send color to popup
            chrome.runtime.sendMessage({
                action: 'colorPicked',
                color: color
            });
            
            // Show notification
            showColorPickedNotification(color);
        }
    } catch (error) {
        console.log('EyeDropper cancelled or failed, using fallback');
        // Fallback to manual color picking
        createColorPickingOverlay();
        attachColorPickingEvents();
        document.body.style.cursor = 'crosshair';
    }
}

function parseHexColor(hex) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const hsl = rgbToHsl(r, g, b);
    
    return {
        hex: hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
    };
}

function createColorPickingOverlay() {
    // Create overlay
    colorPickingOverlay = document.createElement('div');
    colorPickingOverlay.id = 'color-picking-overlay';
    colorPickingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 999999;
        cursor: crosshair;
        pointer-events: auto;
    `;
    
    // Create color preview window
    colorPreviewWindow = document.createElement('div');
    colorPreviewWindow.id = 'color-preview-window';
    colorPreviewWindow.style.cssText = `
        position: fixed;
        width: 120px;
        height: 80px;
        background: white;
        border: 2px solid #333;
        border-radius: 8px;
        pointer-events: none;
        z-index: 1000001;
        display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        overflow: hidden;
    `;
    
    // Create color preview area
    const colorPreviewArea = document.createElement('div');
    colorPreviewArea.id = 'color-preview-area';
    colorPreviewArea.style.cssText = `
        width: 100%;
        height: 50px;
        border-bottom: 1px solid #ddd;
    `;
    
    // Create color info text
    const colorInfoText = document.createElement('div');
    colorInfoText.id = 'color-info-text';
    colorInfoText.style.cssText = `
        padding: 4px 8px;
        font-family: monospace;
        font-size: 10px;
        line-height: 1.2;
        color: #333;
        text-align: center;
    `;
    
    colorPreviewWindow.appendChild(colorPreviewArea);
    colorPreviewWindow.appendChild(colorInfoText);
    
    // Create magnifying glass cursor
    colorPickingCursor = document.createElement('div');
    colorPickingCursor.id = 'color-picking-cursor';
    colorPickingCursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        z-index: 1000000;
        box-shadow: 0 0 0 1px black, 0 0 8px rgba(0,0,0,0.4);
        display: none;
        transform: translate(-50%, -50%);
    `;
    
    // Create canvas for more accurate color sampling
    colorPickingCanvas = document.createElement('canvas');
    colorPickingCanvas.width = window.innerWidth;
    colorPickingCanvas.height = window.innerHeight;
    colorPickingCanvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: -1;
        opacity: 0;
    `;
    colorPickingContext = colorPickingCanvas.getContext('2d');
    
    document.body.appendChild(colorPickingOverlay);
    document.body.appendChild(colorPreviewWindow);
    document.body.appendChild(colorPickingCursor);
    document.body.appendChild(colorPickingCanvas);
}

function attachColorPickingEvents() {
    colorPickingOverlay.addEventListener('mousemove', handleMouseMove, { passive: true });
    colorPickingOverlay.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
}

function handleMouseMove(e) {
    if (!isColorPickingActive) return;
    
    // Update cursor position
    colorPickingCursor.style.left = e.clientX + 'px';
    colorPickingCursor.style.top = e.clientY + 'px';
    colorPickingCursor.style.display = 'block';
    
    // Get color at cursor position
    const color = getColorAtPosition(e.clientX, e.clientY);
    if (color) {
        // Update cursor color
        colorPickingCursor.style.backgroundColor = color.hex;
        
        // Update preview window
        updatePreviewWindow(e.clientX, e.clientY, color);
    }
}

function updatePreviewWindow(x, y, color) {
    if (!colorPreviewWindow) return;
    
    const previewArea = document.getElementById('color-preview-area');
    const infoText = document.getElementById('color-info-text');
    
    if (previewArea) {
        previewArea.style.backgroundColor = color.hex;
        
        // Add a subtle gradient for better visual appeal
        previewArea.style.background = `linear-gradient(45deg, ${color.hex}, ${lightenColor(color.hex, 10)})`;
    }
    
    if (infoText) {
        infoText.innerHTML = `<strong>${color.hex}</strong><br><small>${color.rgb.replace('rgb(', '').replace(')', '')}</small>`;
    }
    
    // Position preview window
    let windowX = x + 25;
    let windowY = y - 90;
    
    // Adjust position if near edges
    if (windowX + 120 > window.innerWidth) {
        windowX = x - 145;
    }
    if (windowY < 0) {
        windowY = y + 25;
    }
    
    colorPreviewWindow.style.left = windowX + 'px';
    colorPreviewWindow.style.top = windowY + 'px';
    colorPreviewWindow.style.display = 'block';
}

function lightenColor(hex, percent) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    // Lighten each component
    const newR = Math.min(255, Math.floor(r + (255 - r) * percent / 100));
    const newG = Math.min(255, Math.floor(g + (255 - g) * percent / 100));
    const newB = Math.min(255, Math.floor(b + (255 - b) * percent / 100));
    
    // Convert back to hex
    return rgbToHex(newR, newG, newB);
}

function handleClick(e) {
    if (!isColorPickingActive) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const color = getColorAtPosition(e.clientX, e.clientY);
    if (color) {
        // Send color to popup
        chrome.runtime.sendMessage({
            action: 'colorPicked',
            color: color
        });
        
        // Show notification
        showColorPickedNotification(color);
    }
    
    stopColorPicking();
}

function handleKeyDown(e) {
    if (!isColorPickingActive) return;
    
    if (e.key === 'Escape') {
        stopColorPicking();
    }
}

function getColorAtPosition(x, y) {
    try {
        // Use the new screen capture API if available
        if (typeof window.getScreenMedia !== 'undefined') {
            return getColorFromScreenCapture(x, y);
        }
        
        // Fallback to element-based color detection
        return getColorFromElement(x, y);
    } catch (error) {
        console.error('Error getting color:', error);
        return null;
    }
}

function getColorFromElement(x, y) {
    // Hide overlay temporarily to get element underneath
    colorPickingOverlay.style.display = 'none';
    colorPickingCursor.style.display = 'none';
    if (colorPreviewWindow) colorPreviewWindow.style.display = 'none';
    
    const element = document.elementFromPoint(x, y);
    
    // Restore overlay
    colorPickingOverlay.style.display = 'block';
    
    if (!element) return null;
    
    // Try multiple methods to get accurate color
    let color = null;
    
    // Method 1: Check for images first (most accurate for images)
    if (element.tagName === 'IMG') {
        color = getColorFromImage(element, x, y);
        if (color) {
            console.log('Color from image:', color);
            return parseColor(color);
        }
    }
    
    // Method 2: Check canvas elements
    if (element.tagName === 'CANVAS') {
        color = getColorFromCanvas(element, x, y);
        if (color) {
            console.log('Color from canvas:', color);
            return parseColor(color);
        }
    }
    
    // Method 3: SVG elements
    if (element.tagName === 'svg' || element.closest('svg')) {
        color = getColorFromSVG(element, x, y);
        if (color) {
            console.log('Color from SVG:', color);
            return parseColor(color);
        }
    }
    
    // Method 4: Get computed styles with better logic
    color = getColorFromComputedStyle(element);
    if (color) {
        console.log('Color from computed style:', color, 'Element:', element.tagName, element.className);
        return parseColor(color);
    }
    
    // Method 5: Try to get color from pseudo-elements
    const pseudoColor = getColorFromPseudoElements(element);
    if (pseudoColor) {
        console.log('Color from pseudo-element:', pseudoColor);
        return parseColor(pseudoColor);
    }
    
    console.log('No color found, using default white');
    return parseColor('rgb(255, 255, 255)');
}

function getColorFromPseudoElements(element) {
    try {
        // Check ::before and ::after pseudo-elements
        const beforeStyle = window.getComputedStyle(element, '::before');
        const afterStyle = window.getComputedStyle(element, '::after');
        
        if (beforeStyle.backgroundColor && beforeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && beforeStyle.backgroundColor !== 'transparent') {
            return beforeStyle.backgroundColor;
        }
        
        if (afterStyle.backgroundColor && afterStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && afterStyle.backgroundColor !== 'transparent') {
            return afterStyle.backgroundColor;
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

function getColorFromScreenCapture(element, x, y) {
    try {
        // Create a small canvas to capture the screen area
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;
        
        // Use html2canvas-like approach for better accuracy
        const rect = element.getBoundingClientRect();
        const elementX = x - rect.left;
        const elementY = y - rect.top;
        
        // Check if element has background image
        const style = window.getComputedStyle(element);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            return getColorFromBackgroundImage(element, style, elementX, elementY);
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

function getColorFromBackgroundImage(element, style, x, y) {
    try {
        const bgImage = style.backgroundImage;
        const urlMatch = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
        if (!urlMatch) return null;
        
        const imageUrl = urlMatch[1];
        
        // Skip external URLs that might cause CORS issues
        if (imageUrl.startsWith('http') && !imageUrl.startsWith(window.location.origin)) {
            console.log('Skipping external image URL to avoid CORS issues:', imageUrl);
            return null;
        }
        
        // Don't try to load images that might not exist
        if (imageUrl.includes('nipic.com') || imageUrl.includes('example.com')) {
            console.log('Skipping potentially problematic image URL:', imageUrl);
            return null;
        }
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onerror = function() {
            console.log('Failed to load background image:', imageUrl);
        };
        
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                const rect = element.getBoundingClientRect();
                const scaleX = img.width / rect.width;
                const scaleY = img.height / rect.height;
                
                const imageData = ctx.getImageData(x * scaleX, y * scaleY, 1, 1);
                const [r, g, b] = imageData.data;
                
                return `rgb(${r}, ${g}, ${b})`;
            } catch (e) {
                console.log('Error processing background image:', e);
                return null;
            }
        };
        
        // Only set src if it's a safe URL
        if (imageUrl.startsWith('data:') || imageUrl.startsWith('/') || imageUrl.startsWith('./')) {
            img.src = imageUrl;
        }
        
        return null;
    } catch (e) {
        console.log('Error in getColorFromBackgroundImage:', e);
        return null;
    }
}

function getColorFromSVG(element, x, y) {
    try {
        const style = window.getComputedStyle(element);
        return style.fill || style.stroke || style.color;
    } catch (e) {
        return null;
    }
}

function getColorFromComputedStyle(element) {
    try {
        const style = window.getComputedStyle(element);
        
        // First check background color
        let bgColor = style.backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            return bgColor;
        }
        
        // Check for gradients in background
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            // Handle linear gradients
            const linearGradientMatch = style.backgroundImage.match(/linear-gradient\([^)]+\)/);
            if (linearGradientMatch) {
                const colorMatch = linearGradientMatch[0].match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,6}|hsl\([^)]+\)|hsla\([^)]+\)/);
                if (colorMatch) {
                    return colorMatch[0];
                }
            }
            
            // Handle radial gradients
            const radialGradientMatch = style.backgroundImage.match(/radial-gradient\([^)]+\)/);
            if (radialGradientMatch) {
                const colorMatch = radialGradientMatch[0].match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,6}|hsl\([^)]+\)|hsla\([^)]+\)/);
                if (colorMatch) {
                    return colorMatch[0];
                }
            }
        }
        
        // Check for different border colors
        const borderColors = [
            style.borderTopColor,
            style.borderRightColor,
            style.borderBottomColor,
            style.borderLeftColor,
            style.borderColor
        ];
        
        for (let borderColor of borderColors) {
            if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent' && borderColor !== 'currentcolor') {
                return borderColor;
            }
        }
        
        // Check text color
        if (style.color && style.color !== 'rgba(0, 0, 0, 0)' && style.color !== 'transparent') {
            return style.color;
        }
        
        // Check outline color
        if (style.outlineColor && style.outlineColor !== 'rgba(0, 0, 0, 0)' && style.outlineColor !== 'transparent' && style.outlineColor !== 'currentcolor') {
            return style.outlineColor;
        }
        
        // Check box-shadow color
        if (style.boxShadow && style.boxShadow !== 'none') {
            const shadowColorMatch = style.boxShadow.match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,6}/);
            if (shadowColorMatch) {
                return shadowColorMatch[0];
            }
        }
        
        // For SVG elements
        if (style.fill && style.fill !== 'none' && style.fill !== 'rgba(0, 0, 0, 0)' && style.fill !== 'transparent' && style.fill !== 'currentcolor') {
            return style.fill;
        }
        
        if (style.stroke && style.stroke !== 'none' && style.stroke !== 'rgba(0, 0, 0, 0)' && style.stroke !== 'transparent' && style.stroke !== 'currentcolor') {
            return style.stroke;
        }
        
        // Check text-shadow color
        if (style.textShadow && style.textShadow !== 'none') {
            const shadowColorMatch = style.textShadow.match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,6}/);
            if (shadowColorMatch) {
                return shadowColorMatch[0];
            }
        }
        
        // Traverse up the DOM tree
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 10) {
            const parentStyle = window.getComputedStyle(parent);
            const parentBgColor = parentStyle.backgroundColor;
            if (parentBgColor && parentBgColor !== 'rgba(0, 0, 0, 0)' && parentBgColor !== 'transparent') {
                return parentBgColor;
            }
            parent = parent.parentElement;
            depth++;
        }
        
        return 'rgb(255, 255, 255)'; // Default to white
    } catch (e) {
        return 'rgb(255, 255, 255)';
    }
}

function getColorFromImage(img, x, y) {
    try {
        // Check if image is loaded
        if (!img.complete || img.naturalWidth === 0) {
            return null;
        }
        
        // Check if image source is problematic
        if (img.src.includes('nipic.com') || img.src.includes('example.com')) {
            console.log('Skipping problematic image source:', img.src);
            return null;
        }
        
        // Skip external images that might cause CORS issues
        if (img.src.startsWith('http') && !img.src.startsWith(window.location.origin)) {
            console.log('Skipping external image to avoid CORS issues:', img.src);
            return null;
        }
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        // Enable image smoothing for better color sampling
        ctx.imageSmoothingEnabled = true;
        
        try {
            ctx.drawImage(img, 0, 0);
        } catch (drawError) {
            console.log('Error drawing image to canvas:', drawError);
            return null;
        }
        
        // Calculate relative position on image
        const rect = img.getBoundingClientRect();
        const relX = Math.max(0, Math.min(canvas.width - 1, Math.floor((x - rect.left) / rect.width * canvas.width)));
        const relY = Math.max(0, Math.min(canvas.height - 1, Math.floor((y - rect.top) / rect.height * canvas.height)));
        
        try {
            const imageData = ctx.getImageData(relX, relY, 1, 1);
            const [r, g, b, a] = imageData.data;
            
            // If alpha is 0, return transparent
            if (a === 0) {
                return null;
            }
            
            return `rgb(${r}, ${g}, ${b})`;
        } catch (dataError) {
            console.log('Error getting image data:', dataError);
            return null;
        }
    } catch (e) {
        console.log('Error getting color from image:', e);
        return null;
    }
}

function getColorFromCanvas(canvas, x, y) {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }
        
        const rect = canvas.getBoundingClientRect();
        const relX = Math.max(0, Math.min(canvas.width - 1, Math.floor((x - rect.left) * (canvas.width / rect.width))));
        const relY = Math.max(0, Math.min(canvas.height - 1, Math.floor((y - rect.top) * (canvas.height / rect.height))));
        
        try {
            const imageData = ctx.getImageData(relX, relY, 1, 1);
            const [r, g, b, a] = imageData.data;
            
            // If alpha is 0, return transparent
            if (a === 0) {
                return null;
            }
            
            return `rgb(${r}, ${g}, ${b})`;
        } catch (dataError) {
            console.log('Error getting canvas image data:', dataError);
            return null;
        }
    } catch (e) {
        console.log('Error getting color from canvas:', e);
        return null;
    }
}

function getAverageColorFromBackgroundImage(element, style) {
    // This is a simplified approach for background images
    // In practice, extracting color from background-image is complex
    return null;
}

function parseColor(colorString) {
    if (!colorString || colorString === 'transparent') {
        return { hex: '#ffffff', rgb: 'rgb(255, 255, 255)', hsl: 'hsl(0, 0%, 100%)' };
    }
    
    // Direct RGB parsing
    let rgbMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        const hex = rgbToHex(r, g, b);
        const hsl = rgbToHsl(r, g, b);
        
        return {
            hex: hex,
            rgb: `rgb(${r}, ${g}, ${b})`,
            hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
        };
    }
    
    // Direct HEX parsing
    const hexMatch = colorString.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        const hsl = rgbToHsl(r, g, b);
        
        return {
            hex: '#' + hex,
            rgb: `rgb(${r}, ${g}, ${b})`,
            hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
        };
    }
    
    // HSL parsing
    const hslMatch = colorString.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*[\d.]+)?\)/);
    if (hslMatch) {
        const h = parseInt(hslMatch[1]);
        const s = parseInt(hslMatch[2]);
        const l = parseInt(hslMatch[3]);
        
        const rgb = hslToRgb(h, s, l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        
        return {
            hex: hex,
            rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            hsl: `hsl(${h}, ${s}%, ${l}%)`
        };
    }
    
    // Named colors parsing using temporary element
    try {
        const tempElement = document.createElement('div');
        tempElement.style.color = colorString;
        tempElement.style.display = 'none';
        document.body.appendChild(tempElement);
        
        const computedColor = window.getComputedStyle(tempElement).color;
        document.body.removeChild(tempElement);
        
        // Parse the computed RGB values
        rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            
            const hex = rgbToHex(r, g, b);
            const hsl = rgbToHsl(r, g, b);
            
            return {
                hex: hex,
                rgb: `rgb(${r}, ${g}, ${b})`,
                hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
            };
        }
    } catch (e) {
        console.log('Error parsing color:', e);
    }
    
    return { hex: '#ffffff', rgb: 'rgb(255, 255, 255)', hsl: 'hsl(0, 0%, 100%)' };
}

function hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;
    
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function rgbToHex(r, g, b) {
    const componentToHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
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

function showColorPickedNotification(color) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1000001;
        font-family: Arial, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        <div style="width: 30px; height: 30px; background-color: ${color.hex}; border-radius: 4px; border: 1px solid #ddd;"></div>
        <div>
            <div style="font-weight: bold;">Color Picked!</div>
            <div style="color: #666; font-size: 12px;">${color.hex}</div>
        </div>
    `;
    
    // Add animation keyframes
    if (!document.getElementById('color-picker-animations')) {
        const style = document.createElement('style');
        style.id = 'color-picker-animations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function stopColorPicking() {
    isColorPickingActive = false;
    
    // Remove event listeners first
    document.removeEventListener('keydown', handleKeyDown);
    
    // Remove overlay and cursor
    if (colorPickingOverlay) {
        colorPickingOverlay.removeEventListener('mousemove', handleMouseMove);
        colorPickingOverlay.removeEventListener('click', handleClick);
        colorPickingOverlay.remove();
        colorPickingOverlay = null;
    }
    
    if (colorPickingCursor) {
        colorPickingCursor.remove();
        colorPickingCursor = null;
    }
    
    if (colorPickingCanvas) {
        colorPickingCanvas.remove();
        colorPickingCanvas = null;
    }
    
    // Remove color preview window
    if (colorPreviewWindow) {
        colorPreviewWindow.remove();
        colorPreviewWindow = null;
    }
    
    // Remove color info display (fallback)
    const colorInfo = document.getElementById('color-info-display');
    if (colorInfo) {
        colorInfo.remove();
    }
    
    // Reset cursor
    document.body.style.cursor = '';
}