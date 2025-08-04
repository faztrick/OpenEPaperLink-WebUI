// OpenEPL ESP32 - UI Components and Widgets
// Reusable UI components and interactive widgets

/**
 * UI Components Manager
 * Handles creation and management of reusable UI components
 */
class UIComponents {
    constructor() {
        this.componentCache = new Map();
        this.eventListeners = new Map();
        this.animations = new Map();
        
        // Defer initialization to avoid binding issues
        setTimeout(() => this.initializeComponents(), 0);
    }

    /**
     * Initialize built-in components
     */
    initializeComponents() {
        // Register components with safe binding
        const componentMap = [
            { name: 'modal', method: 'createModal' },
            { name: 'tooltip', method: 'createTooltip' },
            { name: 'notification', method: 'createNotification' },
            { name: 'dropdown', method: 'createDropdown' },
            { name: 'tabs', method: 'createTabs' },
            { name: 'accordion', method: 'createAccordion' },
            { name: 'slider', method: 'createSlider' },
            { name: 'colorPicker', method: 'createColorPicker' },
            { name: 'fileUpload', method: 'createFileUpload' },
            { name: 'progressBar', method: 'createProgressBar' }
        ];

        componentMap.forEach(({ name, method }) => {
            try {
                if (typeof this[method] === 'function') {
                    // Use arrow function to preserve context instead of bind
                    this.registerComponent(name, (...args) => this[method](...args));
                } else {
                    console.warn(`UIComponents: Method ${method} not found`);
                }
            } catch (error) {
                console.warn(`UIComponents: Failed to register ${name}:`, error);
            }
        });
        
        console.log('UIComponents: Initialization completed');
    }

    /**
     * Register a new component type
     */
    registerComponent(name, factory) {
        this.componentCache.set(name, factory);
    }

    /**
     * Create component instance
     */
    createComponent(type, options = {}) {
        const factory = this.componentCache.get(type);
        if (!factory) {
            console.error(`Unknown component type: ${type}`);
            return null;
        }
        
        return factory(options);
    }

