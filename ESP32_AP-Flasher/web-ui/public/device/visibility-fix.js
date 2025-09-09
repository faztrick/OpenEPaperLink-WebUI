/**
 * ESP32 Visibility Fix JavaScript
 * This script diagnoses and fixes visibility issues with feature cards and UI components
 */

class VisibilityFixer {
    constructor() {
        this.debugMode = false;
        this.issues = [];

        // Auto-run on DOM load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('🔍 Visibility Fixer initialized');
        this.diagnoseVisibilityIssues();
        this.fixVisibilityIssues();
        this.addVisibilityTools();
    }

    /**
     * Diagnose visibility issues
     */
    diagnoseVisibilityIssues() {
        console.log('🔍 Diagnosing visibility issues...');
        this.issues = [];

        // Check feature cards
        const featureCards = document.querySelectorAll('.feature-card');
        console.log(`Found ${featureCards.length} feature cards`);

        featureCards.forEach((card, index) => {
            const styles = window.getComputedStyle(card);
            const rect = card.getBoundingClientRect();

            const issue = {
                element: card,
                index: index,
                issues: []
            };

            // Check display
            if (styles.display === 'none') {
                issue.issues.push('display: none');
            }

            // Check visibility
            if (styles.visibility === 'hidden') {
                issue.issues.push('visibility: hidden');
            }

            // Check opacity
            if (parseFloat(styles.opacity) < 0.1) {
                issue.issues.push(`opacity: ${styles.opacity}`);
            }

            // Check if element is in viewport
            if (rect.width === 0 || rect.height === 0) {
                issue.issues.push('zero dimensions');
            }

            // Check position
            if (styles.position === 'absolute' && (rect.top < -1000 || rect.left < -1000)) {
                issue.issues.push('positioned off-screen');
            }

            // Check z-index
            if (styles.zIndex && parseInt(styles.zIndex) < -1) {
                issue.issues.push(`z-index: ${styles.zIndex}`);
            }

            if (issue.issues.length > 0) {
                this.issues.push(issue);
                console.warn(`⚠️ Feature card ${index} has issues:`, issue.issues);
            }
        });

        // Check feature grid
        const featureGrid = document.querySelector('.feature-grid');
        if (featureGrid) {
            const gridStyles = window.getComputedStyle(featureGrid);
            console.log('Feature grid display:', gridStyles.display);
            console.log('Feature grid visibility:', gridStyles.visibility);
            console.log('Feature grid opacity:', gridStyles.opacity);
        }

        // Check for CSS conflicts
        this.checkCSSConflicts();

        console.log(`🔍 Found ${this.issues.length} visibility issues`);
        return this.issues;
    }

