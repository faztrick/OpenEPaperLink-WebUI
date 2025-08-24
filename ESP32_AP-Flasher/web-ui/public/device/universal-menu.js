// Universal Menu Loader
// Enhanced version with feature detection and smart loading
/*
 * universal-menu.js (DEPRECATED)
 * -------------------------------------------------------------
 * This legacy script has been superseded by shared-nav.js which provides
 * a unified navigation bar + device/method status pills across all pages.
 *
 * Any page still loading this file should migrate:
 *   1. Remove <script src="universal-menu.js"> tag.
 *   2. Add   <script src="shared-nav.js" defer></script>
 *   3. Remove static <header class="advanced-header"> markup.
 *
 * For backwards compatibility we expose a minimal stub object so that
 * existing null / property checks (e.g. window.universalMenu?.menuLoaded)
 * do not throw. If shared-nav is already present this file does nothing
 * except log a warning once.
 */
(function(){
	if (window.__UNIVERSAL_MENU_DEPRECATED__) return; // idempotent
	window.__UNIVERSAL_MENU_DEPRECATED__ = true;

	const sharedPresent = !!document.querySelector('.shared-global-nav');
	const warn = (msg) => console.warn('[universal-menu deprecated]', msg);

	warn('Loaded legacy universal-menu.js. Please migrate this page to shared-nav.js.');
	if (sharedPresent) {
		console.info('[universal-menu] shared-nav detected; no legacy DOM injected.');
	}

	// Provide minimal API surface
	const stub = {
		menuLoaded: sharedPresent || true,
		links: [],
		init: () => {},
		buildMenu: () => warn('buildMenu() called on deprecated universal-menu stub (ignored).')
	};

	// Dispatch legacy event for any listeners waiting on 'menuLoaded'
	setTimeout(() => {
		try { window.dispatchEvent(new Event('menuLoaded')); } catch(e) {}
	}, 0);

	window.universalMenu = stub; // single assignment
})();

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

		}
// Wait for shared navigation to be ready
		} catch (error) {
			console.error('Error loading universal menu:', error);
			// Fallback to basic menu if loading fails
			this.createFallbackMenu();
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
