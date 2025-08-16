// Universal Menu Loader
// Enhanced version with feature detection and smart loading

class UniversalMenu {
	constructor() {
		this.menuLoaded = false;
		this.retryCount = 0;
		this.maxRetries = 3;
		this.featureManager = null;
		this.init();
	}
	
	async init() {
		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => this.loadMenu());
		} else {
			// Small delay to ensure all elements are ready
			setTimeout(() => this.loadMenu(), 100);
		}
		
		// Wait for feature manager if available
		this.waitForFeatureManager();
	}
	
	async waitForFeatureManager() {
		let attempts = 0;
		const maxAttempts = 10;
		
		const checkForFeatureManager = () => {
			if (window.featureManager) {
				this.featureManager = window.featureManager;
				console.log('Universal Menu: Feature manager connected');
				return true;
			}
			attempts++;
			if (attempts < maxAttempts) {
				setTimeout(checkForFeatureManager, 500);
			} else {
				console.log('Universal Menu: Running without feature manager');
			}
			return false;
		};
		
		checkForFeatureManager();
	}
	
	async loadMenu() {
		try {
			// Find menu container with better fallback logic
			let menuContainer = document.getElementById('menu-container') || 
								document.querySelector('.menu-container');
			
			if (!menuContainer) {
				menuContainer = this.createMenuContainer();
			}
			
			// Load menu content with retry logic
			const response = await this.fetchWithRetry('menu.html');
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
				
				// Execute the menu script with error handling
				if (menuScript) {
					try {
						eval(menuScript.textContent);
					} catch (scriptError) {
						console.warn('Menu script error:', scriptError);
					}
				}
				
				// Set active menu item
				this.setActiveMenuItem();
				
				this.menuLoaded = true;
				console.log('Universal menu loaded successfully');
				
				// Dispatch event for other scripts to know menu is ready
				window.dispatchEvent(new CustomEvent('menuLoaded'));
			} else {
				throw new Error('Menu div not found in loaded HTML');
			}
			
		} catch (error) {
			console.error('Error loading universal menu:', error);
			// Fallback to basic menu if loading fails
			this.createFallbackMenu();
		}
	}
	
	async fetchWithRetry(url) {
		for (let i = 0; i <= this.maxRetries; i++) {
			try {
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				return response;
			} catch (error) {
				if (i === this.maxRetries) {
					throw error;
				}
				console.warn(`Menu fetch attempt ${i + 1} failed, retrying...`);
				await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
			}
		}
	}
	
	setActiveMenuItem() {
		const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
		const menuItems = document.querySelectorAll('#universal-menu .menu-btn');
		
		menuItems.forEach(item => {
			item.classList.remove('active');
			const itemPage = item.getAttribute('data-page') || item.href.split('/').pop().replace('.html', '');
			if (itemPage === currentPage) {
				item.classList.add('active');
			}
		});
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
				<a href="index.html" class="menu-btn" data-page="index">
					<span class="material-symbols-outlined" style="font-size: 14px;">home</span>
					Home
				</a>
				<a href="dashboard.html" class="menu-btn" data-page="dashboard">
					<span class="material-symbols-outlined" style="font-size: 14px;">analytics</span>
					Dashboard
				</a>
				<a href="tags.html" class="menu-btn" data-page="tags">
					<span class="material-symbols-outlined" style="font-size: 14px;">sell</span>
					Tags
				</a>
				<a href="tag_control_panel.html" class="menu-btn" data-page="tag_control_panel">
					<span class="material-symbols-outlined" style="font-size: 14px;">settings_remote</span>
					Tag Control
				</a>
				<a href="flasher.html" class="menu-btn" data-page="flasher">
					<span class="material-symbols-outlined" style="font-size: 14px;">flash_on</span>
					Flasher
				</a>
				<a href="nrf52_swd.html" class="menu-btn" data-page="nrf52_swd">
					<span class="material-symbols-outlined" style="font-size: 14px;">memory</span>
					nRF52 SWD
				</a>
				<a href="c6_module.html" class="menu-btn" data-page="c6_module">
					<span class="material-symbols-outlined" style="font-size: 14px;">developer_board</span>
					C6 Module
				</a>
				<a href="ai-agent.html" class="menu-btn" data-page="ai-agent">
					<span class="material-symbols-outlined" style="font-size: 14px;">smart_toy</span>
					AI Assistant
				</a>
				<a href="updates.html" class="menu-btn" data-page="updates">
					<span class="material-symbols-outlined" style="font-size: 14px;">system_update</span>
					Updates
				</a>
				<a href="settings.html" class="menu-btn" data-page="settings">
					<span class="material-symbols-outlined" style="font-size: 14px;">settings</span>
					Settings
				</a>
				<a href="logs.html" class="menu-btn" data-page="logs">
					<span class="material-symbols-outlined" style="font-size: 14px;">text_snippet</span>
					Logs
				</a>
			</div>
		`;
		
		// Set active menu item for fallback menu
		this.setActiveMenuItem();
		console.log('Fallback menu created');
	}
}

// Auto-initialize the universal menu with error handling
try {
	window.universalMenu = new UniversalMenu();
} catch (error) {
	console.error('Failed to initialize universal menu:', error);
}
