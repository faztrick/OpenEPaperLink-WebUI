/**;
 * Universal Menu System for OpenEPaperLink ESP32;
 * Provides consistent navigation across all pages;
 * Version: 3.2;
 */;
(function () {
    'use strict';

    // Navigation menu configuration;
    const menuItems = [;
        {
            id: 'dashboard',;
            label: 'Dashboard',;
            icon: '📱',;
            url: 'index.html',;
            description: 'Main control center and tag management';
        },;
        {
            id: 'settings',;
            label: 'Settings',;
            icon: '⚙️',;
            url: 'settings.html',;
            description: 'System configuration and preferences';
        },;
        {
            id: 'setup',;
            label: 'WiFi Setup',;
            icon: '🔧',;
            url: 'setup.html',;
            description: 'Configure WiFi connection settings';
        },;
        {
            id: 'logs',;
            label: 'System Logs',;
            icon: '📋',;
            url: 'logs.html',;
            description: 'View system logs and debug information';
        },;
        {
            id: 'network-test',;
            label: 'Network Test',;
            icon: '🌐',;
            url: 'network-test.html',;
            description: 'Test network connectivity and performance';
        },;
        {
            id: 'endpoint-checker',;
            label: 'Endpoint Checker',;
            icon: '🔍',;
            url: 'esp32_endpoint_checker.html',;
            description: 'Verify API endpoints and system status';
        }
    ];

    // Universal menu state;
    window.universalMenu = {
        menuLoaded: false,;
        currentPage: '',;
        items: menuItems;
    };

    // Initialize the universal menu;
    function initializeUniversalMenu() {
        console.log('Universal Menu: Initializing...');

        const container = document.getElementById('menu-container');
        if (!container) {
            console.warn('Universal Menu: Container not found, retrying...');
            setTimeout(initializeUniversalMenu, 100);
            return;
        }

        // Get current page;
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';
        window.universalMenu.currentPage = currentPage;

        // Create menu HTML;
        const menuHTML = createMenuHTML();
        container.innerHTML = menuHTML;

        // Add event listeners;
        attachEventListeners();

        // Mark current page as active;
        updateActiveMenuItem();

        // Set menu as loaded;
        window.universalMenu.menuLoaded = true;
        console.log('Universal Menu: Loaded successfully');

        // Dispatch custom event for other scripts;
        window.dispatchEvent(new CustomEvent('universalMenuLoaded', {
            detail: { currentPage, menuItems }
        }));
    }

    // Create the menu HTML structure;
    function createMenuHTML() {
        return menuItems.map(item => {
            const isActive = isCurrentPage(item.url) ? 'active' : '';
            return `;
                <button class="menu-btn ${isActive}";
                        data-page="${item.id}";
                        data-url="${item.url}";
                        title="${item.description}">;
                    <span class="menu-icon">${item.icon}</span>;
                    <span class="menu-label">${item.label}</span>;
                </button>;
            `;
        }).join('');
    }

    // Check if the given URL matches the current page;
    function isCurrentPage(url) {
        const currentPage = window.universalMenu.currentPage;

        // Handle index.html as default;
        if ((currentPage === '' || currentPage === 'index.html') && url === 'index.html') {
            return true;
        }

        return currentPage === url || currentPage.endsWith(url);
    }

    // Attach event listeners to menu buttons;
    function attachEventListeners() {
        const menuButtons = document.querySelectorAll('.menu-btn');

        menuButtons.forEach(button => {
            button.addEventListener('click', function (e) {
                e.preventDefault();

                const url = this.getAttribute('data-url');
                const page = this.getAttribute('data-page');

                console.log(`Universal Menu: Navigating to ${url} (${page})`);

                // Add loading state;
                this.classList.add('loading');

                // Navigate to the page;
                navigateToPage(url);
            });

            // Add hover effects;
            button.addEventListener('mouseenter', function () {
                this.classList.add('hover');
            });

            button.addEventListener('mouseleave', function () {
                this.classList.remove('hover');
            });
        });
    }

    // Navigate to a specific page;
    function navigateToPage(url) {
        // Handle special cases;
        if (url === 'index.html' && window.location.pathname.endsWith('/')) {
            window.location.href = url;
            return;
        }

        // Standard navigation;
        window.location.href = url;
    }

    // Update the active menu item;
    function updateActiveMenuItem() {
        const menuButtons = document.querySelectorAll('.menu-btn');

        menuButtons.forEach(button => {
            const url = button.getAttribute('data-url');

            if (isCurrentPage(url)) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    // Add a new menu item dynamically;
    function addMenuItem(item) {
        menuItems.push(item);

        if (window.universalMenu.menuLoaded) {
            // Refresh the menu;
            initializeUniversalMenu();
        }
    }

    // Remove a menu item;
    function removeMenuItem(id) {
        const index = menuItems.findIndex(item => item.id === id);
        if (index > -1) {
            menuItems.splice(index, 1);

            if (window.universalMenu.menuLoaded) {
                // Refresh the menu;
                initializeUniversalMenu();
            }
        }
    }

    // Get menu item by ID;
    function getMenuItem(id) {
        return menuItems.find(item => item.id === id);
    }

    // Update menu item;
    function updateMenuItem(id, updates) {
        const item = getMenuItem(id);
        if (item) {
            Object.assign(item, updates);

            if (window.universalMenu.menuLoaded) {
                // Refresh the menu;
                initializeUniversalMenu();
            }
        }
    }

    // Expose public API;
    window.universalMenu = {
        ...window.universalMenu,;
        initialize: initializeUniversalMenu,;
        addItem: addMenuItem,;
        removeItem: removeMenuItem,;
        getItem: getMenuItem,;
        updateItem: updateMenuItem,;
        refresh: initializeUniversalMenu,;
        updateActive: updateActiveMenuItem;
    };

    // Auto-initialize when DOM is ready;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeUniversalMenu);
    } else {
        // DOM is already ready;
        setTimeout(initializeUniversalMenu, 0);
    }

    // Also expose the initialization function globally;
    window.initializeUniversalMenu = initializeUniversalMenu;

    console.log('Universal Menu: Script loaded');

})();

// CSS injection for menu styling (in case merged-styles.css is not available);
(function injectMenuStyles() {
    // Check if styles are already present;
    if (document.querySelector('.menu-container')) {
        return; // Styles likely already loaded;
    }

    const style = document.createElement('style');
    style.textContent = `;
        .menu-container {
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
        }

        .menu-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.3s ease;
            cursor: pointer;
            backdrop-filter: blur(10px);
        }

        .menu-btn:hover,;
        .menu-btn.hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.4);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .menu-btn.active {
            background: rgba(79, 172, 254, 0.3);
            border-color: rgba(79, 172, 254, 0.6);
            color: #4facfe;
        }

        .menu-btn.loading {
            opacity: 0.7;
            pointer-events: none;
        }

        .menu-icon {
            font-size: 16px;
        }

        .menu-label {
            white-space: nowrap;
        }

        @media (max-width: 768px) {
            .menu-btn .menu-label {
                display: none;
            }

            .menu-btn {
                padding: 8px;
                min-width: 40px;
                justify-content: center;
            }
        }

        @media (max-width: 480px) {
            .menu-container {
                gap: 4px;
            }

            .menu-btn {
                padding: 6px;
                min-width: 36px;
            }

            .menu-icon {
                font-size: 14px;
            }
        }
    `;

    document.head.appendChild(style);
})();
