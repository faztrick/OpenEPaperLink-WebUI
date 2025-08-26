/**
 * Endpoint Fix - Ensures proper communication between HTML, JavaScript, and C++ backend
 * This file contains fixes and utilities for proper endpoint connectivity
 */

// Global error handler for API calls
window.apiErrorHandler = function (error, context, endpoint) {
    console.error(`API Error in ${context} for endpoint ${endpoint}:`, error);

    // Report error to backend if apiManager is available
    if (window.apiManager && typeof window.apiManager.reportError === 'function') {
        window.apiManager.reportError(error, window.location.href, null, `${context}_${endpoint}`);
    }

    // Show user-friendly error message
    if (typeof showNotification === 'function') {
        showNotification(`Error in ${context}: ${error.message || error}`, 'error');
    }
};

// Enhanced fetch wrapper with proper error handling
window.safeFetch = async function (endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        window.apiErrorHandler(error, 'safeFetch', endpoint);
        throw error;
    }
};

// Safe form submission wrapper
window.submitFormSafely = async function (formElement, endpoint, method = 'POST') {
    try {
        const formData = new FormData(formElement);
        const response = await window.safeFetch(endpoint, {
            method,
            body: formData
        });

        return await response.json();
    } catch (error) {
        window.apiErrorHandler(error, 'submitForm', endpoint);
        throw error;
    }
};

// Safe tag command wrapper
window.sendTagCommandSafe = async function (command, params = {}) {
    try {
        const response = await window.safeFetch('tag_cmd', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command, ...params })
        });

        return await response.json();
    } catch (error) {
        window.apiErrorHandler(error, 'sendTagCommand', 'tag_cmd');
        throw error;
    }
};

// Safe WiFi config save wrapper
window.saveWifiConfigSafe = async function (config) {
    try {
        const response = await window.safeFetch('save_wifi_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        return await response.json();
    } catch (error) {
        window.apiErrorHandler(error, 'saveWifiConfig', 'save_wifi_config');
        throw error;
    }
};

// Safe system config save wrapper
window.saveSystemConfigSafe = async function (config) {
    try {
        const response = await window.safeFetch('save_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        return await response.json();
    } catch (error) {
        window.apiErrorHandler(error, 'saveSystemConfig', 'save_config');
        throw error;
    }
};

// Safe file upload wrapper
window.uploadFileSafe = async function (file, endpoint = 'upload') {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await window.safeFetch(endpoint, {
            method: 'POST',
            body: formData
        });

        return await response.json();
    } catch (error) {
        window.apiErrorHandler(error, 'uploadFile', endpoint);
        throw error;
    }
};

// Safe status display wrapper
window.showStatusSafe = function (message, type = 'info') {
    try {
        if (typeof showStatus === 'function') {
            showStatus(message, type);
        } else {
            console.log(`Status [${type}]: ${message}`);
        }
    } catch (error) {
        console.error('Error showing status:', error);
    }
};

// Safe notification wrapper
window.showNotificationSafe = function (message, type = 'info') {
    try {
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`Notification [${type}]: ${message}`);
        }
    } catch (error) {
        console.error('Error showing notification:', error);
    }
};

// Endpoint validation utility
window.validateEndpoint = async function (endpoint) {
    try {
        const response = await fetch(endpoint, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.warn(`Endpoint ${endpoint} validation failed:`, error);
        return false;
    }
};

// Initialize endpoint fixes on DOM load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Endpoint fixes initialized');

    // Override console.error to capture JavaScript errors
    const originalConsoleError = console.error;
    console.error = function (...args) {
        originalConsoleError.apply(console, args);

        // Report JavaScript errors to backend if possible
        if (window.apiManager && typeof window.apiManager.reportError === 'function') {
            const errorMessage = args.join(' ');
            window.apiManager.reportError(new Error(errorMessage), window.location.href, null, 'console_error');
        }
    };

    // Add global error handler for unhandled promise rejections
    window.addEventListener('unhandledrejection', function (event) {
        console.error('Unhandled promise rejection:', event.reason);
        if (window.apiManager && typeof window.apiManager.reportError === 'function') {
            window.apiManager.reportError(event.reason, window.location.href, null, 'unhandled_promise');
        }
    });

    // Validate critical endpoints
    const criticalEndpoints = [
        'get_ap_config',
        'get_db',
        'tag_cmd',
        'get_wifi_config',
        'save_wifi_config'
    ];

    criticalEndpoints.forEach(async (endpoint) => {
        const isValid = await window.validateEndpoint(endpoint);
        if (!isValid) {
            console.warn(`Critical endpoint ${endpoint} may not be available`);
        }
    });
});

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiErrorHandler: window.apiErrorHandler,
        safeFetch: window.safeFetch,
        submitFormSafely: window.submitFormSafely,
        sendTagCommandSafe: window.sendTagCommandSafe,
        saveWifiConfigSafe: window.saveWifiConfigSafe,
        saveSystemConfigSafe: window.saveSystemConfigSafe,
        uploadFileSafe: window.uploadFileSafe,
        showStatusSafe: window.showStatusSafe,
        showNotificationSafe: window.showNotificationSafe,
        validateEndpoint: window.validateEndpoint
    };
}