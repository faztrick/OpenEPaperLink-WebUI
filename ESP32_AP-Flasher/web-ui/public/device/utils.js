// OpenEPL ESP32 - Utility Functions
// Contains all utility and helper functions

/**
 * Format uptime seconds into readable string
 */
function formatUptime(seconds) {
    if (seconds < 0) return "Invalid time";
    
    const units = [
        { name: 'year', seconds: 31536000 },
        { name: 'month', seconds: 2592000 },
        { name: 'day', seconds: 86400 },
        { name: 'hour', seconds: 3600 },
        { name: 'minute', seconds: 60 }
    ];
    
    for (const unit of units) {
        const count = Math.floor(seconds / unit.seconds);
        if (count >= 1) {
            return `${count} ${unit.name}${count > 1 ? 's' : ''}`;
        }
    }
    
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Convert bytes to human readable format
 */
function convertSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Display time in human readable format
 */
function displayTime(seconds) {
    if (seconds < 0) return "now";
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

/**
 * HTML encode string to prevent XSS
 */
function htmlEncode(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

/**
 * Format epoch time to readable date
 */
function formatEpoch(epochTime) {
    if (!epochTime || epochTime === 0) return 'Never';
    
    const date = new Date(epochTime * 1000);
    return date.toLocaleString();
}

/**
 * Debounce function to limit function calls
 */
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Load external script dynamically
 */
function loadScript(url, callback) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    
    script.onload = function() {
        if (callback) callback();
    };
    
    script.onerror = function() {
        console.error(`Failed to load script: ${url}`);
        if (callback) callback(new Error(`Failed to load script: ${url}`));
    };
    
    document.head.appendChild(script);
}

/**
 * Process zlib compressed data
 */
function processZlib(data) {
    try {
        // Check if pako is available for zlib decompression
        if (typeof pako !== 'undefined') {
            return pako.inflate(data);
        } else {
            console.warn('pako library not available for zlib decompression');
            return data;
        }
    } catch (error) {
        console.error('Error processing zlib data:', error);
        return data;
    }
}

/**
 * Update element content if different
 */
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) {
        element.textContent = value;
    }
}

/**
 * Show status message to user
 */
function showStatusMessage(message, type = 'info', duration = 5000) {
    // Create or update a simple message display
    let messageEl = $('#statusMessage');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'statusMessage';
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 500;
            backdrop-filter: blur(10px);
            max-width: 400px;
            word-wrap: break-word;
        `;
        document.body.appendChild(messageEl);
    }
    
    // Set colors based on type
    const colors = {
        success: 'rgba(16, 185, 129, 0.9)',
        error: 'rgba(239, 68, 68, 0.9)',
        warning: 'rgba(245, 158, 11, 0.9)',
        info: 'rgba(59, 130, 246, 0.9)'
    };
    
    messageEl.style.background = colors[type] || colors.info;
    messageEl.style.color = 'white';
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    
    // Auto hide after duration
    setTimeout(() => {
        if (messageEl) {
            messageEl.style.display = 'none';
        }
    }, duration);
}

/**
 * Validate MAC address format
 */
function validateMacAddress(mac) {
    const macRegex = /^[0-9A-Fa-f]{12}$/;
    return macRegex.test(mac);
}

/**
 * Format MAC address for display
 */
function formatMacAddress(mac, separator = ':') {
    if (!mac || mac.length !== 12) return mac;
    
    return mac.match(/.{2}/g).join(separator).toUpperCase();
}

/**
 * Clean MAC address input (remove separators)
 */
function cleanMacAddress(mac) {
    return mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

/**
 * Validate hex string
 */
function validateHexString(str, expectedLength) {
    const hexRegex = new RegExp(`^[0-9A-Fa-f]{${expectedLength}}$`);
    return hexRegex.test(str);
}

/**
 * Generate random ID
 */
function generateId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse(jsonString, fallback = {}) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('Failed to parse JSON:', error);
        return fallback;
    }
}

/**
 * Check if element is in viewport
 */
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatUptime,
        convertSize,
        displayTime,
        htmlEncode,
        formatEpoch,
        debounce,
        loadScript,
        processZlib,
        updateElement,
        showStatusMessage,
        validateMacAddress,
        formatMacAddress,
        cleanMacAddress,
        validateHexString,
        generateId,
        safeJsonParse,
        isInViewport
    };
}
