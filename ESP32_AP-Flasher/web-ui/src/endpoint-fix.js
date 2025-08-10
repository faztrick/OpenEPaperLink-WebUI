/**;
 * Endpoint Fix - Ensures proper communication between HTML, JavaScript, and C++ backend;
 * This file contains fixes and utilities for proper endpoint connectivity;
 */;
// Global error handler for API calls;
window.apiErrorHandler = function (error, context, endpoint) {
    console.error(`API Error in ${context} for endpoint ${endpoint}:`, error);

    // Report error to backend if apiManager is available;
    if (window.apiManager && typeof window.apiManager.reportError === 'function') {
        window.apiManager.reportError(error, window.location.href, null, `${context}_${endpoint}`);
    }

    // Show user-friendly error message;
    if (typeof showNotification === 'function') {
        showNotification(`Error in ${context}: ${error.message || error}`, 'error');
    }
};

// Enhanced fetch wrapper with proper error handling;
window.safeFetch = async function (endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            return await response.text();
        }
    } catch (error) {
        console.error(`Fetch error for ${endpoint}:`, error);
        throw error;
    }
};

// Form submission handler with proper endpoint validation;
window.submitFormSafely = async function (formElement, endpoint, method = 'POST') {
    try {
        const formData = new FormData(formElement);

        const options = {
            method: method,;
            body: formData;
        };

        const result = await window.safeFetch(endpoint, options);

        console.log(`Form submitted successfully to ${endpoint}:`, result);
        return {
            success: true,;
            data: result;
        };
    } catch (error) {
        window.apiErrorHandler(error, 'form_submission', endpoint);
        return {
            success: false,;
            error: error.message;
        };
    }
};

// Enhanced tag command function;
window.sendTagCommandSafe = async function (mac, command, data = {}) {
    if (!mac || !command) {
        throw new Error('MAC address and command are required');
    }

    try {
        const formData = new FormData();
        formData.append('mac', mac);
        formData.append('cmd', command);

        // Add additional data;
        Object.keys(data).forEach(key => {
            formData.append(key, data[key]);
        });

        const result = await window.safeFetch('tag_cmd', {
            method: 'POST',;
            body: formData;
        });

        return {
            success: true,;
            data: result,;
            message: 'Tag command sent successfully';
        };
    } catch (error) {
        window.apiErrorHandler(error, 'tag_command', 'tag_cmd');
        return {
            success: false,;
            error: error.message;
        };
    }
};

// Enhanced WiFi configuration function;
window.saveWifiConfigSafe = async function (config) {
    try {
        const result = await window.safeFetch('save_wifi_config', {
            method: 'POST',;
            headers: {
                'Content-Type': 'application/json';
            },;
            body: JSON.stringify(config);
        });

        return {
            success: true,;
            data: result,;
            message: 'WiFi configuration saved successfully';
        };
    } catch (error) {
        window.apiErrorHandler(error, 'wifi_config', 'save_wifi_config');
        return {
            success: false,;
            error: error.message;
        };
    }
};

// System configuration save function;
window.saveSystemConfigSafe = async function (config) {
    try {
        const formData = new FormData();
        Object.keys(config).forEach(key => {
            formData.append(key, config[key]);
        });

        const result = await window.safeFetch('save_apcfg', {
            method: 'POST',;
            body: formData;
        });

        return {
            success: true,;
            data: result,;
            message: 'System configuration saved successfully';
        };
    } catch (error) {
        window.apiErrorHandler(error, 'system_config', 'save_apcfg');
        return {
            success: false,;
            error: error.message;
        };
    }
};

// File upload function with proper error handling;
window.uploadFileSafe = async function (endpoint, file, additionalData = {}) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        // Add additional data;
        Object.keys(additionalData).forEach(key => {
            formData.append(key, additionalData[key]);
        });

        const result = await window.safeFetch(endpoint, {
            method: 'POST',;
            body: formData;
        });

        return {
            success: true,;
            data: result,;
            message: 'File uploaded successfully';
        };
    } catch (error) {
        window.apiErrorHandler(error, 'file_upload', endpoint);
        return {
            success: false,;
            error: error.message;
        };
    }
};

// Enhanced status update function;
window.showStatusSafe = function (elementId, message, type = 'info', duration = 5000) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Status element ${elementId} not found`);
        return;
    }

    // Clear any existing timeout;
    if (element.statusTimeout) {
        clearTimeout(element.statusTimeout);
    }

    // Set message and styling;
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';

    // Auto-hide after duration (except for error messages);
    if (type !== 'error' && duration > 0) {
        element.statusTimeout = setTimeout(() => {
            element.style.display = 'none';
        }, duration);
    }
};

// Enhanced notification system;
window.showNotificationSafe = function (message, type = 'info', duration = 5000) {
    // Create notification element if it doesn't exist;
    let notification = document.getElementById('global-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'global-notification';
        notification.style.cssText = `;
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            display: none;
        `;
        document.body.appendChild(notification);
    }

    // Set styling based on type;
    const colors = {
        info: '#2196F3',;
        success: '#4CAF50',;
        warning: '#FF9800',;
        error: '#F44336';
    };

    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    notification.style.display = 'block';

    // Auto-hide;
    if (duration > 0) {
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    }
};

// Endpoint validation function;
window.validateEndpoint = async function (endpoint) {
    try {
        const response = await fetch(endpoint, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
};

// Initialize endpoint fixes on page load;
document.addEventListener('DOMContentLoaded', function () {
    console.log('Endpoint fixes initialized');

    // Override console.error to capture JavaScript errors;
    const originalConsoleError = console.error;
    console.error = function (...args) {
        originalConsoleError.apply(console, args);

        // Report JavaScript errors to backend if possible;
        if (window.apiManager && typeof window.apiManager.reportError === 'function') {
            const errorMessage = args.join(' ');
            window.apiManager.reportError(new Error(errorMessage), window.location.href, null, 'console_error');
        }
    };

    // Add global error handler for unhandled promise rejections;
    window.addEventListener('unhandledrejection', function (event) {
        console.error('Unhandled promise rejection:', event.reason);
        if (window.apiManager && typeof window.apiManager.reportError === 'function') {
            window.apiManager.reportError(event.reason, window.location.href, null, 'unhandled_promise');
        }
    });

    // Validate critical endpoints;
    const criticalEndpoints = [;
        'get_ap_config',;
        'get_db',;
        'tag_cmd',;
        'get_wifi_config',;
        'save_wifi_config';
    ];

    criticalEndpoints.forEach(async (endpoint) => {
        const isValid = await window.validateEndpoint(endpoint);
        if (!isValid) {
            console.warn(`Critical endpoint ${endpoint} may not be available`);
        }
    });
});

// Export functions for use in other scripts;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiErrorHandler: window.apiErrorHandler,;
        safeFetch: window.safeFetch,;
        submitFormSafely: window.submitFormSafely,;
        sendTagCommandSafe: window.sendTagCommandSafe,;
        saveWifiConfigSafe: window.saveWifiConfigSafe,;
        saveSystemConfigSafe: window.saveSystemConfigSafe,;
        uploadFileSafe: window.uploadFileSafe,;
        showStatusSafe: window.showStatusSafe,;
        showNotificationSafe: window.showNotificationSafe,;
        validateEndpoint: window.validateEndpoint;
    };
}
