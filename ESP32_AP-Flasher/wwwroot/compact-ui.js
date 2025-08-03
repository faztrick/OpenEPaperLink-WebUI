/**
 * OpenEPL ESP32 - Compact UI Framework
 * Optimized responsive design with modular components
 */

class CompactUIManager {
    constructor() {
        this.components = new Map();
        this.virtualScrollers = new Map();
        this.lazyImages = new Set();
        this.animationFrame = null;
        
        this.breakpoints = {
            mobile: 768,
            tablet: 1024,
            desktop: 1440
        };
        
        this.currentBreakpoint = this.getBreakpoint();
        
        this.initializeUI();
        this.setupResponsive();
        this.setupVirtualScrolling();
        this.setupLazyLoading();
    }

    /**
     * Initialize UI framework
     */
    initializeUI() {
        // Add compact UI classes to body
        document.body.classList.add('compact-ui');
        
        // Initialize performance optimizations
        this.setupRAF();
        this.optimizeScrolling();
        this.setupIntersectionObserver();
        
        // Initialize compact components
        this.initializeCompactHeader();
        this.initializeCompactTabs();
        this.initializeCompactCards();
        this.initializeCompactModals();
    }

    /**
     * Setup responsive design system
     */
    setupResponsive() {
        const mediaQueries = {
            mobile: window.matchMedia(`(max-width: ${this.breakpoints.mobile}px)`),
            tablet: window.matchMedia(`(max-width: ${this.breakpoints.tablet}px)`),
            desktop: window.matchMedia(`(min-width: ${this.breakpoints.desktop}px)`)
        };

        Object.entries(mediaQueries).forEach(([breakpoint, mq]) => {
            mq.addListener(() => this.handleBreakpointChange());
        });

        this.handleBreakpointChange();
    }

    /**
     * Handle breakpoint changes
     */
    handleBreakpointChange() {
        const newBreakpoint = this.getBreakpoint();
        if (newBreakpoint !== this.currentBreakpoint) {
            this.currentBreakpoint = newBreakpoint;
            this.adaptLayout();
        }
    }

    /**
     * Get current breakpoint
     */
    getBreakpoint() {
        const width = window.innerWidth;
        if (width <= this.breakpoints.mobile) return 'mobile';
        if (width <= this.breakpoints.tablet) return 'tablet';
        return 'desktop';
    }

    /**
     * Adapt layout based on breakpoint
     */
    adaptLayout() {
        document.body.setAttribute('data-breakpoint', this.currentBreakpoint);
        
        switch (this.currentBreakpoint) {
            case 'mobile':
                this.enableMobileLayout();
                break;
            case 'tablet':
                this.enableTabletLayout();
                break;
            case 'desktop':
                this.enableDesktopLayout();
                break;
        }
        
        this.emit('breakpoint:change', this.currentBreakpoint);
    }

    /**
     * Enable mobile layout optimizations
     */
    enableMobileLayout() {
        // Collapse side panels
        const sidePanels = document.querySelectorAll('.side-panel');
        sidePanels.forEach(panel => panel.classList.add('collapsed'));
        
        // Enable bottom navigation
        this.enableBottomNavigation();
        
        // Optimize touch interactions
        this.optimizeTouchInteractions();
        
        // Reduce animations on mobile
        document.body.classList.add('reduced-motion');
    }

    /**
     * Enable tablet layout optimizations
     */
    enableTabletLayout() {
        const sidePanels = document.querySelectorAll('.side-panel');
        sidePanels.forEach(panel => panel.classList.remove('collapsed'));
        
        document.body.classList.remove('reduced-motion');
    }

    /**
     * Enable desktop layout optimizations
     */
    enableDesktopLayout() {
        this.disableBottomNavigation();
        document.body.classList.remove('reduced-motion');
    }

    /**
     * Initialize compact header
     */
    initializeCompactHeader() {
        const header = document.querySelector('.advanced-header');
        if (!header) return;

        // Make header collapsible
        let lastScrollY = window.scrollY;
        const scrollThreshold = 100;

        window.addEventListener('scroll', this.throttle(() => {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY > scrollThreshold) {
                if (currentScrollY > lastScrollY) {
                    header.classList.add('header-hidden');
                } else {
                    header.classList.remove('header-hidden');
                }
            } else {
                header.classList.remove('header-hidden');
            }
            
            lastScrollY = currentScrollY;
        }, 16));

