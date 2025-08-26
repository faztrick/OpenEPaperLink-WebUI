/**
 * Universal Header Loader
 * This script loads the universal header into any page
 * Usage: Include this script in all HTML pages to automatically load consistent header
 */

(function () {
    'use strict';

    // Configuration
    const HEADER_FILE = 'universal-header.html';
    const HEADER_PLACEHOLDER = 'universal-header-placeholder';

    // Function to load header content
    async function loadUniversalHeader() {
        try {
            // Check if header already exists
            if (document.querySelector('header.advanced-header.compact-header')) {
                console.log('Universal header already exists');
                return;
            }

            // Find placeholder or create one
            let placeholder = document.getElementById(HEADER_PLACEHOLDER);
            if (!placeholder) {
                // Look for existing header to replace
                const existingHeader = document.querySelector('header');
                if (existingHeader) {
                    placeholder = document.createElement('div');
                    placeholder.id = HEADER_PLACEHOLDER;
                    existingHeader.parentNode.insertBefore(placeholder, existingHeader);
                    existingHeader.remove();
                } else {
                    // Insert at the beginning of body
                    placeholder = document.createElement('div');
                    placeholder.id = HEADER_PLACEHOLDER;
                    document.body.insertBefore(placeholder, document.body.firstChild);
                }
            }

            // Fetch header content
            const response = await fetch(HEADER_FILE);
            if (!response.ok) {
                throw new Error(`Failed to load header: ${response.status}`);
            }

            const headerHTML = await response.text();
            placeholder.outerHTML = headerHTML;

            console.log('Universal header loaded successfully');

            // Trigger custom event for other scripts
            window.dispatchEvent(new CustomEvent('universalHeaderLoaded'));

        } catch (error) {
            console.error('Error loading universal header:', error);

            // Fallback: create a basic header
            createFallbackHeader();
        }
    }

    // Fallback header creation
    function createFallbackHeader() {
        const placeholder = document.getElementById(HEADER_PLACEHOLDER);
        if (!placeholder) return;

        const fallbackHeader = `
            <header class="advanced-header compact-header">
                <div class="compact-header-content">
                    <div class="header-left">
                        <div class="logo-section">
                            <div class="logo-icon">⚡</div>
                            <div class="logo-text">
                                <h1>OpenEPL ESP32</h1>
                                <span class="version">v3.1</span>
                            </div>
                        </div>
                    </div>
                    <div class="header-status">
                        <div class="status-item">
                            <div class="status-dot" id="systemDot"></div>
                            <span id="systemStatus">Ready</span>
                        </div>
                        <div class="status-item">
                            <span class="material-symbols-outlined" style="font-size: 12px;">devices</span>
                            <span id="tagCount">Tags</span>
                        </div>
                        <div class="status-item">
                            <span class="material-symbols-outlined" style="font-size: 12px;">wifi</span>
                            <span id="wifiStatus">WiFi</span>
                        </div>
                        <div class="status-item">
                            <span class="material-symbols-outlined" style="font-size: 12px;">schedule</span>
                            <span id="uptimeDisplay">--:--</span>
                        </div>
                    </div>
                    <div id="menu-container" class="menu-container"></div>
                </div>
            </header>
        `;

        placeholder.outerHTML = fallbackHeader;
        console.log('Fallback header created');
    }

    // Load header when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUniversalHeader);
    } else {
        loadUniversalHeader();
    }

    // Expose function globally
    window.loadUniversalHeader = loadUniversalHeader;
})();
