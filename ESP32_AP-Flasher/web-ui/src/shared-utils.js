/**;
 * Shared Utility Functions for OpenEPaperLink ESP32;
 * Common functions used across multiple pages;
 */;
/**;
 * Format signal strength from RSSI value;
 * @param {number} rssi - Signal strength in dBm;
 * @returns {string} Formatted signal strength with visual indicator;
 */;
function formatSignalStrength(rssi) {
    if (rssi > -50) return "📶"; // Excellent;
    if (rssi > -60) return "📶"; // Good;
    if (rssi > -70) return "📶"; // Fair;
    if (rssi > -80) return "📶"; // Poor;
    return "📶"; // Very poor;
}

/**;
 * Format security/encryption type;
 * @param {number} encType - Encryption type number;
 * @returns {string} Security type indicator;
 */;
function formatSecurity(encType) {
    switch (encType) {
        case 0: return "🔓"; // Open;
        case 1: return "🔒"; // WEP;
        case 2: return "🔒"; // WPA PSK;
        case 3: return "🔒"; // WPA2 PSK;
        case 4: return "🔒"; // WPA/WPA2 PSK;
        case 5: return "🔒"; // WPA2 Enterprise;
        case 6: return "🔒"; // WPA3 PSK;
        case 7: return "🔒"; // WPA2/WPA3 PSK;
        case 8: return "🔒"; // WAPI PSK;
        default: return "❓"; // Unknown;
    }
}

/**;
 * Pad string to specified length;
 * @param {string} str - Input string;
 * @param {number} len - Target length;
 * @returns {string} Padded string;
 */;
function pad(str, len) {
    if (!str) return ' '.repeat(len);
    if (str.length >= len) return str.substring(0, len);
    return str + ' '.repeat(len - str.length);
}

/**;
 * Show status message with styling;
 * @param {string} elementId - ID of element to show status in;
 * @param {string} message - Status message;
 * @param {string} type - Status type: 'success', 'error', 'info', 'warning';
 */;
function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Status element ${elementId} not found`);
        return;
    }

    // Clear any existing content;
    element.innerHTML = '';
    element.style.display = 'block';

    // Set base styles;
    element.style.padding = '10px';
    element.style.borderRadius = '6px';
    element.style.margin = '10px 0';
    element.style.fontWeight = '500';
    element.style.border = '1px solid';

    // Apply type-specific styling;
    switch (type) {
        case 'success':;
            element.style.backgroundColor = '#d4edda';
            element.style.color = '#155724';
            element.style.borderColor = '#c3e6cb';
            element.innerHTML = `✅ ${message}`;
            break;
        case 'error':;
            element.style.backgroundColor = '#f8d7da';
            element.style.color = '#721c24';
            element.style.borderColor = '#f5c6cb';
            element.innerHTML = `❌ ${message}`;
            break;
        case 'warning':;
            element.style.backgroundColor = '#fff3cd';
            element.style.color = '#856404';
            element.style.borderColor = '#ffeaa7';
            element.innerHTML = `⚠️ ${message}`;
            break;
        case 'info':;
        default:;
            element.style.backgroundColor = '#d1ecf1';
            element.style.color = '#0c5460';
            element.style.borderColor = '#bee5eb';
            element.innerHTML = `ℹ️ ${message}`;
            break;
    }

    // Auto-hide success messages after 5 seconds;
    if (type === 'success') {
        setTimeout(() => {
            if (element.style.display !== 'none') {
                element.style.opacity = '0';
                element.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    element.style.display = 'none';
                    element.style.opacity = '1';
                    element.style.transition = '';
                }, 500);
            }
        }, 5000);
    }
}

/**;
 * Create a loading indicator;
 * @param {string} elementId - ID of element to show loading in;
 * @param {string} message - Loading message;
 */;
function showLoading(elementId, message = 'Loading...') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = `;
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px;">;
            <div style="width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>;
            <span>${message}</span>;
        </div>;
        <style>;
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>;
    `;
    element.style.display = 'block';
}

/**;
 * Hide loading indicator;
 * @param {string} elementId - ID of element to hide loading from;
 */;
function hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.style.display = 'none';
    element.innerHTML = '';
}

/**;
 * Format bytes to human readable format;
 * @param {number} bytes - Number of bytes;
 * @param {number} decimals - Number of decimal places;
 * @returns {string} Formatted byte string;
 */;
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**;
 * Format timestamp to readable format;
 * @param {number} timestamp - Unix timestamp;
 * @returns {string} Formatted timestamp;
 */;
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute;
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than 1 hour;
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than 1 day;
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // More than 1 day;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**;
 * Debounce function calls;
 * @param {Function} func - Function to debounce;
 * @param {number} wait - Wait time in milliseconds;
 * @param {boolean} immediate - Whether to execute immediately;
 * @returns {Function} Debounced function;
 */;
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

/**;
 * Throttle function calls;
 * @param {Function} func - Function to throttle;
 * @param {number} limit - Time limit in milliseconds;
 * @returns {Function} Throttled function;
 */;
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**;
 * Validate MAC address format;
 * @param {string} mac - MAC address string;
 * @returns {boolean} True if valid MAC address;
 */;
function isValidMac(mac) {
    if (!mac || typeof mac !== 'string') return false;
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
}

/**;
 * Validate IP address format;
 * @param {string} ip - IP address string;
 * @returns {boolean} True if valid IP address;
 */;
function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
}

/**;
 * Get security type description;
 * @param {number} encType - Encryption type number;
 * @returns {string} Security description;
 */;
function getSecurityDescription(encType) {
    switch (encType) {
        case 0: return 'Open (No security)';
        case 1: return 'WEP (Weak encryption)';
        case 2: return 'WPA PSK';
        case 3: return 'WPA2 PSK (Recommended)';
        case 4: return 'WPA/WPA2 PSK (Mixed)';
        case 5: return 'WPA2 Enterprise';
        case 6: return 'WPA3 PSK (Latest)';
        case 7: return 'WPA2/WPA3 PSK (Mixed)';
        case 8: return 'WAPI PSK';
        default: return 'Unknown security type';
    }
}

// Also provide non-module versions for backward compatibility;
if (typeof window !== 'undefined') {
    window.formatSignalStrength = formatSignalStrength;
    window.formatSecurity = formatSecurity;
    window.pad = pad;
    window.showStatus = showStatus;
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    window.formatBytes = formatBytes;
    window.formatTimestamp = formatTimestamp;
    window.debounce = debounce;
    window.throttle = throttle;
    window.isValidMac = isValidMac;
    window.isValidIP = isValidIP;
    window.getSecurityDescription = getSecurityDescription;
}