        // Compact header on small screens
        if (this.currentBreakpoint === 'mobile') {
            header.classList.add('compact');
        }
    }

    /**
     * Initialize compact tabs
     */
    initializeCompactTabs() {
        const tabContainers = document.querySelectorAll('.simple-tabs, .quick-menu');
        
        tabContainers.forEach(container => {
            if (this.currentBreakpoint === 'mobile') {
                this.makeTabsScrollable(container);
            }
        });
    }

    /**
     * Make tabs horizontally scrollable on mobile
     */
    makeTabsScrollable(container) {
        container.classList.add('scrollable-tabs');
        
        // Add scroll indicators
        const scrollIndicator = document.createElement('div');
        scrollIndicator.className = 'scroll-indicator';
        container.appendChild(scrollIndicator);
        
        // Update scroll indicator
        container.addEventListener('scroll', this.throttle(() => {
            const scrollLeft = container.scrollLeft;
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            const scrollPercent = scrollLeft / (scrollWidth - clientWidth) * 100;
            
            scrollIndicator.style.width = `${scrollPercent}%`;
        }, 16));
    }

    /**
     * Initialize compact cards
     */
    initializeCompactCards() {
        const cards = document.querySelectorAll('.dashboard-card, .glass-card');
        
        cards.forEach(card => {
            this.optimizeCard(card);
        });
    }

    /**
     * Optimize individual cards
     */
    optimizeCard(card) {
        // Add intersection observer for lazy loading
        this.intersectionObserver.observe(card);
        
        // Add compact mode toggle
        const header = card.querySelector('.card-header');
        if (header && this.currentBreakpoint === 'mobile') {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'card-toggle';
            toggleBtn.innerHTML = '<span class="material-symbols-outlined">expand_less</span>';
            toggleBtn.onclick = () => this.toggleCardCollapse(card);
            header.appendChild(toggleBtn);
        }
    }

    /**
     * Toggle card collapse state
     */
    toggleCardCollapse(card) {
        card.classList.toggle('collapsed');
        const toggle = card.querySelector('.card-toggle span');
        if (toggle) {
            toggle.textContent = card.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
        }
    }

    /**
     * Initialize compact modals
     */
    initializeCompactModals() {
        const modals = document.querySelectorAll('dialog, .modal');
        
        modals.forEach(modal => {
            // Make modals fullscreen on mobile
            if (this.currentBreakpoint === 'mobile') {
                modal.classList.add('fullscreen-mobile');
            }
            
            // Add swipe to close on mobile
            if ('ontouchstart' in window) {
                this.addSwipeToClose(modal);
            }
        });
    }

    /**
     * Add swipe to close functionality
     */
    addSwipeToClose(modal) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        modal.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
        });

        modal.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            
            if (diff > 0) {
                modal.style.transform = `translateY(${diff}px)`;
            }
        });

        modal.addEventListener('touchend', () => {
            if (!isDragging) return;
            
            const diff = currentY - startY;
            if (diff > 100) {
                modal.close();
            }
            
            modal.style.transform = '';
            isDragging = false;
        });
    }

    /**
     * Setup virtual scrolling for large lists
     */
    setupVirtualScrolling() {
        const largeContainers = document.querySelectorAll('.taglist, .large-list');
        
        largeContainers.forEach(container => {
            if (container.children.length > 50) {
                this.enableVirtualScrolling(container);
            }
        });
    }

    /**
     * Enable virtual scrolling for container
     */
    enableVirtualScrolling(container) {
        const items = Array.from(container.children);
        const itemHeight = 80; // Estimated item height
        const containerHeight = container.clientHeight;
        const visibleItems = Math.ceil(containerHeight / itemHeight) + 2;
        
        let scrollTop = 0;
        let startIndex = 0;
        
        const virtualContainer = document.createElement('div');
        virtualContainer.className = 'virtual-container';
        virtualContainer.style.height = `${items.length * itemHeight}px`;
        
        const visibleContainer = document.createElement('div');
        visibleContainer.className = 'visible-container';
        
        container.innerHTML = '';
        container.appendChild(virtualContainer);
        virtualContainer.appendChild(visibleContainer);
        
        const updateVisibleItems = this.throttle(() => {
            scrollTop = container.scrollTop;
            startIndex = Math.floor(scrollTop / itemHeight);
            
            const endIndex = Math.min(startIndex + visibleItems, items.length);
            
            visibleContainer.innerHTML = '';
            visibleContainer.style.transform = `translateY(${startIndex * itemHeight}px)`;
            
            for (let i = startIndex; i < endIndex; i++) {
                if (items[i]) {
                    visibleContainer.appendChild(items[i].cloneNode(true));
                }
            }
        }, 16);
        
        container.addEventListener('scroll', updateVisibleItems);
        updateVisibleItems();
        
        this.virtualScrollers.set(container, { updateVisibleItems });
    }

    /**
     * Setup lazy loading for images
     */
    setupLazyLoading() {
        const images = document.querySelectorAll('img[data-src], canvas[data-lazy]');
        
        images.forEach(img => {
            this.intersectionObserver.observe(img);
            this.lazyImages.add(img);
        });
    }

    /**
     * Setup intersection observer
     */
    setupIntersectionObserver() {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.handleIntersection(entry.target);
                }
            });
        }, {
            rootMargin: '50px'
        });
    }

    /**
     * Handle intersection observer events
     */
    handleIntersection(element) {
        // Lazy load images
        if (this.lazyImages.has(element)) {
            this.loadLazyImage(element);
            this.lazyImages.delete(element);
            this.intersectionObserver.unobserve(element);
        }
        
        // Load card content
        if (element.classList.contains('dashboard-card') && !element.dataset.loaded) {
            this.loadCardContent(element);
            element.dataset.loaded = 'true';
        }
    }

    /**
     * Load lazy image
     */
    loadLazyImage(img) {
        if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        }
        
        if (img.dataset.lazy) {
            // Handle canvas lazy loading
            const canvasLoader = img.dataset.lazy;
            if (window[canvasLoader]) {
                window[canvasLoader](img);
            }
            img.removeAttribute('data-lazy');
        }
    }

    /**
     * Load card content dynamically
     */
    loadCardContent(card) {
        const contentLoader = card.dataset.contentLoader;
        if (contentLoader && window[contentLoader]) {
            window[contentLoader](card);
        }
    }

    /**
     * Setup bottom navigation for mobile
     */
    enableBottomNavigation() {
        let bottomNav = document.querySelector('.bottom-navigation');
        
        if (!bottomNav) {
            bottomNav = document.createElement('nav');
            bottomNav.className = 'bottom-navigation';
            
            const navItems = [
                { icon: 'dashboard', label: 'Dashboard', tab: 'enhancedhome' },
                { icon: 'sell', label: 'Tags', tab: 'tagtab' },
                { icon: 'settings', label: 'Config', tab: 'configtab' },
                { icon: 'text_snippet', label: 'Logs', tab: 'logtab' }
            ];
            
            navItems.forEach(item => {
                const navItem = document.createElement('button');
                navItem.className = 'nav-item';
                navItem.innerHTML = `
                    <span class="material-symbols-outlined">${item.icon}</span>
                    <span class="nav-label">${item.label}</span>
                `;
                navItem.onclick = () => openTab(null, item.tab);
                bottomNav.appendChild(navItem);
            });
            
            document.body.appendChild(bottomNav);
        }
        
        bottomNav.style.display = 'flex';
    }

    /**
     * Disable bottom navigation
     */
    disableBottomNavigation() {
        const bottomNav = document.querySelector('.bottom-navigation');
        if (bottomNav) {
            bottomNav.style.display = 'none';
        }
    }

    /**
     * Optimize touch interactions
     */
    optimizeTouchInteractions() {
        // Add touch feedback
        const touchElements = document.querySelectorAll('button, .menu-btn, .tab-btn');
        
        touchElements.forEach(element => {
            element.addEventListener('touchstart', function() {
                this.classList.add('touch-active');
            });
            
            element.addEventListener('touchend', function() {
                setTimeout(() => this.classList.remove('touch-active'), 150);
            });
        });
    }

    /**
     * Setup RequestAnimationFrame optimization
     */
    setupRAF() {
        this.rafCallbacks = [];
        this.isRAFRunning = false;
        
        this.startRAF();
    }

    /**
     * Start RAF loop
     */
    startRAF() {
        if (this.isRAFRunning) return;
        
        this.isRAFRunning = true;
        const rafLoop = () => {
            if (this.rafCallbacks.length > 0) {
                this.rafCallbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (error) {
                        console.error('RAF callback error:', error);
                    }
                });
                this.rafCallbacks = [];
            }
            
            if (this.isRAFRunning) {
                requestAnimationFrame(rafLoop);
            }
        };
        
        requestAnimationFrame(rafLoop);
    }

    /**
     * Add callback to RAF queue
     */
    addToRAF(callback) {
        this.rafCallbacks.push(callback);
    }

    /**
     * Optimize scrolling performance
     */
    optimizeScrolling() {
        let isScrolling = false;
        
        window.addEventListener('scroll', () => {
            if (!isScrolling) {
                this.addToRAF(() => {
                    this.handleScroll();
                    isScrolling = false;
                });
                isScrolling = true;
            }
        }, { passive: true });
    }

    /**
     * Handle scroll events
     */
    handleScroll() {
        const scrollY = window.scrollY;
        
        // Update scroll-dependent elements
        this.updateScrollElements(scrollY);
        
        // Emit scroll event
        this.emit('scroll', scrollY);
    }

    /**
     * Update elements based on scroll position
     */
    updateScrollElements(scrollY) {
        // Update parallax elements
        const parallaxElements = document.querySelectorAll('[data-parallax]');
        parallaxElements.forEach(element => {
            const speed = element.dataset.parallax || 0.5;
            const yPos = scrollY * speed;
            element.style.transform = `translate3d(0, ${yPos}px, 0)`;
        });
    }

    /**
     * Throttle utility
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Debounce utility
     */
    debounce(func, delay) {
        let timeoutId;
        return function() {
            const args = arguments;
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        };
    }

    /**
     * Simple event emitter
     */
    emit(event, data) {
        if (this.listeners && this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners) this.listeners = {};
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners || !this.listeners[event]) return;
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            breakpoint: this.currentBreakpoint,
            virtualScrollers: this.virtualScrollers.size,
            lazyImages: this.lazyImages.size,
            rafCallbacks: this.rafCallbacks.length
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.isRAFRunning = false;
        this.virtualScrollers.clear();
        this.lazyImages.clear();
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
    }
}

// Initialize compact UI safely
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.compactUI = new CompactUIManager();
    } catch (error) {
        console.error('Failed to initialize CompactUIManager:', error);
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompactUIManager;
}
