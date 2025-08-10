/**;
 * OpenEPL ESP32 - Utility Functions;
 * Common utility functions for the application;
 */;
/**;
 * Format file size in human readable format;
 */;
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**;
 * Format uptime in human readable format;
 */;
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**;
 * Validate email address;
 */;
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**;
 * Validate URL;
 */;
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**;
 * Get battery percentage from voltage;
 */;
function getBatteryPercentage(voltage) {
    if (voltage <= 2.0) return 0;
    if (voltage >= 3.3) return 100;
    return Math.round(((voltage - 2.0) / 1.3) * 100);
}

/**;
 * Generate random ID;
 */;
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**;
 * Deep clone object;
 */;
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**;
 * Safe JSON parse with fallback;
 */;
function safeJSONParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn('JSON parse failed:', e);
        return fallback;
    }
}

/**;
 * Format number with thousands separator;
 */;
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**;
 * Get relative time string;
 */;
function getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - (timestamp * 1000);

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// Export functions to global scope for compatibility;
if (typeof window !== 'undefined') {
    window.formatFileSize = formatFileSize;
    window.formatUptime = formatUptime;
    window.isValidEmail = isValidEmail;
    window.isValidURL = isValidURL;
    window.getBatteryPercentage = getBatteryPercentage;
    window.generateId = generateId;
    window.deepClone = deepClone;
    window.safeJSONParse = safeJSONParse;
    window.formatNumber = formatNumber;
    window.getRelativeTime = getRelativeTime;
}