    /**
     * Create modal dialog component
     */
    createModal(options = {}) {
        const {
            title = '',
            content = '',
            showClose = true,
            backdrop = true,
            size = 'medium',
            className = '',
            onShow = null,
            onHide = null
        } = options;

        const modal = document.createElement('dialog');
        modal.className = `modal ${size} ${className}`;
        
        modal.innerHTML = `
            <div class="modal-backdrop ${backdrop ? 'clickable' : ''}"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    ${showClose ? '<button class="modal-close" aria-label="Close">&times;</button>' : ''}
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <slot name="footer"></slot>
                </div>
            </div>
        `;

        // Event handlers
        if (showClose) {
            modal.querySelector('.modal-close').addEventListener('click', () => {
                this.hideModal(modal);
            });
        }

        if (backdrop) {
            modal.querySelector('.modal-backdrop').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    this.hideModal(modal);
                }
            });
        }

        // Custom events
        if (onShow) modal.addEventListener('show', onShow);
        if (onHide) modal.addEventListener('hide', onHide);

        document.body.appendChild(modal);
        return modal;
    }

    /**
     * Show modal with animation
     */
    showModal(modal) {
        modal.style.display = 'flex';
        modal.dispatchEvent(new CustomEvent('show'));
        
        // Animate in
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    }

    /**
     * Hide modal with animation
     */
    hideModal(modal) {
        modal.classList.remove('show');
        modal.dispatchEvent(new CustomEvent('hide'));
        
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    /**
     * Create tooltip component
     */
    createTooltip(options = {}) {
        const {
            target,
            content = '',
            position = 'top',
            trigger = 'hover',
            delay = 300
        } = options;

        const tooltip = document.createElement('div');
        tooltip.className = `tooltip tooltip-${position}`;
        tooltip.innerHTML = content;
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';

        document.body.appendChild(tooltip);

        let showTimeout, hideTimeout;

        const showTooltip = (e) => {
            clearTimeout(hideTimeout);
            showTimeout = setTimeout(() => {
                this.positionTooltip(tooltip, target, position);
                tooltip.style.display = 'block';
                requestAnimationFrame(() => {
                    tooltip.classList.add('show');
                });
            }, delay);
        };

        const hideTooltip = () => {
            clearTimeout(showTimeout);
            hideTimeout = setTimeout(() => {
                tooltip.classList.remove('show');
                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 200);
            }, 100);
        };

        if (trigger === 'hover') {
            target.addEventListener('mouseenter', showTooltip);
            target.addEventListener('mouseleave', hideTooltip);
        } else if (trigger === 'click') {
            target.addEventListener('click', showTooltip);
            document.addEventListener('click', (e) => {
                if (!target.contains(e.target) && !tooltip.contains(e.target)) {
                    hideTooltip();
                }
            });
        }

        return tooltip;
    }

    /**
     * Position tooltip relative to target
     */
    positionTooltip(tooltip, target, position) {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        let x, y;

        switch (position) {
            case 'top':
                x = targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);
                y = targetRect.top + scrollY - tooltipRect.height - 8;
                break;
            case 'bottom':
                x = targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);
                y = targetRect.bottom + scrollY + 8;
                break;
            case 'left':
                x = targetRect.left + scrollX - tooltipRect.width - 8;
                y = targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2);
                break;
            case 'right':
                x = targetRect.right + scrollX + 8;
                y = targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2);
                break;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    /**
     * Create notification component
     */
    createNotification(options = {}) {
        const {
            message = '',
            type = 'info',
            duration = 5000,
            position = 'top-right',
            showClose = true,
            actions = []
        } = options;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    ${this.getNotificationIcon(type)}
                </div>
                <div class="notification-message">${message}</div>
                ${showClose ? '<button class="notification-close">&times;</button>' : ''}
            </div>
            ${actions.length > 0 ? `
                <div class="notification-actions">
                    ${actions.map(action => `
                        <button class="notification-action" data-action="${action.id}">
                            ${action.label}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        `;

        // Position notification
        let container = document.querySelector(`.notification-container.${position}`);
        if (!container) {
            container = this.createNotificationContainer(position);
        }

        container.appendChild(notification);

        // Event handlers
        if (showClose) {
            notification.querySelector('.notification-close').addEventListener('click', () => {
                this.removeNotification(notification);
            });
        }

        // Action handlers
        actions.forEach(action => {
            const button = notification.querySelector(`[data-action="${action.id}"]`);
            if (button && action.handler) {
                button.addEventListener('click', action.handler);
            }
        });

        // Auto-remove
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }

        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        return notification;
    }

    /**
     * Get notification icon based on type
     */
    getNotificationIcon(type) {
        const icons = {
            info: '&#8505;',
            success: '&#10004;',
            warning: '&#9888;',
            error: '&#10006;'
        };
        return icons[type] || icons.info;
    }

    /**
     * Create notification container
     */
    createNotificationContainer(position) {
        const container = document.createElement('div');
        container.className = `notification-container ${position}`;
        document.body.appendChild(container);
        return container;
    }

    /**
     * Remove notification with animation
     */
    removeNotification(notification) {
        notification.classList.remove('show');
        notification.classList.add('hide');
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    /**
     * Create dropdown component
     */
    createDropdown(options = {}) {
        const {
            trigger,
            items = [],
            position = 'bottom-left',
            searchable = false,
            multiple = false,
            placeholder = 'Select...'
        } = options;

        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown';
        
        dropdown.innerHTML = `
            <div class="dropdown-menu" style="display: none;">
                ${searchable ? '<input class="dropdown-search" placeholder="Search...">' : ''}
                <div class="dropdown-items">
                    ${items.map(item => `
                        <div class="dropdown-item" data-value="${item.value || item}">
                            ${multiple ? '<input type="checkbox">' : ''}
                            <span>${item.label || item}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(dropdown);

        // Show/hide dropdown
        const toggleDropdown = () => {
            const menu = dropdown.querySelector('.dropdown-menu');
            const isVisible = menu.style.display !== 'none';
            
            if (isVisible) {
                menu.style.display = 'none';
            } else {
                this.positionDropdown(dropdown, trigger, position);
                menu.style.display = 'block';
            }
        };

        trigger.addEventListener('click', toggleDropdown);

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                dropdown.querySelector('.dropdown-menu').style.display = 'none';
            }
        });

        return dropdown;
    }

    /**
     * Create tabs component
     */
    createTabs(options = {}) {
        const {
            container,
            tabs = [],
            activeTab = 0,
            orientation = 'horizontal'
        } = options;

        const tabsWrapper = document.createElement('div');
        tabsWrapper.className = `tabs tabs-${orientation}`;
        
        tabsWrapper.innerHTML = `
            <div class="tab-list" role="tablist">
                ${tabs.map((tab, index) => `
                    <button class="tab ${index === activeTab ? 'active' : ''}" 
                            role="tab" 
                            data-tab="${index}"
                            aria-selected="${index === activeTab}">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
            <div class="tab-panels">
                ${tabs.map((tab, index) => `
                    <div class="tab-panel ${index === activeTab ? 'active' : ''}" 
                         role="tabpanel" 
                         data-panel="${index}">
                        ${tab.content}
                    </div>
                `).join('')}
            </div>
        `;

        // Tab switching
        tabsWrapper.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabIndex = parseInt(tab.dataset.tab);
                this.switchTab(tabsWrapper, tabIndex);
            });
        });

        if (container) {
            container.appendChild(tabsWrapper);
        }

        return tabsWrapper;
    }

    /**
     * Switch active tab
     */
    switchTab(tabsWrapper, activeIndex) {
        // Update tab buttons
        tabsWrapper.querySelectorAll('.tab').forEach((tab, index) => {
            tab.classList.toggle('active', index === activeIndex);
            tab.setAttribute('aria-selected', index === activeIndex);
        });

        // Update tab panels
        tabsWrapper.querySelectorAll('.tab-panel').forEach((panel, index) => {
            panel.classList.toggle('active', index === activeIndex);
        });
    }

    /**
     * Create progress bar component
     */
    createProgressBar(options = {}) {
        const {
            value = 0,
            max = 100,
            animated = false,
            striped = false,
            color = 'primary',
            showLabel = false
        } = options;

        const progressBar = document.createElement('div');
        progressBar.className = `progress ${animated ? 'animated' : ''} ${striped ? 'striped' : ''}`;
        
        progressBar.innerHTML = `
            <div class="progress-bar progress-bar-${color}" 
                 role="progressbar" 
                 style="width: ${(value / max) * 100}%"
                 aria-valuenow="${value}" 
                 aria-valuemin="0" 
                 aria-valuemax="${max}">
                ${showLabel ? `${Math.round((value / max) * 100)}%` : ''}
            </div>
        `;

        // Method to update progress
        progressBar.updateProgress = (newValue) => {
            const bar = progressBar.querySelector('.progress-bar');
            const percentage = (newValue / max) * 100;
            
            bar.style.width = `${percentage}%`;
            bar.setAttribute('aria-valuenow', newValue);
            
            if (showLabel) {
                bar.textContent = `${Math.round(percentage)}%`;
            }
        };

        return progressBar;
    }

    /**
     * Create color picker component
     */
    createColorPicker(options = {}) {
        const {
            value = '#000000',
            onChange = null,
            showAlpha = false,
            presets = []
        } = options;

        const colorPicker = document.createElement('div');
        colorPicker.className = 'color-picker';
        
        colorPicker.innerHTML = `
            <input type="color" class="color-input" value="${value}">
            <div class="color-preview" style="background-color: ${value}"></div>
            ${showAlpha ? '<input type="range" class="alpha-slider" min="0" max="1" step="0.01" value="1">' : ''}
            ${presets.length > 0 ? `
                <div class="color-presets">
                    ${presets.map(preset => `
                        <div class="color-preset" 
                             style="background-color: ${preset}" 
                             data-color="${preset}"></div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        // Event handlers
        const colorInput = colorPicker.querySelector('.color-input');
        const colorPreview = colorPicker.querySelector('.color-preview');

        colorInput.addEventListener('input', (e) => {
            const color = e.target.value;
            colorPreview.style.backgroundColor = color;
            if (onChange) onChange(color);
        });

        // Preset handlers
        colorPicker.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                const color = preset.dataset.color;
                colorInput.value = color;
                colorPreview.style.backgroundColor = color;
                if (onChange) onChange(color);
            });
        });

        return colorPicker;
    }

    /**
     * Create file upload component
     */
    createFileUpload(options = {}) {
        const {
            accept = '',
            multiple = false,
            dragDrop = true,
            maxSize = null,
            onUpload = null,
            onError = null
        } = options;

        const fileUpload = document.createElement('div');
        fileUpload.className = 'file-upload';
        
        fileUpload.innerHTML = `
            <input type="file" class="file-input" 
                   ${accept ? `accept="${accept}"` : ''} 
                   ${multiple ? 'multiple' : ''}>
            <div class="file-drop-zone">
                <div class="file-drop-icon">📁</div>
                <div class="file-drop-text">
                    Drop files here or <span class="file-browse">browse</span>
                </div>
            </div>
            <div class="file-list"></div>
        `;

        const fileInput = fileUpload.querySelector('.file-input');
        const dropZone = fileUpload.querySelector('.file-drop-zone');
        const browseButton = fileUpload.querySelector('.file-browse');
        const fileList = fileUpload.querySelector('.file-list');

        // Browse button
        browseButton.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files, fileList, maxSize, onUpload, onError);
        });

        // Drag and drop
        if (dragDrop) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('drag-over');
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('drag-over');
                });
            });

            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                this.handleFiles(files, fileList, maxSize, onUpload, onError);
            });
        }

        return fileUpload;
    }

    /**
     * Handle uploaded files
     */
    handleFiles(files, fileList, maxSize, onUpload, onError) {
        Array.from(files).forEach(file => {
            if (maxSize && file.size > maxSize) {
                if (onError) onError(`File ${file.name} is too large`);
                return;
            }

            // Add to file list
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-name">${file.name}</span>
                <span class="file-size">${convertSize(file.size)}</span>
                <button class="file-remove">×</button>
            `;

            fileItem.querySelector('.file-remove').addEventListener('click', () => {
                fileItem.remove();
            });

            fileList.appendChild(fileItem);

            if (onUpload) onUpload(file);
        });
    }

    /**
     * Destroy component and cleanup
     */
    destroyComponent(component) {
        // Remove event listeners
        const listeners = this.eventListeners.get(component);
        if (listeners) {
            listeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners.delete(component);
        }

        // Remove from DOM
        if (component.parentNode) {
            component.parentNode.removeChild(component);
        }
    }
}

// Create global UI components instance
window.uiComponents = new UIComponents();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIComponents;
}
