/**
 * Utility Functions - Common helper functions for OpenEPL ESP32 Web UI
 * Reduces code duplication and provides consistent utility methods
 */

// DOM Utilities
const DOMUtils = {
    /**
     * Shorthand for document.getElementById
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    $(id) {
        return document.getElementById(id);
    },

    /**
     * Shorthand for document.querySelector
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null}
     */
    qs(selector) {
        return document.querySelector(selector);
    },

    /**
     * Shorthand for document.querySelectorAll
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    qsa(selector) {
        return document.querySelectorAll(selector);
    },

    /**
     * Create element with optional attributes and content
     * @param {string} tag - Tag name
     * @param {Object} attrs - Attributes object
     * @param {string|HTMLElement} content - Inner content
     * @returns {HTMLElement}
     */
    createElement(tag, attrs = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        if (content) {
            if (typeof content === 'string') {
                element.innerHTML = content;
            } else {
                element.appendChild(content);
            }
        }

        return element;
    },

    /**
     * Show/hide element with optional animation
     * @param {HTMLElement|string} element - Element or ID
     * @param {boolean} show - Show or hide
     * @param {string} animation - Animation class
     */
    toggleVisibility(element, show, animation = '') {
        const el = typeof element === 'string' ? this.$(element) : element;
        if (!el) return;

        if (show) {
            el.style.display = '';
            if (animation) el.classList.add(animation);
        } else {
            if (animation) {
                el.classList.add(animation);
                setTimeout(() => {
                    el.style.display = 'none';
                    el.classList.remove(animation);
                }, 300);
            } else {
                el.style.display = 'none';
            }
        }
    }
};

// String Utilities
const StringUtils = {
    /**
     * Capitalize first letter of string
     * @param {string} str 
     * @returns {string}
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Convert camelCase to kebab-case
     * @param {string} str 
     * @returns {string}
     */
    camelToKebab(str) {
        return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
    },

    /**
     * Convert kebab-case to camelCase
     * @param {string} str 
     * @returns {string}
     */
    kebabToCamel(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    },

    /**
     * Truncate string with ellipsis
     * @param {string} str 
     * @param {number} length 
     * @returns {string}
     */
    truncate(str, length) {
        return str.length > length ? str.substring(0, length) + '...' : str;
    },

    /**
     * Format MAC address
     * @param {string} mac 
     * @returns {string}
     */
    formatMAC(mac) {
        if (!mac) return '';
        return mac.match(/.{2}/g)?.join(':').toUpperCase() || mac;
    },

    /**
     * Generate unique ID
     * @param {string} prefix 
     * @returns {string}
     */
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};

// Number Utilities
const NumberUtils = {
    /**
     * Format bytes to human readable format
     * @param {number} bytes 
     * @param {number} decimals 
     * @returns {string}
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    /**
     * Format duration in milliseconds to human readable
     * @param {number} ms 
     * @returns {string}
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    },

    /**
     * Clamp number between min and max
     * @param {number} num 
     * @param {number} min 
     * @param {number} max 
     * @returns {number}
     */
    clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    },

    /**
     * Round to specified decimal places
     * @param {number} num 
     * @param {number} decimals 
     * @returns {number}
     */
    round(num, decimals = 2) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }
};

// Date Utilities
const DateUtils = {
    /**
     * Format timestamp to readable string
     * @param {number|Date} timestamp 
     * @returns {string}
     */
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    },

    /**
     * Get relative time string (e.g., "2 minutes ago")
     * @param {number|Date} timestamp 
     * @returns {string}
     */
    getRelativeTime(timestamp) {
        const now = Date.now();
        const then = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
        const diff = now - then;

        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
        return `${Math.floor(diff / 86400000)} days ago`;
    }
};

// Storage Utilities
const StorageUtils = {
    /**
     * Safe localStorage get with default value
     * @param {string} key 
     * @param {any} defaultValue 
     * @returns {any}
     */
    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.warn(`Failed to get localStorage item '${key}':`, error);
            return defaultValue;
        }
    },

    /**
     * Safe localStorage set
     * @param {string} key 
     * @param {any} value 
     * @returns {boolean}
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`Failed to set localStorage item '${key}':`, error);
            return false;
        }
    },

    /**
     * Remove localStorage item
     * @param {string} key 
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`Failed to remove localStorage item '${key}':`, error);
        }
    },

    /**
     * Clear all localStorage items with prefix
     * @param {string} prefix 
     */
    clearWithPrefix(prefix) {
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
            keys.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.warn(`Failed to clear localStorage with prefix '${prefix}':`, error);
        }
    }
};

// Validation Utilities
const ValidationUtils = {
    /**
     * Validate email address
     * @param {string} email 
     * @returns {boolean}
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    /**
     * Validate IP address
     * @param {string} ip 
     * @returns {boolean}
     */
    isValidIP(ip) {
        const re = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return re.test(ip);
    },

    /**
     * Validate MAC address
     * @param {string} mac 
     * @returns {boolean}
     */
    isValidMAC(mac) {
        const re = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return re.test(mac);
    },

    /**
     * Validate port number
     * @param {number|string} port 
     * @returns {boolean}
     */
    isValidPort(port) {
        const num = parseInt(port, 10);
        return num >= 1 && num <= 65535;
    }
};

// Performance Utilities
const PerformanceUtils = {
    /**
     * Debounce function execution
     * @param {Function} func 
     * @param {number} wait 
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function execution
     * @param {Function} func 
     * @param {number} limit 
     * @returns {Function}
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Measure function execution time
     * @param {Function} func 
     * @param {string} label 
     * @returns {any}
     */
    measureTime(func, label = 'Execution') {
        const start = performance.now();
        const result = func();
        const end = performance.now();
        console.log(`${label} took ${end - start} milliseconds`);
        return result;
    }
};

// Export utilities
window.Utils = {
    DOM: DOMUtils,
    String: StringUtils,
    Number: NumberUtils,
    Date: DateUtils,
    Storage: StorageUtils,
    Validation: ValidationUtils,
    Performance: PerformanceUtils
};

// Legacy compatibility
window.$ = DOMUtils.$;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DOMUtils,
        StringUtils,
        NumberUtils,
        DateUtils,
        StorageUtils,
        ValidationUtils,
        PerformanceUtils
    };
}