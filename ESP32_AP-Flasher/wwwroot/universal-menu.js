// Universal Menu Loader
// This script loads the menu.html file and injects it into any page

class UniversalMenu {
	constructor() {
		this.menuLoaded = false;
		this.init();
	}
	
	async init() {
		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => this.loadMenu());
		} else {
			this.loadMenu();
		}
	}
	
	async loadMenu() {
		try {
			// Find menu container
			const menuContainer = document.getElementById('menu-container') || 
								 document.querySelector('.menu-container') ||
								 document.querySelector('nav') ||
								 this.createMenuContainer();
			
			// Load menu content
			const response = await fetch('menu.html');
			if (!response.ok) {
				throw new Error(`Failed to load menu: ${response.status}`);
			}
			
			const menuHTML = await response.text();
			
			// Extract just the menu div and script from the loaded HTML
			const parser = new DOMParser();
			const doc = parser.parseFromString(menuHTML, 'text/html');
			const menuDiv = doc.querySelector('#universal-menu');
			const menuScript = doc.querySelector('script');
			
			if (menuDiv) {
				// Clear container and add menu
				menuContainer.innerHTML = '';
				menuContainer.appendChild(menuDiv.cloneNode(true));
				
				// Execute the menu script
				if (menuScript) {
					eval(menuScript.textContent);
				}
				
				this.menuLoaded = true;
				console.log('Universal menu loaded successfully');
			}
			
		} catch (error) {
			console.error('Error loading universal menu:', error);
			// Fallback to basic menu if loading fails
			this.createFallbackMenu();
		}
	}
	
	createMenuContainer() {
		// Create a menu container if none exists
		const container = document.createElement('div');
		container.id = 'menu-container';
		container.className = 'menu-container';
		
		// Insert at the beginning of body or after header
		const header = document.querySelector('header');
		const targetElement = header || document.body.firstElementChild;
		
		if (header) {
			header.insertAdjacentElement('afterend', container);
		} else if (targetElement) {
			targetElement.insertAdjacentElement('beforebegin', container);
		} else {
			document.body.insertBefore(container, document.body.firstChild);
		}
		
		return container;
	}
	
	createFallbackMenu() {
		const menuContainer = document.getElementById('menu-container') || this.createMenuContainer();
		menuContainer.innerHTML = `
			<div class="quick-menu" id="universal-menu">
				<a href="index.html" class="menu-btn">🏠 Home</a>
				<a href="dashboard.html" class="menu-btn">📊 Dashboard</a>
				<a href="tags.html" class="menu-btn">🏷️ Tags</a>
				<a href="tag_control_panel.html" class="menu-btn">🎛️ Tag Control</a>
				<a href="ap_list.html" class="menu-btn">📡 Access Points</a>
				<a href="flasher.html" class="menu-btn">⚡ Flasher</a>
				<a href="nrf52_swd.html" class="menu-btn">💾 nRF52 SWD</a>
				<a href="c6_module.html" class="menu-btn">🔧 C6 Module</a>
				<a href="updates.html" class="menu-btn">🔄 Updates</a>
				<a href="settings.html" class="menu-btn">⚙️ Settings</a>
				<a href="logs.html" class="menu-btn">📄 Logs</a>
				<a href="navigation.html" class="menu-btn">📱 All Modules</a>
			</div>
		`;
	}
}

// Auto-initialize the universal menu
window.universalMenu = new UniversalMenu();