    /**
     * Check for CSS conflicts
     */
    checkCSSConflicts() {
        const stylesheets = Array.from(document.styleSheets);
        console.log(`Checking ${stylesheets.length} stylesheets for conflicts...`);

        try {
            stylesheets.forEach((sheet, index) => {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (rules) {
                        Array.from(rules).forEach(rule => {
                            if (rule.selectorText && rule.selectorText.includes('.feature-card')) {
                                console.log(`CSS rule found: ${rule.selectorText} -> ${rule.style.cssText}`);
                            }
                        });
                    }
                } catch (e) {
                    console.log(`Cannot access stylesheet ${index}:`, e.message);
                }
            });
        } catch (e) {
            console.log('Error checking CSS conflicts:', e.message);
        }
    }

    /**
     * Fix visibility issues
     */
    fixVisibilityIssues() {
        console.log('🔧 Fixing visibility issues...');

        // Force feature cards to be visible
        const featureCards = document.querySelectorAll('.feature-card');
        featureCards.forEach((card, index) => {
            // Force visibility
            card.style.display = 'block';
            card.style.visibility = 'visible';
            card.style.opacity = '1';
            card.style.position = 'relative';
            card.style.zIndex = '1';

            // Ensure minimum dimensions
            if (card.offsetHeight < 100) {
                card.style.minHeight = '200px';
            }

            console.log(`✅ Fixed feature card ${index}`);
        });

        // Fix feature grid
        const featureGrid = document.querySelector('.feature-grid');
        if (featureGrid) {
            featureGrid.style.display = 'grid';
            featureGrid.style.visibility = 'visible';
            featureGrid.style.opacity = '1';
            console.log('✅ Fixed feature grid');
        }

        // Force content visibility
        const exampleCommands = document.querySelectorAll('.example-commands');
        exampleCommands.forEach(cmd => {
            cmd.style.display = 'block';
            cmd.style.visibility = 'visible';
            cmd.style.opacity = '1';
        });

        const commandExamples = document.querySelectorAll('.command-example');
        commandExamples.forEach(example => {
            example.style.display = 'block';
            example.style.visibility = 'visible';
            example.style.opacity = '1';
        });

        console.log('✅ Visibility fixes applied');
    }

    /**
     * Add debug tools
     */
    addVisibilityTools() {
        // Add debug toggle
        const debugBtn = document.createElement('button');
        debugBtn.innerHTML = '🔍 Debug Visibility';
        debugBtn.style.position = 'fixed';
        debugBtn.style.top = '10px';
        debugBtn.style.right = '10px';
        debugBtn.style.zIndex = '9999';
        debugBtn.style.padding = '10px';
        debugBtn.style.background = '#667eea';
        debugBtn.style.color = 'white';
        debugBtn.style.border = 'none';
        debugBtn.style.borderRadius = '5px';
        debugBtn.style.cursor = 'pointer';

        debugBtn.onclick = () => this.toggleDebugMode();
        document.body.appendChild(debugBtn);

        // Add fix button
        const fixBtn = document.createElement('button');
        fixBtn.innerHTML = '🔧 Force Fix';
        fixBtn.style.position = 'fixed';
        fixBtn.style.top = '60px';
        fixBtn.style.right = '10px';
        fixBtn.style.zIndex = '9999';
        fixBtn.style.padding = '10px';
        fixBtn.style.background = '#28a745';
        fixBtn.style.color = 'white';
        fixBtn.style.border = 'none';
        fixBtn.style.borderRadius = '5px';
        fixBtn.style.cursor = 'pointer';

        fixBtn.onclick = () => this.forceFixVisibility();
        document.body.appendChild(fixBtn);
    }

    /**
     * Toggle debug mode
     */
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        document.body.classList.toggle('debug-mode', this.debugMode);

        if (this.debugMode) {
            console.log('🐛 Debug mode enabled');
            this.diagnoseVisibilityIssues();
            this.showDebugInfo();
        } else {
            console.log('🐛 Debug mode disabled');
            this.hideDebugInfo();
        }
    }

    /**
     * Show debug information
     */
    showDebugInfo() {
        // Remove existing debug panel
        const existingPanel = document.getElementById('visibility-debug-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        // Create debug panel
        const panel = document.createElement('div');
        panel.id = 'visibility-debug-panel';
        panel.style.cssText = `
            position: fixed;
            top: 120px;
            right: 10px;
            width: 300px;
            max-height: 400px;
            background: white;
            border: 2px solid #667eea;
            border-radius: 8px;
            padding: 15px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
        `;

        let debugHTML = '<h3 style="margin:0 0 10px 0; color:#667eea;">Visibility Debug</h3>';
        debugHTML += `<p><strong>Issues Found:</strong> ${this.issues.length}</p>`;

        this.issues.forEach((issue, index) => {
            debugHTML += `<div style="margin:5px 0; padding:5px; background:#f8f9fa; border-radius:3px;">`;
            debugHTML += `<strong>Card ${issue.index}:</strong><br>`;
            debugHTML += issue.issues.map(i => `• ${i}`).join('<br>');
            debugHTML += `</div>`;
        });

        const featureCards = document.querySelectorAll('.feature-card');
        debugHTML += `<p><strong>Feature Cards:</strong> ${featureCards.length}</p>`;

        panel.innerHTML = debugHTML;
        document.body.appendChild(panel);
    }

    /**
     * Hide debug information
     */
    hideDebugInfo() {
        const panel = document.getElementById('visibility-debug-panel');
        if (panel) {
            panel.remove();
        }
    }

    /**
     * Force fix all visibility issues
     */
    forceFixVisibility() {
        console.log('🔧 Force fixing all visibility issues...');
        this.fixVisibilityIssues();
        this.diagnoseVisibilityIssues();

        // Show success message
        const msg = document.createElement('div');
        msg.innerHTML = '✅ Visibility fixes applied!';
        msg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #28a745;
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10001;
            font-weight: bold;
        `;
        document.body.appendChild(msg);

        setTimeout(() => msg.remove(), 3000);
    }

    /**
     * Public method to check specific element
     */
    checkElement(element) {
        if (!element) return null;

        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            position: styles.position,
            zIndex: styles.zIndex,
            dimensions: `${rect.width}x${rect.height}`,
            location: `${rect.top}, ${rect.left}`,
            inViewport: rect.top >= 0 && rect.left >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.right <= window.innerWidth
        };
    }
}

// Initialize the visibility fixer
window.visibilityFixer = new VisibilityFixer();

// Add to console for manual debugging
console.log('VisibilityFixer loaded. Use window.visibilityFixer for manual debugging.');
console.log('Available methods:');
console.log('- window.visibilityFixer.diagnoseVisibilityIssues()');
console.log('- window.visibilityFixer.fixVisibilityIssues()');
console.log('- window.visibilityFixer.checkElement(element)');
console.log('- window.visibilityFixer.toggleDebugMode()');
