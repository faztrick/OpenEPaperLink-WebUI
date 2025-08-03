// OpenEPL ESP32 - Optimized Main Application
// Enhanced with API management and compact UI integration

// Note: $ is defined in constants.js
// Note: WAKEUP_REASONS is defined in constants.js

// Global state
let tagTypes = {};
let apConfig = {};
let tagDB = {};
let batteryChart;
const previewWindows = [];

const apstate = [
    { state: "offline, please wait...", color: "orange", icon: "warning" },
    { state: "online", color: "green", icon: "check_circle" },
    { state: "flashing", color: "orange", icon: "flash_on" },
    { state: "wait for reset", color: "blue", icon: "hourglass" },
    { state: "AP requires reboot", color: "purple", icon: "refresh" },
    { state: "failed", color: "red", icon: "error" },
    { state: "coming online...", color: "orange", icon: "hourglass" },
    { state: "AP without radio", color: "green", icon: "wifi_off" }
];

const runstate = [
    { state: "⏹︎ stopped" },
    { state: "⏸ pause" },
    { state: "" }, // hide running
    { state: "⏳︎ init" }
];

// Performance optimizations
const imageQueue = [];
let isProcessing = false;
let servertimediff = 0;
let paintLoaded = false, paintShow = false;
let cardconfig;
let otamodule, flashmodule;
let socket;
let finishedInitialLoading = false;
let getTagtypeBusy = false;

// Optimized API integration
class OptimizedApp {
    constructor() {
        this.api = null;
        this.ui = null;
        this.updateIntervals = new Map();
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            // Wait for API manager to be available
            if (typeof APIManager !== 'undefined') {
                this.api = window.apiManager || new APIManager();
            }
            
            // Wait for UI manager
            if (typeof CompactUIManager !== 'undefined') {
                this.ui = window.compactUI;
            }
            
            // Initialize application
            await this.loadConfiguration();
            await this.initializeTabs();
            await this.loadInitialData();
            
            this.setupEventListeners();
            this.startPeriodicUpdates();
            
            this.isInitialized = true;
            console.log('Optimized app initialized successfully');
            
        } catch (error) {
            console.error('App initialization error:', error);
            this.fallbackToLegacy();
        }
    }

    async loadConfiguration() {
        try {
            if (this.api) {
                apConfig = await this.api.getConfig();
            } else {
                // Fallback to direct fetch
                const response = await fetch("get_ap_config");
                apConfig = await response.json();
            }
            
            this.updateUIFromConfig(apConfig);
            
        } catch (error) {
            console.error('Configuration load error:', error);
        }
    }

    updateUIFromConfig(config) {
        if (config.alias) {
            const logoElement = $(".logo");
            if (logoElement) logoElement.innerHTML = config.alias;
            document.title = config.alias;
        }
        
        // Update channel options for C6/H2
        if (config.C6 == 1 || (config.H2 && config.H2 == 1)) {
            const option27 = $("#apcfgchid")?.querySelector('option[value="27"]');
            if (option27) option27.remove();
        }
        
        // Show/hide features based on hardware
        if (config.hasFlasher == 1) {
            const flashTab = $('[data-target="flashtab"]');
            if (flashTab) flashTab.style.display = 'block';
        }
        
        if (config.hasBLE == 0) {
            const bleConfig = $("#apcfgble")?.parentNode;
            if (bleConfig) bleConfig.style.display = 'none';
        }
        
        if (config.hasSubGhz == 0) {
            const subGhzConfig = $("#apcfgsubgigchid")?.parentNode;
            if (subGhzConfig) subGhzConfig.style.display = 'none';
        }
        
        // Update status indicators
        if (config.apstate !== undefined) {
            this.updateStatusIndicators(config.apstate);
        }
    }

    updateStatusIndicators(state) {
        const stateInfo = apstate[state] || apstate[0];
        
        const elements = [
            { selector: "#apstatecolor", prop: "innerHTML", value: stateInfo.icon },
            { selector: "#apstatecolor", prop: "style.color", value: stateInfo.color },
            { selector: "#apstate", prop: "innerHTML", value: stateInfo.state },
            { selector: "#dashboardStatus", prop: "innerHTML", value: stateInfo.state },
            { selector: "#dashboardStatus", prop: "style.color", value: stateInfo.color },
            { selector: "#dashboardStatusIcon", prop: "innerHTML", value: stateInfo.icon },
            { selector: "#dashboardStatusIcon", prop: "style.color", value: stateInfo.color }
        ];
        
        elements.forEach(({ selector, prop, value }) => {
            const element = $(selector);
            if (element) {
                if (prop.includes('style.')) {
                    const styleProp = prop.split('.')[1];
                    element.style[styleProp] = value;
                } else {
                    element[prop] = value;
                }
            }
        });
    }

    async loadInitialData() {
        try {
            // Load content cards configuration
            let cardsData;
            if (this.api) {
                cardsData = await this.api.fetch('contentCards');
            } else {
                const response = await fetch('content_cards.json');
                cardsData = await response.json();
            }
            cardconfig = cardsData;
            
            // Load tags data
            await this.loadTags(0);
            
            finishedInitialLoading = true;
            
            // Initialize WebSocket connection
            if (this.api && this.api.socket) {
                this.setupWebSocketListeners();
            } else {
                this.connectWebSocket();
            }
            
        } catch (error) {
            console.error('Initial data load error:', error);
            alert("Could not load content_cards.json. Please check if it's uploaded to the data partition.");
        }
    }

    async loadTags(pos = 0, limit = 50) {
        try {
            let data;
            if (this.api) {
                data = await this.api.getTagDB(pos, limit);
            } else {
                const response = await fetch(`get_db?pos=${pos}`);
                data = await response.json();
            }
            
            if (data.tags) {
                this.processTags(data.tags);
            }
            
            // Continue loading if there are more tags
            if (data.continu && data.continu > pos) {
                return this.loadTags(data.continu, limit);
            }
            
        } catch (error) {
            console.error('Load tags error:', error);
            throw error;
        }
    }

    processTags(tags) {
        if (!Array.isArray(tags)) return;
        
        tags.forEach(tag => {
            if (tag.mac) {
                tagDB[tag.mac] = tag;
            }
        });
        
        // Update UI components
        this.updateDashboardStats();
        this.updateTagList();
        
        // Emit event for other components
        if (this.api) {
            this.api.emit('tagDB:update', { tags });
        }
    }

    updateDashboardStats() {
        const tags = Object.values(tagDB);
        const currentTime = Date.now();
        
        const stats = {
            total: tags.length,
            online: tags.filter(tag => 
                tag.lastseen && (currentTime - tag.lastseen * 1000) < 300000
            ).length,
            pending: tags.filter(tag => tag.pending).length,
            lowBattery: tags.filter(tag => 
                tag.batteryMv && tag.batteryMv < 2200
            ).length,
            timeout: tags.filter(tag => 
                !tag.lastseen || (currentTime - tag.lastseen * 1000) > 300000
            ).length
        };
        
        stats.offline = stats.total - stats.online;
        
        // Calculate average battery
        const batteriesWithData = tags.filter(tag => tag.batteryMv && tag.batteryMv > 0);
        stats.avgBattery = batteriesWithData.length > 0 
            ? Math.round(batteriesWithData.reduce((sum, tag) => 
                sum + Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 700 * 100)), 0) / batteriesWithData.length)
            : 0;
        
        // Update dashboard elements
        this.updateElement('dashboardTagCount', stats.total);
        this.updateElement('dashboardPending', stats.pending);
        this.updateElement('dashboardLowBatt', stats.lowBattery);
        this.updateElement('dashboardTimeout', stats.timeout);
        
        // Update enhanced dashboard
        this.updateElement('dash-total-tags', stats.total);
        this.updateElement('dash-online-tags', stats.online);
        this.updateElement('dash-offline-tags', stats.offline);
        this.updateElement('dash-avg-battery', `${stats.avgBattery}%`);
        
        // Update battery chart if available
        this.updateBatteryChart(tags);
    }

    updateBatteryChart(tags) {
        if (!batteryChart || !tags.length) return;
        
        const batteryRanges = [0, 0, 0, 0]; // excellent, good, fair, low
        
        tags.forEach(tag => {
            if (tag.batteryMv && tag.batteryMv > 0) {
                const batteryPercent = Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 700 * 100));
                
                if (batteryPercent >= 80) batteryRanges[0]++;
                else if (batteryPercent >= 60) batteryRanges[1]++;
                else if (batteryPercent >= 40) batteryRanges[2]++;
                else batteryRanges[3]++;
            }
        });
        
        batteryChart.data.datasets[0].data = batteryRanges;
        batteryChart.update('none'); // No animation for performance
    }

    updateTagList() {
        // Implement efficient tag list updates
        // This would be called when tags data changes
        if (window.updatecards) {
            window.updatecards();
        }
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element && element.textContent !== String(value)) {
            element.textContent = value;
        }
    }

    setupEventListeners() {
        // Setup API event listeners
        if (this.api) {
            this.api.on('tagDB:update', (data) => {
                if (data.tags) {
                    this.processTags(data.tags);
                }
            });
            
            this.api.on('config:update', (config) => {
                apConfig = { ...apConfig, ...config };
                this.updateUIFromConfig(apConfig);
            });
            
            this.api.on('system:update', (data) => {
                this.handleSystemUpdate(data);
            });
        }
        
        // Setup UI event listeners
        if (this.ui) {
            this.ui.on('breakpoint:change', (breakpoint) => {
                this.handleBreakpointChange(breakpoint);
            });
        }
    }

    handleSystemUpdate(data) {
        if (data.memory) {
            this.updateElement('memory-text', `${data.memory.used}%`);
            const memoryBar = document.getElementById('memory-usage');
            if (memoryBar) {
                memoryBar.style.width = `${data.memory.used}%`;
            }
        }
        
        if (data.storage) {
            this.updateElement('storage-text', `${data.storage.used}%`);
            const storageBar = document.getElementById('storage-usage');
            if (storageBar) {
                storageBar.style.width = `${data.storage.used}%`;
            }
        }
    }

    handleBreakpointChange(breakpoint) {
        // Adapt functionality based on screen size
        switch (breakpoint) {
            case 'mobile':
                this.enableMobileOptimizations();
                break;
            case 'tablet':
                this.enableTabletOptimizations();
                break;
            case 'desktop':
                this.enableDesktopOptimizations();
                break;
        }
    }

    enableMobileOptimizations() {
        // Reduce update frequency on mobile
        this.setUpdateInterval('dashboard', 10000);
        this.setUpdateInterval('tagStats', 15000);
    }

    enableTabletOptimizations() {
        this.setUpdateInterval('dashboard', 7500);
        this.setUpdateInterval('tagStats', 10000);
    }

    enableDesktopOptimizations() {
        this.setUpdateInterval('dashboard', 5000);
        this.setUpdateInterval('tagStats', 5000);
    }

    setUpdateInterval(name, interval) {
        if (this.updateIntervals.has(name)) {
            clearInterval(this.updateIntervals.get(name));
        }
        
        const intervalId = setInterval(() => {
            this.performUpdate(name);
        }, interval);
        
        this.updateIntervals.set(name, intervalId);
    }

    async performUpdate(type) {
        try {
            switch (type) {
                case 'dashboard':
                    await this.updateDashboardData();
                    break;
                case 'tagStats':
                    await this.updateTagStats();
                    break;
            }
        } catch (error) {
            console.error(`Update error for ${type}:`, error);
        }
    }

    async updateDashboardData() {
        if (this.api) {
            try {
                const config = await this.api.getConfig();
                this.updateUIFromConfig(config);
            } catch (error) {
                console.warn('Dashboard update failed:', error);
            }
        }
    }

    async updateTagStats() {
        // Update tag statistics without full reload
        this.updateDashboardStats();
    }

    startPeriodicUpdates() {
        // Start with default intervals
        this.setUpdateInterval('dashboard', 5000);
        this.setUpdateInterval('tagStats', 5000);
        
        // Update cards
        if (typeof updatecards === 'function') {
            setInterval(updatecards, 1000);
        }
    }

    setupWebSocketListeners() {
        if (this.api && this.api.socket) {
            // WebSocket is handled by API manager
            return;
        }
    }

    connectWebSocket() {
        // Fallback WebSocket connection
        const protocol = location.protocol === "https:" ? "wss://" : "ws://";
        socket = new WebSocket(protocol + location.host + "/ws");
        
        socket.addEventListener("open", () => {
            console.log("WebSocket connected");
        });
        
        socket.addEventListener("message", (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error("WebSocket message error:", error);
            }
        });
        
        socket.addEventListener("close", () => {
            console.log("WebSocket disconnected");
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }

    handleWebSocketMessage(data) {
        if (data.tagDB) {
            this.processTags(data.tagDB);
        }
        
        if (data.logMsg && $('#showdebug')?.checked) {
            this.showMessage(data.logMsg);
        }
    }

    showMessage(message) {
        if (typeof showMessage === 'function') {
            showMessage(message);
        } else {
            console.log('Log:', message);
        }
    }

    initializeTabs() {
        // Initialize tab system
        if (typeof initTabs === 'function') {
            initTabs();
        }
    }

    fallbackToLegacy() {
        console.warn('Falling back to legacy initialization');
        // Use original initialization code
        if (typeof initTabs === 'function') {
            initTabs();
        }
    }

    destroy() {
        // Clean up intervals
        this.updateIntervals.forEach((intervalId) => {
            clearInterval(intervalId);
        });
        this.updateIntervals.clear();
        
        // Clean up API and UI
        if (this.api && typeof this.api.destroy === 'function') {
            this.api.destroy();
        }
        
        if (this.ui && typeof this.ui.destroy === 'function') {
            this.ui.destroy();
        }
    }
}

// Initialize optimized app
let optimizedApp;

// Legacy compatibility layer
const loadConfig = new Event("loadConfig");
window.addEventListener("loadConfig", async function () {
    if (optimizedApp && optimizedApp.isInitialized) {
        await optimizedApp.loadConfiguration();
    } else {
        // Fallback to original code
        fetch("get_ap_config")
            .then(response => response.json())
            .then(data => {
                apConfig = data;
                // Original config handling code
                if (data.alias) {
                    const logo = $(".logo");
                    if (logo) logo.innerHTML = data.alias;
                    document.title = data.alias;
                }
                // ... rest of original config handling
            });
    }
});

window.addEventListener("load", function () {
    // Initialize optimized app
    optimizedApp = new OptimizedApp();
    
    // Trigger config load for legacy compatibility
    window.dispatchEvent(loadConfig);
    
    // Legacy initialization
    dropUpload();
    populateTimes($('#apcnight1'));
    populateTimes($('#apcnight2'));
    
    document.addEventListener('DOMContentLoaded', function () {
        const faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        faviconLink.href = 'favicon.ico';
        document.head.appendChild(faviconLink);
        
        checkC6ModuleSupport();
    });
});

/* tabs */
let activeTab = '', previousTab = '';

function initTabs() {
	const tabLinks = document.querySelectorAll(".tablinks");
	const tabContents = document.querySelectorAll(".tabcontent");

	tabLinks.forEach(tabLink => {
		tabLink.addEventListener("click", function (event) {
			event.preventDefault();
			const targetId = this.getAttribute("data-target");
			const loadTabEvent = new CustomEvent('loadTab', { detail: targetId });
			document.dispatchEvent(loadTabEvent);
			tabContents.forEach(tabContent => {
				tabContent.style.display = "none";
			});
			tabLinks.forEach(link => {
				link.classList.remove("active");
			});
			if (targetId == "logtab") document.getElementById(targetId).scrollTop = 0;
			document.getElementById(targetId).style.display = "block";
			this.classList.add("active");
		});
	});
	if (tabLinks && tabLinks.length > 0) {
		tabLinks[0].click();
	}
};

function loadTags(pos) {
	return fetch("get_db?pos=" + pos)
		.then(response => response.json())
		.then(data => {
			processTags(data.tags);
			if (data.continu && data.continu > pos) {
				return loadTags(data.continu);
			}
		});
}

function formatUptime(seconds) {
	const days = Math.floor(seconds / (24 * 60 * 60));
	const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
	const minutes = Math.floor((seconds % (60 * 60)) / 60);
	const remainingSeconds = seconds % 60;

	const components = [
		{ value: days, label: 'd' },
		{ value: hours, label: 'h' },
		{ value: minutes, label: 'm' },
		{ value: remainingSeconds, label: 's' }
	];

	let formattedUptime = '';

	components.forEach(({ value, label }) => {
		if (value > 0 || formattedUptime !== '') {
			formattedUptime += `${value}${label} `;
		}
	});

	return formattedUptime.trim();
}

function connect() {
	protocol = location.protocol == "https:" ? "wss://" : "ws://";
	socket = new WebSocket(protocol + location.host + "/ws");
	
	// Expose socket to window for flash module
	window.socket = socket;

	socket.addEventListener("open", (event) => {
		showMessage("websocket connected");
	});

	socket.addEventListener("message", (event) => {
		if ($('#showdebug').checked) {
			showMessage(event.data);
			console.log(event.data);
		}
		const msg = JSON.parse(event.data);
		if (msg.logMsg) {
			showMessage(msg.logMsg, false);
		}
		if (msg.errMsg) {
			showMessage(msg.errMsg, true);
		}
		if (msg.tags) {
			processTags(msg.tags);
		}
		if (msg.sys) {
			let str = "";
			str += `free heap: ${convertSize(msg.sys.heap)} &#x2507; `;
			if (msg.sys.psfree) {
				str += `free PSRAM: ${convertSize(msg.sys.psfree)}  &#x2507; `;
			}
			str += `db size: ${convertSize(msg.sys.dbsize)} &#x2507; `;
			str += `db record count: ${msg.sys.recordcount} &#x2507; `;

			if (msg.sys.littlefsfree < 31000) {
				str += `filesystem <span class="blink-red" title="Generating content is paused">FULL! ${convertSize(
					msg.sys.littlefsfree
				)} </span>`;
			} else {
				str += `filesystem free: ${convertSize(msg.sys.littlefsfree)}`;
			}
			str += ` &#x2507; uptime: ${formatUptime(msg.sys.uptime)}`;

			const sysinfoElement = $("#sysinfo");
			if (sysinfoElement) sysinfoElement.innerHTML = str;

			if (msg.sys.apstate) {
				const runstateElement = $("#runstate");
				const apstateColorElement = $("#apstatecolor");
				const apstateElement = $("#apstate");
				const dashboardStatusElement = $('#dashboardStatus');
				const dashboardStatusIconElement = $('#dashboardStatusIcon');
				
				if (runstateElement) runstateElement.innerHTML = runstate[msg.sys.runstate].state;
				if (apstateColorElement) {
					apstateColorElement.innerHTML = apstate[msg.sys.apstate].icon;
					apstateColorElement.style.color = apstate[msg.sys.apstate].color;
				}
				if (apstateElement) apstateElement.innerHTML = apstate[msg.sys.apstate].state;
				if (dashboardStatusElement) {
					dashboardStatusElement.innerHTML = apstate[msg.sys.apstate].state;
					dashboardStatusElement.style.color = apstate[msg.sys.apstate].color;
				}
				if (dashboardStatusIconElement) {
					dashboardStatusIconElement.innerHTML = apstate[msg.sys.apstate].icon;
					dashboardStatusIconElement.style.color = apstate[msg.sys.apstate].color;
				}			
			}
			servertimediff = (Date.now() / 1000) - msg.sys.currtime;
		}
		if (msg.apitem) {
			populateAPCard(msg.apitem);
		}
		if (msg.console) {
			if (activeTab == 'flashtab' && flashmodule && typeof (flashmodule.print) === "function") {
				let color = (msg.color ? msg.color : "#c0c0c0");
				if (msg.console.startsWith("Fail") || msg.console.startsWith("Err")) {
					color = "red";
				}
				flashmodule.print(msg.console, color);
			} else if (otamodule && typeof (otamodule.print) === "function") {
				let color = "#c0c0c0";
				if (msg.console.startsWith("Fail") || msg.console.startsWith("Err")) {
					color = "red";
				}
				otamodule.print(msg.console, color);
			}
		}
	});

	socket.addEventListener("close", (event) => {
		showMessage(`websocket closed ${event.code}`);
		setTimeout(connect, 5000);
	});
}

function convertSize(bytes) {
	if (bytes >= 1073741824) { bytes = (bytes / 1073741824).toFixed(2) + " GB"; }
	else if (bytes >= 1048576) { bytes = (bytes / 1048576).toFixed(2) + " MB"; }
	else if (bytes >= 1024) { bytes = (bytes / 1024).toFixed(2) + " kB"; }
	else if (bytes > 1) { bytes = bytes + " bytes"; }
	else if (bytes == 1) { bytes = bytes + " byte"; }
	else { bytes = "0 bytes"; }
	return bytes;
}

function processTags(tagArray) {
	for (const element of tagArray) {
		const tagmac = element.mac;
		tagDB[tagmac] = element;

		let div = $('#tag' + tagmac);
		if (div == null) {
			div = $('#tagtemplate').cloneNode(true);
			div.setAttribute('id', 'tag' + tagmac);
			div.dataset.mac = tagmac;
			div.dataset.hwtype = -1;
			$('#taglist').appendChild(div);
		}

		div.style.display = 'block';

		if (element.contentMode == 255) {
			div.remove();
			showMessage(tagmac + " removed by remote AP");
			continue;
		}

		if (element.isexternal) {
			$('#tag' + tagmac + ' .mac').innerHTML = tagmac + " via ext AP";
		} else {
			$('#tag' + tagmac + ' .mac').innerHTML = tagmac;
		}
		let alias = element.alias;
		if (!alias) {
			alias = tagmac.replace(/^0{1,4}/, '');
			if (alias.match(/^4467/)) {
				let macdigit = Number.parseInt(alias.substr(4, 2), 16) & 0x1f;
				let model = String.fromCharCode(macdigit + 65);
				if (model >= 'A' && model <= 'Z') {
					macdigit = Number.parseInt(alias.substr(6, 2), 16) & 0x1f;
					model += String.fromCharCode(macdigit + 65);
					alias = model + alias.substr(8, 8) + 'x'
				}
			}
		}
		if ($('#tag' + tagmac + ' .alias').innerHTML != alias) {
			$('#tag' + tagmac + ' .alias').innerHTML = alias;
		}

		let contentDefObj = getContentDefById(element.contentMode);
		if (contentDefObj) $('#tag' + tagmac + ' .contentmode').innerHTML = contentDefObj.name;
		if (element.RSSI) {
			div.dataset.hwtype = element.hwType;
			(async () => {
				const localTagmac = tagmac;
				const data = await getTagtype(element.hwType);
				div.dataset.usetemplate = data.usetemplate;
				if (data.usetemplate != 0) {
					const template = await getTagtype(data.usetemplate);
				}
				$('#tag' + localTagmac + ' .model').innerHTML = data.name;
				$('#tag' + localTagmac + ' .resolution').innerHTML = data.width + "x" + data.height;
				if (element.ver != 0 && element.ver != 1) {
					div.dataset.ver = element.ver;
					$('#tag' + localTagmac + ' .resolution').innerHTML += ` fw:${element.ver} 0x${element.ver.toString(16)}`;
				}

				if (!apConfig.preview || element.contentMode == 20) {
					$('#tag' + tagmac + ' .tagimg').style.display = 'none'
				} else if (div.dataset.hash != element.hash && div.dataset.hwtype > -1) {
					let cachetag = element.hash;
					if (element.hash != '00000000000000000000000000000000') {
						if (element.isexternal && element.contentMode == 12) {
							loadImage(tagmac, 'http://' + tagDB[tagmac].apip + '/current/' + tagmac + '.raw?' + cachetag);
						} else {
							loadImage(tagmac, 'current/' + tagmac + '.raw?' + cachetag);
						}
					} else {
						$('#tag' + tagmac + ' .tagimg').style.display = 'none'
					}
					div.dataset.hash = element.hash;
				}
			})();

			let statusline = "";
			if (element.RSSI != 100) {
				if (element.ch > 0) statusline += `CH ${element.ch}, `;
				statusline += `RSSI ${element.RSSI}, LQI ${element.LQI}`;
			} else {
				statusline = "AP";
			}
			if (element.batteryMv != 0 && element.batteryMv != 1337) {
				statusline += ", " + (element.batteryMv == 2600 ? "&#x2265;" : "") + (element.batteryMv / 1000) + "V";
			}
			$('#tag' + tagmac + ' .received').innerHTML = statusline;
			$('#tag' + tagmac + ' .received').style.opacity = "1";

		} else {
			$('#tag' + tagmac + ' .model').innerHTML = "waiting for hardware type";
			$('#tag' + tagmac + ' .received').style.opacity = "0";
			$('#tag' + tagmac + ' .resolution').innerHTML = "";
		}

		if (element.nextupdate > 1672531200 && element.nextupdate != 3216153600) {
			const date = new Date(element.nextupdate * 1000);
			const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
			$('#tag' + tagmac + ' .nextupdate').innerHTML = "<span>next update</span>" + date.toLocaleString('nl-NL', options);
		} else {
			$('#tag' + tagmac + ' .nextupdate').innerHTML = "";
		}
		if (element.nextupdate < (Date.now() / 1000) - servertimediff) {
			$('#tag' + tagmac + ' .waitingicon').style.display = 'inline-block';
		} else {
			$('#tag' + tagmac + ' .waitingicon').style.display = 'none';
		}

		if (element.nextcheckin > 1672531200) {
			div.dataset.nextcheckin = element.nextcheckin;
		} else {
			div.dataset.nextcheckin = element.lastseen + 60;
		}

		div.style.opacity = '1';
		$('#tag' + tagmac + ' .lastseen').style.color = "black";
		div.classList.remove("tagpending");
		div.dataset.lastseen = element.lastseen;
		div.dataset.wakeupreason = element.wakeupReason;
		div.dataset.nextupdate = element.nextupdate;
		div.dataset.channel = element.ch;
		div.dataset.isexternal = element.isexternal;
		$('#tag' + tagmac + ' .warningicon').style.display = 'none';
		$('#tag' + tagmac).style.background = "#ffffff";
		if (element.contentMode == 12 || element.nextcheckin == 3216153600) $('#tag' + tagmac).style.background = "#e4e4e0";

		switch (parseInt(element.wakeupReason)) {

			case WAKEUP_REASON_TIMED:
				break;
			case WAKEUP_REASON_BOOT:
			case WAKEUP_REASON_FIRSTBOOT:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "<font color=yellow>First boot</font>"
				$('#tag' + tagmac).style.background = "#b0d0b0";
				break;
			case WAKEUP_REASON_GPIO:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "GPIO wakeup"
				$('#tag' + tagmac).style.background = "#c8f1bb";
				break;
			case WAKEUP_REASON_BUTTON1:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "Button 1 pressed"
				$('#tag' + tagmac).style.background = "#c8f1bb";
				break;
			case WAKEUP_REASON_BUTTON2:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "Button 2 pressed"
				$('#tag' + tagmac).style.background = "#c8f1bb";
				break;
			case WAKEUP_REASON_BUTTON3:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "Button 3 pressed"
				$('#tag' + tagmac).style.background = "#c8f1bb";
				break;
			case WAKEUP_REASON_NFC:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "NFC wakeup"
				$('#tag' + tagmac).style.background = "#c8f1bb";
				break;
			case WAKEUP_REASON_NETWORK_SCAN:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "<font color=yellow>Network scan</font>"
				$('#tag' + tagmac).style.background = "#c0c0d0";
				break;
			case WAKEUP_REASON_WDT_RESET:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "Watchdog reset!"
				$('#tag' + tagmac).style.background = "#d0a0a0";
				break;
			case WAKEUP_REASON_FAILED_OTA_FW:
				$('#tag' + tagmac + ' .nextcheckin').innerHTML = "Firmware update rejected!"
				$('#tag' + tagmac).style.background = "#f0a0a0";
				break;
		}
		$('#tag' + tagmac + ' .pendingicon').style.display = (element.pending ? 'inline-block' : 'none');
		$('#tag' + tagmac + ' .pendingicon').innerHTML = element.pending;
		div.classList.add("tagflash");
		(function (tagmac) {
			setTimeout(function () { $('#tag' + tagmac).classList.remove("tagflash"); }, 1400);
		})(tagmac);
		if (element.pending) div.classList.add("tagpending");

		previewWindows.forEach((previewWindow, index) => {
			if (previewWindow && !previewWindow.closed) {
				if (previewWindow.mac === tagmac) {
					previewWindow.updateMessage(element);
				}
			} else {
				previewWindows.splice(index, 1);
			}
		});
	}
	GroupSortFilter();
}

function updatecards() {
	if (servertimediff > 1000000000) servertimediff = 0;
	let tagcount = 0;
	let pendingcount = 0;
	let timeoutcount = 0;
	let lowbattcount = 0;

	const taglistElement = $('#taglist');
	if (!taglistElement) return; // Exit if taglist element doesn't exist
	
	taglistElement.querySelectorAll('[data-mac]').forEach(item => {
		let tagmac = item.dataset.mac;
		tagcount++;
		if (tagDB[tagmac].batteryMv < 2400 && tagDB[tagmac].batteryMv != 0 && tagDB[tagmac].batteryMv != 1337) lowbattcount++;
		if (item.dataset.lastseen && item.dataset.lastseen > (Date.now() / 1000) - servertimediff - 30 * 24 * 3600 * 60) {
			let idletime = (Date.now() / 1000) - servertimediff - item.dataset.lastseen;
			$('#tag' + tagmac + ' .lastseen').innerHTML = "<span>last seen</span>" + displayTime(Math.floor(idletime)) + " ago";
			if ((Date.now() / 1000) - servertimediff - apConfig.maxsleep * 60 - 300 > item.dataset.nextcheckin) {
				$('#tag' + tagmac + ' .warningicon').style.display = 'inline-block';
				$('#tag' + tagmac).classList.remove("tagpending")
				$('#tag' + tagmac).style.background = '#e0e0a0';
				timeoutcount++;
			} else {
				if (tagDB[tagmac].pending) pendingcount++;
			}
			if (idletime > 24 * 3600) {
				$('#tag' + tagmac).style.opacity = '.5';
				$('#tag' + tagmac + ' .lastseen').style.color = "red";
			}
		} else {
			if ($('#tag' + tagmac + ' .lastseen')) {
				$('#tag' + tagmac + ' .lastseen').innerHTML = ""
			} else {
				console.log(tagmac + " not found")
			}
		}

		if (item.dataset.nextcheckin == 3216153600) {
			$('#tag' + tagmac + ' .nextcheckin').innerHTML = "In deep sleep";
		} else if (item.dataset.nextcheckin > 1672531200 && parseInt(item.dataset.wakeupreason) == 0) {
			let nextcheckin = item.dataset.nextcheckin - ((Date.now() / 1000) - servertimediff);
			$('#tag' + tagmac + ' .nextcheckin').innerHTML = "<span>expected checkin</span>" + displayTime(Math.floor(nextcheckin));
		} else {
			// $('#tag' + tagmac + ' .nextcheckin').innerHTML = "";
		}

		if (item.dataset.nextupdate < (Date.now() / 1000) - servertimediff) {
			$('#tag' + tagmac + ' .waitingicon').style.display = 'inline-block';
		} else {
			$('#tag' + tagmac + ' .waitingicon').style.display = 'none';
		}
	})

	$('#dashboardTagCount').innerHTML = tagcount;
	$('#dashboardPending').innerHTML = pendingcount;
	$('#dashboardLowBatt').innerHTML = lowbattcount;
	const dashboardTimeout = $('#dashboardTimeout');
	if (dashboardTimeout) dashboardTimeout.innerHTML = timeoutcount;
	
	// Show/hide no tags message
	const noTagsMessage = $('#noTagsMessage');
	const taglistContainer = $('#taglist');
	if (noTagsMessage && taglistContainer) {
		if (tagcount === 0) {
			noTagsMessage.style.display = 'block';
			taglistContainer.style.display = 'none';
		} else {
			noTagsMessage.style.display = 'none';
			taglistContainer.style.display = 'block';
		}
	}
}

const clearlogBtn = $('#clearlog');
if (clearlogBtn) {
	clearlogBtn.addEventListener("click", (event) => {
		const messagesEl = $('#messages');
		if (messagesEl) messagesEl.innerHTML = '';
	});
}

document.querySelectorAll('.closebtn').forEach(button => {
	button.addEventListener('click', (event) => {
		event.target.parentNode.style.display = 'none';
		$('#advancedoptions').style.height = '0px';
	});
});

document.querySelectorAll('.closebtn2').forEach(button => {
	button.addEventListener('click', (event) => {
		event.target.parentNode.close();
		$('#advancedoptions').style.height = '0px';
	});
});

//clicking on a tag: load config dialog for tag
const taglistElement = $('#taglist');
if (taglistElement) {
	taglistElement.addEventListener("click", (event) => {
		let currentElement = event.target;
		while (currentElement !== taglistElement) {
		if (currentElement.classList.contains("tagcard")) {
			break;
		}
		currentElement = currentElement.parentNode;
	}
	if (!currentElement.classList.contains("tagcard")) {
		return;
	}
	const mac = currentElement.dataset.mac;
	loadContentCard(mac);
})

function loadContentCard(mac) {
	$('#cfgmac').innerHTML = mac;
	$('#cfgmac').dataset.mac = mac;
	fetch("get_db?mac=" + mac)
		.then(response => response.json())
		.then(data => {
			const tagdata = data.tags[0];
			$('#cfgalias').value = tagdata.alias;
			$('#cfgmore').style.display = "none";
			if (populateSelectTag(tagdata.hwType, tagdata.capabilities)) {
				$('#cfgcontent').parentNode.style.display = "flex";
				$('#cfgcontent').value = tagdata.contentMode;
				$('#cfgcontent').dataset.json = tagdata.modecfgjson;
				contentselected();
				if (tagdata.contentMode != 12) $('#cfgmore').style.display = 'block';
			} else {
				$('#customoptions').innerHTML = "";
				$('#cfgcontent').parentNode.style.display = "none";
			}
			$('#cfgrotate').value = tagdata.rotate;
			$('#cfglut').value = tagdata.lut;
			$('#cfginvert').value = tagdata.invert;
			$('#cfgmore').innerHTML = '&#x25BC;';
			$('#cfgmac').dataset.ch = tagdata.ch;
			$('#configbox').showModal();
		})
}

let typedString = '';
document.addEventListener('keypress', (event) => {
	const keyPressed = event.key;
	if (keyPressed.length === 1) {
		typedString += keyPressed;
	} else if (keyPressed === 'Enter') {
		typedString = ('0000' + typedString).slice(-16);
		const hexRegExp = /^[0-9A-Fa-f]{16}$/;
		const isMac = typedString.match(hexRegExp);
		if (isMac) {
			console.log('scanned ' + typedString);
			loadContentCard(typedString);
		}
		typedString = '';
	}
});
}

const cfgMoreElement = $('#cfgmore');
if (cfgMoreElement) {
	cfgMoreElement.onclick = function () {
		$('#cfgmore').innerHTML = $('#advancedoptions').style.height == '0px' ? '&#x25B2;' : '&#x25BC;';
		$('#advancedoptions').style.height = $('#advancedoptions').style.height == '0px' ? $('#advancedoptions').scrollHeight + 'px' : '0px';
	};
}

$('#cfgsave').onclick = function () {
	let contentMode = $('#cfgcontent').value;
	let contentDef = getContentDefById(contentMode);
	let extraoptions = contentDef?.param ?? null;
	let obj = {};

	let formData = new FormData();
	formData.append("mac", $('#cfgmac').dataset.mac);
	formData.append("alias", $('#cfgalias').value);

	if (contentMode) {
		extraoptions?.forEach(element => {
			if (document.getElementById('opt' + element.key)) {
				obj[element.key] = document.getElementById('opt' + element.key).value;
			}
		});
		formData.append("contentmode", contentMode);
		formData.append("modecfgjson", JSON.stringify(obj));
	} else {
		formData.append("contentmode", "0");
		formData.append("modecfgjson", String());
	}

	formData.append("rotate", $('#cfgrotate').value);
	formData.append("lut", $('#cfglut').value);
	formData.append("invert", $('#cfginvert').value);

	fetch("save_cfg", {
		method: "POST",
		body: formData
	})
		.then(response => response.text())
		.then(data => showMessage(data))
		.catch(error => showMessage('Error: ' + error, true));

	$('#advancedoptions').style.height = '0px';
	$('#configbox').close();
	backupTagDB();
}

function sendCmd(mac, cmd) {
	let formData = new FormData();
	formData.append("mac", mac);
	formData.append("cmd", cmd);
	fetch("tag_cmd", {
		method: "POST",
		body: formData
	})
		.then(response => response.text())
		.then(data => {
			let div = $('#tag' + mac);
			if (cmd == "del") div.remove();
			showMessage(data);
		})
		.catch(error => showMessage('Error: ' + error, true));
	$('#advancedoptions').style.height = '0px';
	$('#configbox').close();
}

$('#cfgdelete').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "del");
}

$('#cfgclrpending').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "clear");
}

$('#cfgrefresh').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "refresh");
}

$('#cfgtagreboot').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "reboot");
}

$('#cfgscan').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "scan");
}

$('#cfgdeepsleep').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "deepsleep");
}

$('#cfgreset').onclick = function () {
	sendCmd($('#cfgmac').dataset.mac, "reset");
}

$('#cfgautoupdate').onclick = async function () {
	let obj = {};
	let formData = new FormData();
	var mac = $('#cfgmac').dataset.mac;
	formData.append("mac", mac);
	formData.append("alias", $('#cfgalias').value);

	var repo = apConfig.repo || 'OpenEPaperLink/OpenEPaperLink';
	var infourl = "https://raw.githubusercontent.com/" + repo + "/master/binaries/Tag/tagotaversions.json";
	var info = "";
	await fetch(infourl, { method: 'GET' }).then(await function (response) { return response.json(); }).then(await function (json) { info = json; });
	var tagtype = ("0" + (Number($('#tag' + mac).dataset.hwtype).toString(16))).slice(-2).toUpperCase();
	var name = info[0][tagtype]["type"];
	if (name == "") {
		alert("Tag id not known");
		return false;
	}
	var version = info[0][tagtype]["version"];
	var md5 = info[0][tagtype]["md5"];

	if (name.substr(0, 6) == "chroma") {
		var variation = (Number.parseInt(mac.substr(4, 2), 16) >> 5).toString();
		if (variation != '0') {
			var name = info[0][tagtype]["type_" + variation];
			version = info[0][tagtype]['version_' + variation];
			md5 = info[0][tagtype]['md5_' + variation];
		}
	}

	var currentversion = $('#tag' + mac).dataset.ver | 0;
	if (confirm(`Current version: ${currentversion} 0x${currentversion.toString(16)}\nPending version: ${parseInt(version, 16)} 0x${parseInt(version, 16).toString(16)}\n\nNOTE: Every OTA update comes with a risk of bricking the tag, if it is bricked, it only can be recoverd with a tag flasher. Please only update if you need the new features.\n\nPress Cancel if you want to get out of here, or press OK if you want to proceed with the update.`)) {

		var fullFilename = name + "_" + version + ".bin";
		var filepath = "/" + fullFilename;
		var binurl = "https://raw.githubusercontent.com/" + repo + "/master/binaries/Tag/" + fullFilename;
		var url = "check_file?path=" + encodeURIComponent(filepath);
		var response = await fetch(url);
		if (response.ok) {
			var data = await response.json();
			if (data.filesize == 0 || data.md5 != md5) {
				try {
					var response = await fetch(binurl);
					var fileContent = await response.blob();
					var formData2 = new FormData();
					formData2.append('path', filepath);
					formData2.append('file', fileContent, fullFilename);
					var uploadResponse = await fetch('littlefs_put', {
						method: 'POST',
						body: formData2
					});
					if (!uploadResponse.ok) {
						showMessage('Error: auto update failed to upload', true);
					}
				} catch (error) {
					showMessage('Error: ' + error, true);
				}
			}
		} else showMessage('Error: auto update failed', true);
		var response = await fetch(url);
		if (response.ok) {
			var data = await response.json();
			if (data.filesize == 0 || data.md5 != md5) {
				showMessage('Error: auto update failed to download. File is empty or md5 check fails', true);
			}
			//sucess
			else obj["filename"] = filepath;
		}
		else showMessage('Error: auto update failed', true);
		formData.append("contentmode", 5);
		formData.append("modecfgjson", JSON.stringify(obj));
		fetch("save_cfg", {
			method: "POST",
			body: formData
		})
			.then(response => response.text())
			.then(data => showMessage(data))
			.catch(error => showMessage('Error: ' + error, true));
	}
	$('#configbox').close();
}

$('#rebootbutton').onclick = function (event) {
	event.preventDefault();
	if (!confirm('Reboot AP now?')) return;
	socket.close();
	fetch("reboot", {
		method: "POST"
	});
	alert('Rebooted. Webpage will reload.');
	location.reload()
}

$('#configbox').addEventListener('click', (event) => {
	if (event.target.nodeName === 'DIALOG') {
		$('#configbox').close();
	}
});

document.addEventListener("loadTab", function (event) {
	activeTab = event.detail;
	switch (event.detail) {
		case 'configtab':
		case 'aptab':
			fetch("get_ap_config")
				.then(response => response.json())
				.then(data => {
					if (data && 'alias' in data) {
						apConfig = data;
						$('#apcfgalias').value = data.alias;
						$('#apcfgchid').value = data.channel;
						$('#apcfgsubgigchid').value = data.subghzchannel;
						$('#apcfgble').value = data.ble;
						$("#apcfgledbrightness").value = data.led;
						$("#apcfgtftbrightness").value = data.tft;
						$("#apcfglanguage").value = data.language;
						$("#apclatency").value = data.maxsleep;
						$("#apcpreventsleep").value = data.stopsleep;
						$("#apcpreview").value = data.preview;
						$("#apcnightlyreboot").value = data.nightlyreboot;
						$("#apclock").value = data.lock;
						$("#apcwifipower").value = data.wifipower;
						$("#apctimezone").value = data.timezone;
						$("#apcnight1").value = data.sleeptime1;
						$("#apcnight2").value = data.sleeptime2;
						$("#apcdiscovery").value = data.discovery;
						$("#apcshowtimestamp").value = data.showtimestamp;
					}
				})
			$('#apcfgmsg').innerHTML = '';
			break;
		case 'updatetab':
			$('#updateconsole').innerHTML = '';
			loadOTA();
			break;
		case 'flashtab':
			// $('#flashconsole').innerHTML = '';
			loadFlash();
			break;
	}
	if (previousTab == 'flashtab' && activeTab != 'flashtab' && flashmodule && typeof (flashmodule.wsCmd) === "function") {
		flashmodule.wsCmd(flashmodule.WEBFLASH_BLUR);
	}
	previousTab = activeTab;
});

$('#apcfgsave').onclick = function () {
	let formData = new FormData();
	formData.append("alias", $('#apcfgalias').value);
	formData.append("channel", $('#apcfgchid').value);
	formData.append("subghzchannel", $('#apcfgsubgigchid').value);
	formData.append('ble', $('#apcfgble').value);
	formData.append('led', $('#apcfgledbrightness').value);
	formData.append('tft', $('#apcfgtftbrightness').value);
	formData.append('language', $('#apcfglanguage').value);
	formData.append('maxsleep', $('#apclatency').value);
	formData.append('stopsleep', $('#apcpreventsleep').value);
	formData.append('preview', $('#apcpreview').value);
	formData.append('nightlyreboot', $('#apcnightlyreboot').value);
	formData.append('lock', $('#apclock').value);
	formData.append('wifipower', $('#apcwifipower').value);
	formData.append('timezone', $('#apctimezone').value);
	formData.append('sleeptime1', $('#apcnight1').value);
	formData.append('sleeptime2', $('#apcnight2').value);
	formData.append('discovery', $('#apcdiscovery').value);
	formData.append('showtimestamp', $('#apcshowtimestamp').value);
	fetch("save_apcfg", {
		method: "POST",
		body: formData
	})
		.then(response => response.text())
		.then(data => {
			showMessage(data);
			window.dispatchEvent(loadConfig);
			$('#apcfgmsg').innerHTML = 'OK, Saved';
		})
		.catch(error => showMessage('Error: ' + error, true));
}

$('#uploadButton').onclick = function () {
	const file = $('#fileInput')?.files[0];
	if (file) {
		const formData = new FormData();
		formData.append('file', file);
		fetch('restore_db', {
			method: 'POST',
			body: formData
		})
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				return response.text();
			})
			.then(data => {
				alert('TagDB restored. Webpage will reload.');
				location.reload();
			})
			.catch(error => {
				alert('Error uploading file: ' + error);
			});
	} else {
		alert('No file selected');
	}
}

$('#restoreFromLocal').onclick = function () {
	var tagDBrestore = localStorage.getItem('tagDB');
	if (tagDBrestore) {
		tagDBobj = JSON.parse(tagDBrestore);
		var tagResult = [];

		for (var key in tagDBobj) {
			if (tagDBobj.hasOwnProperty(key)) {
				tagResult.push([tagDBobj[key]]);
			}
		}

		const blob = new Blob([JSON.stringify(tagResult, null, '\t')], { type: 'application/json' });
		const formData = new FormData();
		formData.append('file', blob, 'tagResult.json');

		fetch('restore_db', {
			method: 'POST',
			body: formData
		})
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				return response.text();
			})
			.then(data => {
				alert('TagDB restored. Webpage will reload.');
				location.reload();
			})
			.catch(error => {
				alert('Error uploading file: ' + error);
			});
	} else {
		alert('No data found in localStorage');
	}
}

async function loadOTA() {
	otamodule = await import('./ota.js?v=' + Date.now());
	otamodule.initUpdate();
}

async function loadFlash() {
	flashmodule = await import('./flash.js?v=' + Date.now());
	flashmodule.init();
}

$('#paintbutton').onclick = function () {
	if (paintShow) {
		paintShow = false;
		$('#cfgsave').parentNode.style.display = 'block';
		contentselected();
	} else {
		paintShow = true;
		$('#cfgsave').parentNode.style.display = 'none';
		$('#customoptions').innerHTML = "<div id=\"buttonbar\"></div><div id=\"canvasdiv\"></div><div id=\"layersdiv\"></div><p id=\"savebar\"></p>";
		const mac = $('#cfgmac').dataset.mac
		const hwtype = $('#tag' + mac).dataset.hwtype;
		const [width, height] = [tagTypes[hwtype].width, tagTypes[hwtype].height] || [0, 0];
		if (paintLoaded) {
			startPainter(mac, width, height, tagTypes[hwtype]);
		} else {
			loadScript('painter.js', function () {
				startPainter(mac, width, height, tagTypes[hwtype]);
			});
		}
	}
}

function loadScript(url, callback) {
	let script = document.createElement('script');
	script.src = url;
	script.onload = function () {
		if (callback) {
			callback();
		}
	};
	document.head.appendChild(script);
}

function contentselected() {
	let contentMode = $('#cfgcontent').value;
	$('#customoptions').innerHTML = "";
	let obj = {};
	if ($('#cfgcontent').dataset.json && ($('#cfgcontent').dataset.json != "null")) {
		obj = JSON.parse($('#cfgcontent').dataset.json);
	}
	$('#paintbutton').style.display = 'none';
	if (contentMode) {
		let contentDef = getContentDefById(contentMode);
		if (contentDef) {
			$('#customoptions').innerHTML = "<p>" + contentDef?.desc + "</p>"
		}
		$('#paintbutton').style.display = (contentMode == 22 || contentMode == 23 ? 'inline-block' : 'none');
		let extraoptions = contentDef?.param ?? null;
		extraoptions?.forEach(element => {
			let label = document.createElement("label");
			label.innerHTML = element.name;
			label.setAttribute("for", 'opt' + element.key);
			if (element.desc) {
				label.style.cursor = 'help';
				label.title = element.desc;
			}
			let input = document.createElement("input");
			switch (element.type) {
				case 'text':
					input.type = "text";
					break;
				case 'int':
					input.type = "number";
					break;
				case 'ro':
					input.type = "text";
					input.disabled = true;
					break;
				case 'jpgfile':
				case 'binfile':
				case 'jsonfile':
					input = document.createElement("select");
					fetch('edit?list=%2F&recursive=1')
						.then(response => response.json())
						.then(data => {
							let files = data.filter(item => item.type === "file" && item.name.endsWith(".jpg"));
							if (element.type == 'binfile') files = data.filter(item => item.type === "file" && item.name.endsWith(".bin"));
							if (element.type == 'jsonfile') files = data.filter(item => item.type === "file" && item.name.endsWith(".json"));
							const optionElement = document.createElement("option");
							optionElement.value = "";
							optionElement.text = "";
							input.appendChild(optionElement);
							files.forEach(item => {
								const optionElement = document.createElement("option");
								optionElement.value = item.name;
								optionElement.text = item.name;
								if (obj[element.key] === item.name) optionElement.selected = true;
								input.appendChild(optionElement);
							})
						})
						.catch(error => {
							console.error("Error fetching JSON data:", error);
						});
					break;
				case 'select':
				case 'chanselect':
					input = document.createElement("select");
					let options;
					if (element.type == 'chanselect') {
						if ($('#cfgmac').dataset.ch < 100) {
							options = element.chans;
						}
						else {
							options = element.subchans;
						}
					}
					else {
						options = element.options
					}

					for (const key in options) {
						const optionElement = document.createElement("option");
						optionElement.value = key;
						optionElement.text = options[key];
						if (options[key].substring(0, 1) == "-") {
							optionElement.text = options[key].substring(1);
							optionElement.selected = true;
						} else {
							optionElement.selected = false;
						}
						input.appendChild(optionElement);
					}
					break;
				case 'geoselect':
					input.type = "text";
					input.classList.add("geoselect");
					input.setAttribute("autocomplete", "off");
					break;
			}
			input.id = 'opt' + element.key;
			input.title = element.desc;
			if (obj[element.key]) input.value = obj[element.key];
			let p = document.createElement("p");
			p.appendChild(label);
			p.appendChild(input);
			if (element.type == 'geoselect') {
				input.addEventListener('input', debounce(searchLocations, 300));
				const resultsContainer = document.createElement('div');
				resultsContainer.id = 'georesults';
				p.appendChild(resultsContainer);
			}
			$('#customoptions').appendChild(p);
		});
	}
	paintShow = false;
	$('#cfgsave').parentNode.style.display = 'block';
}

function populateSelectTag(hwtype, capabilities) {
	let selectTag = $("#cfgcontent");
	selectTag.innerHTML = "";
	let optionsAdded = false;
	let option;
	cardconfig.forEach(item => {
		const capcheck = item.capabilities ?? 0;
		if (tagTypes[hwtype].contentids?.includes(item.id) && (capabilities & capcheck || capcheck == 0) && (apConfig.savespace == 0 || !item.properties?.includes("savespace"))) {
			option = document.createElement("option");
			option.value = item.id;
			option.text = item.name;
			selectTag.appendChild(option);
			optionsAdded = true;
		}
	});

	let rotateTag = $("#cfgrotate");
	rotateTag.innerHTML = "";

	for (let i = 0; i < 4; i++) {
		if (i == 0 || tagTypes[hwtype].width == tagTypes[hwtype].height || (i == 2)) {
			option = document.createElement("option");
			option.value = i;
			option.text = (i * 90) + " degrees";
			rotateTag.appendChild(option);
		}
	}

	let lutTag = $("#cfglut");
	lutTag.innerHTML = "";

	option = document.createElement("option");
	option.value = "0";
	if (tagTypes[hwtype].shortlut == 0) {
		option.text = "Always full refresh";
	} else {
		option.text = "auto";
	}
	lutTag.appendChild(option);

	if (tagTypes[hwtype].shortlut > 0) {
		option = document.createElement("option");
		option.value = "1";
		option.text = "Always full refresh";
		lutTag.appendChild(option);
		option = document.createElement("option");
		option.value = "2";
		option.text = "Fast (no reds)";
		lutTag.appendChild(option);
		option = document.createElement("option");
		option.value = "3";
		option.text = "Fastest (ghosting!)";
		lutTag.appendChild(option);
	}

	return optionsAdded;
}

function getContentDefById(id) {
	if (id == null) return null;
	const obj = cardconfig.find(item => item.id == id);
	return obj || null;
}

function showMessage(message, iserr) {
	const messages = $('#messages');
	const date = new Date();
	const time = date.toLocaleTimeString('nl-NL', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	if (message.startsWith('{')) {
		messages.insertAdjacentHTML("afterbegin", '<li class="new">' + htmlEncode(time) + ' <span class="mono">' + message.replace(/"([^"]+)"/g, '"<span class="quote">$1</span>"') + '</span></li>');
	} else if (iserr) {
		messages.insertAdjacentHTML("afterbegin", '<li class="new error">' + htmlEncode(time + ' ' + message) + '</li>');
	} else {
		messages.insertAdjacentHTML("afterbegin", '<li class="new">' + htmlEncode(time + ' ' + message) + '</li>');

		const hexRegex = /^[0-9A-Fa-f]{16}.*/;
		if (hexRegex.test(message.substring(0, 16))) {
			let div = $('#tag' + message.substring(0, 16));
			if (div) {
				div.classList.add("tagxfer");
				(function (tagmac) {
					setTimeout(function () { $('#tag' + tagmac).classList.remove("tagxfer"); }, 200);
				})(message.substring(0, 16));
			}
		}
	}
}

function htmlEncode(input) {
	const textArea = document.createElement("textarea");
	textArea.innerText = input;
	return textArea.innerHTML.split("<br>").join("\n");
}

function loadImage(id, imageSrc) {
	imageQueue.push({ id, imageSrc });
	if (!isProcessing) {
		processQueue();
	}
}

function processQueue() {
	if (imageQueue.length === 0) {
		isProcessing = false;
		return;
	}
	isProcessing = true;
	if (!finishedInitialLoading) {
		setTimeout(processQueue, 100);
		return;
	}
	const { id, imageSrc } = imageQueue.shift();
	const hwtype = $('#tag' + id).dataset?.hwtype;
	if (tagTypes[hwtype]?.busy) {
		imageQueue.push({ id, imageSrc });
		setTimeout(processQueue, 100);
		return;
	};

	const canvas = $('#tag' + id + ' .tagimg');
	canvas.style.display = 'block';

	fetch(imageSrc, { cache: "force-cache" })
		.then(response => response.arrayBuffer())
		.then(buffer => {

			drawCanvas(buffer, canvas, hwtype, id, true);
			processQueue();
		})
		.catch(error => {
			console.error('processQueue error:', error);
			processQueue();
		});
}

function drawCanvas(buffer, canvas, hwtype, tagmac, doRotate) {
	data = new Uint8ClampedArray(buffer);
	if (data.length > 0 && tagTypes[hwtype].zlib > 0 && $('#tag' + tagmac).dataset.ver >= tagTypes[hwtype].zlib) {
		data = processZlib(data);
	}
	if (data.length > 0 && tagTypes[hwtype].g5 > 0 && $('#tag' + tagmac).dataset.ver >= tagTypes[hwtype].g5) {
		const headerSize = data[0];
		let bufw = (data[2] << 8) | data[1];
		let bufh = (data[4] << 8) | data[3];
		if ((bufw == tagTypes[hwtype].width || bufw == tagTypes[hwtype].height) && (bufh == tagTypes[hwtype].width || bufh == tagTypes[hwtype].height) && (data[5] <= 3)) {
			// valid header for g5 compression
			if (data[5] == 2) bufh *= 2;
			data = processG5(data.subarray(headerSize), bufw, bufh);
		}
	}

	[canvas.width, canvas.height] = [tagTypes[hwtype].width, tagTypes[hwtype].height] || [0, 0];
	if (tagTypes[hwtype].rotatebuffer % 2) [canvas.width, canvas.height] = [canvas.height, canvas.width];
	if (tagTypes[hwtype].rotatebuffer >= 2) canvas.style.transform = 'rotate(180deg)';
	if (doRotate == false && tagTypes[hwtype].rotatebuffer == 1) {
		canvas.style.transform = 'rotate(90deg)';
		canvas.style.transformOrigin = 'top left';
		canvas.style.position = 'absolute';
		canvas.style.left = canvas.height + 15;
		canvas.style.top = 15;
	}
	if (doRotate == false && tagTypes[hwtype].rotatebuffer == 3) {
		canvas.style.transform = 'rotate(270deg)';
		canvas.style.transformOrigin = 'top left';
		canvas.style.position = 'absolute';
		canvas.style.top = (canvas.width + 15) + 'px';
		canvas.style.left = 15;
	}
	const ctx = canvas.getContext('2d');
	const imageData = ctx.createImageData(canvas.width, canvas.height);
	if (data.length == 0) {
		canvas.style.display = 'none';
	}

	if (tagTypes[hwtype].bpp == 16) {
		const is16Bit = data.length == tagTypes[hwtype].width * tagTypes[hwtype].height * 2;
		for (let i = 0; i < min(tagTypes[hwtype].width * tagTypes[hwtype].height, data.length); i++) {
			const dataIndex = is16Bit ? i * 2 : i;
			const rgb = is16Bit ? (data[dataIndex] << 8) | data[dataIndex + 1] : data[dataIndex];

			imageData.data[i * 4] = is16Bit ? ((rgb >> 11) & 0x1F) << 3 : (((rgb >> 5) & 0x07) << 5) * 1.13;
			imageData.data[i * 4 + 1] = is16Bit ? ((rgb >> 5) & 0x3F) << 2 : (((rgb >> 2) & 0x07) << 5) * 1.13;
			imageData.data[i * 4 + 2] = is16Bit ? (rgb & 0x1F) << 3 : ((rgb & 0x03) << 6) * 1.3;
			imageData.data[i * 4 + 3] = 255;
		}

	} else if ([3, 4].includes(tagTypes[hwtype].bpp)) {
		const bpp = tagTypes[hwtype].bpp;
		const colorTable = tagTypes[hwtype].colortable;
		let pixelIndex = 0;
		let bitOffset = 0;

		while (bitOffset < data.length * 8) {
			let byteIndex = bitOffset >> 3; 
			let startBit = bitOffset & 7; 
			let pixelValue = (data[byteIndex] << 8 | data[byteIndex + 1] || 0) >> (16 - bpp - startBit) & ((1 << bpp) - 1);
			let color = colorTable[pixelValue];
			imageData.data[pixelIndex * 4] = color[0];
			imageData.data[pixelIndex * 4 + 1] = color[1];
			imageData.data[pixelIndex * 4 + 2] = color[2];
			imageData.data[pixelIndex * 4 + 3] = 255;
			pixelIndex++;
			bitOffset += bpp;
		}
	} else {

		const offsetRed = (data.length >= (canvas.width * canvas.height / 8) * 2) ? canvas.width * canvas.height / 8 : 0;
		let pixelValue = 0;
		const colorTable = tagTypes[hwtype].colortable;
		for (let i = 0; i < data.length; i++) {
			for (let j = 0; j < 8; j++) {
				const pixelIndex = i * 8 + j;
				if (offsetRed) {
					pixelValue = ((data[i] & (1 << (7 - j))) ? 1 : 0) | (((data[i + offsetRed] & (1 << (7 - j))) ? 1 : 0) << 1);
				} else {
					pixelValue = ((data[i] & (1 << (7 - j))) ? 1 : 0);
				}
				imageData.data[pixelIndex * 4] = colorTable[pixelValue][0];
				imageData.data[pixelIndex * 4 + 1] = colorTable[pixelValue][1];
				imageData.data[pixelIndex * 4 + 2] = colorTable[pixelValue][2];
				imageData.data[pixelIndex * 4 + 3] = 255;
			}
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

function processZlib(data) {
	const subBuffer = data.subarray(4);
	try {
		const inflatedBuffer = pako.inflate(subBuffer);
		// to constrain window size for testing:
		// const inflatedBuffer = pako.inflate(subBuffer, { windowBits: 12 });
		const headerSize = inflatedBuffer[0];
		return inflatedBuffer.subarray(headerSize);
	} catch (err) {
		console.log('zlib: ' + err);
	}
}

function displayTime(seconds) {
	let hours = Math.floor(Math.abs(seconds) / 3600);
	let minutes = Math.floor((Math.abs(seconds) % 3600) / 60);
	let remainingSeconds = Math.abs(seconds) % 60;
	return (seconds < 0 ? '-' : '') + (hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes}`) + `:${String(remainingSeconds).padStart(2, '0')}`;
}

$("#filterOptions").addEventListener("click", function (event) {
	if (event.target.tagName === "INPUT") {
		GroupSortFilter();
	}
});

function GroupSortFilter() {
	const sortableGrid = $('#taglist');
	const gridItems = Array.from(sortableGrid.querySelectorAll('.tagcard:not(#tagtemplate)'));

	let grouping = document.querySelector('input[name="group"]:checked')?.value;
	if (grouping == undefined) {
		grouping = localStorage.getItem("grouping");
		if (grouping) document.querySelector('input[name="group"][value="' + grouping + '"]').checked = true
	} else {
		localStorage.setItem("grouping", grouping);
	}
	let sorting = document.querySelector('input[name="sort"]:checked')?.value ?? 'alias';

	gridItems.sort((a, b) => {
		let itemA = String(sorting).startsWith('data-') ? a.dataset[sorting.slice(5)] : a.querySelector('.' + sorting).textContent;
		let itemB = String(sorting).startsWith('data-') ? b.dataset[sorting.slice(5)] : b.querySelector('.' + sorting).textContent;
		if (sorting == 'data-lastseen') [itemA, itemB] = [itemB, itemA];
		if (grouping) {
			let groupA = String(grouping).startsWith('data-') ? a.dataset[grouping.slice(5)] : a.querySelector('.' + grouping).textContent;
			let groupB = String(grouping).startsWith('data-') ? b.dataset[grouping.slice(5)] : b.querySelector('.' + grouping).textContent;
			if (groupA !== groupB) {
				return groupA.localeCompare(groupB);
			} else {
				return itemA.localeCompare(itemB);
			}
		} else {
			return itemA.localeCompare(itemB);
		}
	});

	let currentGroup = null;
	let order = 1;

	let headItems = Array.from($('#taglist').getElementsByClassName('taggroup'));
	headItems.forEach(item => {
		item.dataset.clean = 1;
	})

	gridItems.forEach(item => {

		if (grouping) {
			const group = String(grouping).startsWith('data-') ? item.dataset[grouping.slice(5)] || '' : item.querySelector('.' + grouping).textContent || '';
			if (group !== currentGroup && group != '') {
				let header = document.getElementById('header' + group);
				if (!header) {
					header = document.createElement('div');
					switch (grouping) {
						case 'model':
							header.textContent = 'Tag model: ' + group;
							break;
						case 'contentmode':
							header.textContent = 'Content: ' + group;
							break;
						case 'data-channel':
							header.textContent = 'Channel: ' + group;
							break;
					}
					header.classList.add('taggroup');
					header.id = 'header' + group;
					sortableGrid.appendChild(header);
				}
				header.style.order = order++;
				header.dataset.clean = 0;
				currentGroup = group;
			}
		}

		let show = true;
		let batteryMv = tagDB[item.dataset.mac].batteryMv;
		if ($('input[name="filter"][value="remote"]').checked && item.dataset.isexternal == "false") show = false;
		if ($('input[name="filter"][value="local"]').checked && item.dataset.isexternal == "true") show = false;
		if ($('input[name="filter"][value="inactive"]').checked && item.querySelector('.warningicon').style.display != 'inline-block') show = false;
		if ($('input[name="filter"][value="pending"]').checked && !item.classList.contains("tagpending")) show = false;
		if ($('input[name="filter"][value="lowbatt"]').checked && (batteryMv >= 2400 || batteryMv == 0 || batteryMv == 1337)) show = false;
		if (!show) item.style.display = 'none'; else item.style.display = 'block';
		item.style.order = order++;
		const checkedValues = Array.from(document.querySelectorAll('input[name="filter"]:checked'))
			.map(checkbox => checkbox.value)
			.join(', ');
		$('#activefilter').innerHTML = (checkedValues ? 'filtered by ' + checkedValues : '');
	});

	headItems = Array.from($('#taglist').getElementsByClassName('taggroup'));
	headItems.forEach(item => {
		if (item.dataset.clean == 1) item.parentNode.removeChild(item);
	})
}

$('#toggleFilters').addEventListener('click', (event) => {
	event.preventDefault();
	const filterOptions = $('#filterOptions');
	filterOptions.classList.toggle('active');
	if (filterOptions.classList.contains('active')) {
		filterOptions.style.maxHeight = filterOptions.scrollHeight + 20 + 'px';
	} else {
		filterOptions.style.maxHeight = 0;
	}
});

$('#activefilter').addEventListener('click', (event) => {
	event.preventDefault();
	const filterOptions = $('#filterOptions');
	filterOptions.classList.add('active');
	filterOptions.style.maxHeight = filterOptions.scrollHeight + 20 + 'px';
});

const downloadTagtype = async (hwtype) => {
	try {
		console.log("download tagtype " + hwtype);
		let repo = apConfig.repo || 'OpenEPaperLink/OpenEPaperLink';
		let url = "https://raw.githubusercontent.com/" + repo + "/master/resources/tagtypes/" + hwtype + ".json";
		console.log(url);

		const response = await fetch(url);
		if (!response.ok) {
			console.log("github download error " + response.status);
			return response;
		}
		const clonedResponse = response.clone();
		const fileContent = await clonedResponse.blob();

		const formData = new FormData();
		formData.append('path', "/tagtypes/" + hwtype + ".json");
		formData.append('file', fileContent, hwtype + ".json");

		const uploadResponse = await fetch('littlefs_put', {
			method: 'POST',
			body: formData
		});

		if (!uploadResponse.ok) {
			console.log("upload error " + uploadResponse.status);
		}

		return response;
	} catch (error) {
		console.log('error: ' + error);
	}
};

async function getTagtype(hwtype) {
	if (tagTypes[hwtype] && tagTypes[hwtype].busy == false) {
		return tagTypes[hwtype];
	}

	// nice, but no possibility to invalidate this cache yet.
	/*
	const storedData = JSON.parse(localStorage.getItem("tagTypes"));
	if (storedData && storedData[hwtype]) {
		return storedData[hwtype];
	}
	*/

	if (getTagtypeBusy) {
		await new Promise(resolve => {
			const checkBusy = setInterval(() => {
				if (!getTagtypeBusy) {
					clearInterval(checkBusy);
					resolve();
				}
			}, 50);
		});
	}

	if (tagTypes[hwtype]?.busy) {
		await new Promise(resolve => {
			const checkBusy = setInterval(() => {
				if (!tagTypes[hwtype].busy) {
					clearInterval(checkBusy);
					resolve();
				}
			}, 50);
		});
	}

	if (tagTypes[hwtype]) {
		return tagTypes[hwtype];
	}

	try {
		getTagtypeBusy = true;
		tagTypes[hwtype] = { busy: true };
		let response = await fetch('tagtypes/' + hwtype.toString(16).padStart(2, '0').toUpperCase() + '.json');

		if (response.status === 404) {
			response = await downloadTagtype(hwtype.toString(16).padStart(2, '0').toUpperCase());
		}

		if (!response.ok) {
			let data = { name: 'unknown id ' + hwtype.toString(16).toUpperCase(), width: 0, height: 0, bpp: 0, rotatebuffer: 0, colortable: [], busy: false };
			tagTypes[hwtype] = data;
			getTagtypeBusy = false;
			return data;
		}
		const jsonData = await response.json();

		let data = {
			name: jsonData.name,
			width: parseInt(jsonData.width),
			height: parseInt(jsonData.height),
			bpp: parseInt(jsonData.bpp),
			rotatebuffer: jsonData.rotatebuffer,
			colortable: Object.values(jsonData.perceptual ?? jsonData.colortable),
			contentids: Object.values(jsonData.contentids ?? []),
			options: Object.values(jsonData.options ?? []),
			zlib: parseInt(jsonData.zlib_compression || "0", 16),
			g5: parseInt(jsonData.g5_compression || "0", 16),
			shortlut: parseInt(jsonData.shortlut),
			busy: false,
			usetemplate: parseInt(jsonData.usetemplate || "0", 10)
		};
		tagTypes[hwtype] = data;
		localStorage.setItem("tagTypes", JSON.stringify(tagTypes));
		getTagtypeBusy = false;

		return data;

	} catch (error) {
		console.error('Error fetching data:', error);
		getTagtypeBusy = false;
		return null;
	}
}

function dropUpload() {
	const dropZone = $('#taglist');
	if (!dropZone) return; // Exit if taglist doesn't exist
	let timeoutId;

	dropZone.addEventListener('dragenter', (event) => {
		const tagCard = event.target.closest('.tagcard');
		tagCard?.classList.add('drophighlight');
	});

	dropZone.addEventListener('dragover', (event) => {
		event.preventDefault();
		const tagCard = event.target.closest('.tagcard');
		tagCard?.classList.add('drophighlight');
	});

	dropZone.addEventListener('dragleave', (event) => {
		const tagCard = event.target.closest('.tagcard');
		tagCard?.classList.remove('drophighlight');
	});

	dropZone.addEventListener('drop', (event) => {
		event.preventDefault();
		const shiftKey = event.shiftKey;
		const file = event.dataTransfer.files[0];
		const tagCard = event.target.closest('.tagcard');
		const mac = tagCard.dataset.mac;
		if (tagCard && file && file.type.startsWith('image/')) {
			const itemId = tagCard.id;
			const reader = new FileReader();

			reader.onload = function (e) {
				const image = new Image();
				image.src = e.target.result;

				image.onload = function () {
					const hwtype = tagCard.dataset.hwtype;
					const [width, height] = [tagTypes[hwtype].width, tagTypes[hwtype].height] || [0, 0];
					const canvas = createCanvas(width, height);
					const ctx = canvas.getContext('2d');

					const scaleFactor = Math.max(
						canvas.width / image.width,
						canvas.height / image.height
					);

					const newWidth = image.width * scaleFactor;
					const newHeight = image.height * scaleFactor;

					const x = (canvas.width - newWidth) / 2;
					const y = (canvas.height - newHeight) / 2;

					ctx.drawImage(image, x, y, newWidth, newHeight);

					canvas.toBlob(async (blob) => {
						const formData = new FormData();
						formData.append('mac', mac);
						if (shiftKey) formData.append('dither', '2');
						formData.append('file', blob, 'image.jpg');

						try {
							const response = await fetch('imgupload', {
								method: 'POST',
								body: formData,
							});

							if (response.ok) {
								console.log('Resized image uploaded successfully');
							} else {
								console.error('Image upload failed');
							}
						} catch (error) {
							console.error('Image upload failed', error);
						}
					}, 'image/jpeg');
				};

				image.onerror = function () {
					console.error('Failed to load image.');
				};
			};
			reader.readAsDataURL(file);

		} else if (file.type === 'application/json') {

			const reader = new FileReader();
			reader.onload = function (event) {
				const jsonContent = event.target.result;
				const formData = new FormData();
				formData.append('mac', mac);
				formData.append('json', jsonContent);
				fetch('jsonupload', {
					method: 'POST',
					body: formData,
				})
					.then(response => {
						if (response.ok) {
							console.log('JSON uploaded successfully');
						} else {
							console.error('JSON upload failed');
						}
					})
					.catch(error => {
						console.error('JSON upload failed', error);
					});
			};
			reader.readAsText(file);

		}
		tagCard.classList.remove('drophighlight');
	});

	function createCanvas(width, height) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}
}

const contextMenu = $('#context-menu');

const taglistForContextMenu = $('#taglist');
if (taglistForContextMenu) {
	taglistForContextMenu.addEventListener('contextmenu', (e) => {
	e.preventDefault();

	const clickedGridItem = e.target.closest('.tagcard');
	if (clickedGridItem) {
		let mac = clickedGridItem.dataset.mac;
		const hwtype = clickedGridItem.dataset.hwtype;
		let contextMenuOptions = [];
		if (tagTypes[hwtype]?.width > 0) {
			contextMenuOptions.push(
				{ id: 'refresh', label: 'Force refresh' },
				{ id: 'clear', label: 'Clear pending status' }
			);
			if (clickedGridItem.dataset.isexternal == "false") {
				contextMenuOptions.push(
					{ id: 'scan', label: 'Scan channels' },
					{ id: 'reboot', label: 'Reboot tag' },
				);
			};
			if (tagTypes[hwtype]?.options?.includes("led")) {
				contextMenuOptions.push(
					{ id: 'ledflash', label: 'Flash the LED' },
					{ id: 'ledflash_long', label: 'Flash the LED (long)' },
					{ id: 'ledflash_stop', label: 'Stop flashing' }
				);
			}
		}
		contextMenuOptions.push(
			{ id: 'del', label: 'Delete tag from list' }
		);
		let idletime = (Date.now() / 1000) - servertimediff - clickedGridItem.dataset.lastseen;
		if ((Date.now() / 1000) - servertimediff - 600 > clickedGridItem.dataset.nextcheckin || idletime > 24 * 3600 || clickedGridItem.dataset.nextcheckin == 3216153600) {
			contextMenuOptions.push(
				{ id: 'purge', label: 'Delete all inactive tags' }
			);
		}
		contextMenu.innerHTML = '';

		const li = document.createElement('li');
		li.textContent = "Tag preview";
		li.addEventListener('click', (e) => {
			e.preventDefault();
			openPreview(mac, tagTypes[hwtype].width, tagTypes[hwtype].height);
			contextMenu.style.display = 'none';
		});
		contextMenu.appendChild(li);

		contextMenuOptions.forEach(option => {
			const li = document.createElement('li');
			li.textContent = option.label;
			li.addEventListener('click', (e) => {
				e.preventDefault();
				sendCmd(mac, option.id);
				contextMenu.style.display = 'none';
			});
			contextMenu.appendChild(li);
		});

		const contextMenuPosition = {
			left: e.clientX + window.scrollX,
			top: e.clientY + window.scrollY
		};
		contextMenu.style.left = `${contextMenuPosition.left}px`;
		contextMenu.style.top = `${contextMenuPosition.top}px`;
		contextMenu.style.display = 'block';
	}
});
}

document.addEventListener('click', () => {
	contextMenu.style.display = 'none';
});

function populateTimes(element) {
	if (!element) return; // Exit if element doesn't exist
	for (let i = 0; i < 24; i++) {
		const option = document.createElement("option");
		option.value = i;
		option.text = i.toString().padStart(2, "0") + ":00";
		element.appendChild(option);
	}
}

function populateAPCard(msg) {
	const aplistElement = $('#aplist');
	const apcardElement = $('#apcard');
	
	if (!aplistElement || !apcardElement) return; // Exit if required elements don't exist
	
	let apip = msg.ip;
	let apid = apip.replace(/\./g, "-");
	if (!$('#ap' + apid)) {
		div = apcardElement.cloneNode(true);
		div.setAttribute('id', 'ap' + apid);
		aplistElement.appendChild(div);
	}
	let alias = msg.alias;
	if (!alias) alias = apip;
	$('#ap' + apid + ' .apip').innerHTML = "<a href=\"http://" + apip + "\" target=\"_new\">" + apip + "</a>";
	$('#ap' + apid + ' .apalias').innerHTML = alias;
	$('#ap' + apid + ' .aptagcount').innerHTML = msg.count;
	$('#ap' + apid + ' .apchannel').innerHTML = msg.channel;

	const elements = document.querySelectorAll('.apchannel');
	Array.from(elements).forEach(element => {
		if (element.textContent === msg.channel && element.id !== 'ap' + apid) {
			$('#ap' + apid + ' .apchannel').style.color = 'red';
			$('#ap' + apid + ' .apchannel').innerHTML += ' conflict';
		}
	});

	if (activeTab == 'aptab') {
		populateAPInfo(apip);
	}
}

function populateAPInfo(apip) {
	let apid = apip.replace(/\./g, "-");
	fetch('http://' + apip + '/sysinfo')
		.then(response => {
			if (response.status != 200) {
				$('#ap' + apid + ' .apswversion').innerHTML = "Error fetching sysinfo: " + response.status;
				return {};
			} else {
				return response.json();
			}
		})
		.then(data => {
			if (data.env) {
				let gModuleType = "";
				if (data.hasC6 == 1) {
					gModuleType = "esp32-C6";
				}
				if (data.hasH2 == 1) {
					gModuleType = "esp32-H2";
				}
				if (data.hasTslr == 1) {
					gModuleType = "TSLR";
				}
				let version = '';
				version += `env:                ${data.env}<br>`;
				version += `build date:         ${formatEpoch(data.buildtime)}<br>`;
				version += `esp32 version:      ${data.buildversion}<br>`;
				version += `psram size:         ${data.psramsize}<br>`;
				version += `flash size:         ${data.flashsize}<br>`;
				if (gModuleType) {
					version += `${gModuleType} version: 0x${parseInt(data.ap_version).toString(16).toUpperCase()}<br>`;
				}
				$('#ap' + apid + ' .apswversion').innerHTML = version;
			}
		})
		.catch(error => {
			$('#ap' + apid + ' .apswversion').innerHTML = "Error fetching sysinfo: " + error;
		});
}

function formatEpoch(epochTime) {
	const date = new Date(epochTime * 1000); // Convert seconds to milliseconds

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');

	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function setFilterAndShow(filter) {
	$('input[name="filter"][value="remote"]').checked = false;
	$('input[name="filter"][value="local"]').checked = false;
	$('input[name="filter"][value="inactive"]').checked = (filter == 'inactive');
	$('input[name="filter"][value="pending"]').checked = (filter == 'pending');
	$('input[name="filter"][value="lowbatt"]').checked = (filter == 'lowbatt');
	GroupSortFilter();
	$(`[data-target='tagtab']`).click();
}

// geocoding typeahead

async function searchLocations() {
	const query = $(".geoselect").value.trim();
	document.getElementById('opt#lat').value = '';
	document.getElementById('opt#lon').value = '';
	if (document.getElementById('opt#tz')) document.getElementById('opt#tz').value = '';

	if (query.length === 0) {
		$('#georesults').innerHTML = '';
		return;
	}

	try {
		const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=10&language=en&format=json`);
		const data = await response.json();
		displayResults(data.results);
	} catch (error) {
		console.error('Error fetching data:', error);
	}
}

function displayResults(results) {
	$('#georesults').innerHTML = '';
	$('#georesults').style.top = $(".geoselect").offsetTop + $(".geoselect").offsetHeight + "px";
	$('#georesults').style.left = $(".geoselect").offsetLeft + 'px';
	// $('#georesults').style.width = $(".geoselect").offsetWidth + 'px';
	if (results) {
		results.forEach(result => {
			const option = document.createElement('div');
			option.textContent = result.name + ', ' + result.admin1 + ', ' + result.country;
			option.addEventListener('click', () => selectLocation(result));
			$('#georesults').appendChild(option);
		});
	}
}

function selectLocation(location) {
	$(".geoselect").value = location.name;
	document.getElementById('opt#lat').value = location.latitude;
	document.getElementById('opt#lon').value = location.longitude;
	if (document.getElementById('opt#tz')) document.getElementById('opt#tz').value = location.timezone;
	$('#georesults').innerHTML = '';
}

function debounce(func, delay) {
	let timeoutId;
	return function () {
		const context = this;
		const args = arguments;

		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(context, args);
		}, delay);
	};
}

function backupTagDB() {
	localStorage.setItem("tagDB", JSON.stringify(tagDB));
}

function openPreview(mac, w, h) {
	const previewWindow = window.open("", `PreviewWindow_${mac}`, `width=${w + 30},height=${h + 30},menubar=no,toolbar=no,location=no,status=no,resizable=no,scrollbars=no`);

	if (previewWindow) {
		previewWindow.mac = mac;
		previewWindows.push(previewWindow);
		const element = tagDB[mac];

		previewWindow.hash = "";
		previewWindow.pending = 0;
		previewWindow.focus();

		console.log(element);
		console.log(tagTypes[element.hwType]);
		previewWindow.document.head.innerHTML = `<title>${tagTypes[element.hwType].name + ' ' + mac}</title>`;
		previewWindow.document.body.style.backgroundColor = "#dddddd";
		previewWindow.document.body.style.margin = "15px";
		previewWindow.document.body.style.overflow = "hidden";
		previewWindow.document.body.innerHTML = `<canvas id="preview" style="border:1px solid #888888;image-rendering: pixelated;"></canvas>`;

		showPreview(previewWindow, element);

		previewWindow.updateMessage = function (data) {
			//const messageDisplay = previewWindow.document.getElementById('messageDisplay');
			showPreview(previewWindow, data);
		};

	} else {
		console.error("Failed to open preview window.");
	}
}

function showPreview(previewWindow, element) {
	let imageSrc = "";
	const canvas = previewWindow.document.getElementById('preview');

	if (element.pending != previewWindow.pending && element.pending != 0) {
		console.log('refresh ' + element.mac);
		previewWindow.pending = element.pending;
		previewWindow.hash = "";
		let cachetag = Date.now();

		if (element.isexternal && element.contentMode == 12) {
			imageSrc = 'http://' + tagDB[element.mac].apip + '/getdata?mac=' + element.mac + '&md5=0000000000000000&c=' + cachetag;
		} else {
			imageSrc = '/getdata?mac=' + element.mac + '&md5=0000000000000000&c=' + cachetag;
		}

	} else if (element.hash != previewWindow.hash) {

		let cachetag = element.hash;
		previewWindow.hash = cachetag;
		previewWindow.pending = 0;
		if (element.isexternal && element.contentMode == 12) {
			imageSrc = 'http://' + tagDB[element.mac].apip + '/current/' + element.mac + '.raw?' + cachetag;
		} else {
			imageSrc = 'current/' + element.mac + '.raw?' + cachetag;
		}
	}

	if (imageSrc) {
		fetch(imageSrc)
			.then(response => response.arrayBuffer())
			.then(buffer => {
				drawCanvas(buffer, canvas, element.hwType, element.mac, false);
			})
			.catch(error => {
				console.error('fetch preview image error:', error);
			});
	}
}

// Enhanced Dashboard Functionality
let activityFeed = [];

// Initialize enhanced dashboard
function initEnhancedDashboard() {
    console.log('Initializing enhanced dashboard...');
    
    // Initialize Chart.js for battery analytics
    const ctx = document.getElementById('batteryChart');
    if (ctx && typeof Chart !== 'undefined') {
        try {
            // Destroy existing chart if it exists
            if (batteryChart) {
                batteryChart.destroy();
                batteryChart = null;
            }
            
            batteryChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Excellent (>80%)', 'Good (60-80%)', 'Fair (40-60%)', 'Low (<40%)'],
                    datasets: [{
                        data: [0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(16, 185, 129, 0.8)',
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(245, 158, 11, 0.8)',
                            'rgba(239, 68, 68, 0.8)'
                        ],
                        borderColor: [
                            'rgba(16, 185, 129, 1)',
                            'rgba(59, 130, 246, 1)',
                            'rgba(245, 158, 11, 1)',
                            'rgba(239, 68, 68, 1)'
                        ],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: 'rgba(255, 255, 255, 0.8)',
                                font: {
                                    size: 12
                                }
                            }
                        }
                    }
                }
            });
            console.log('Battery chart initialized');
        } catch (error) {
            console.error('Error creating battery chart:', error);
        }
    } else {
        console.log('Chart.js not available or canvas element not found');
    }

    // Update dashboard data periodically
    setInterval(updateDashboardData, 5000);
    updateDashboardData();
    
    // Initialize and update function status
    updateFunctionStatus();
}

// Update dashboard data
function updateDashboardData() {
    const tags = Object.values(tagDB);
    const totalTags = tags.length;
    const onlineTags = tags.filter(tag => tag.lastseen && (Date.now() - tag.lastseen) < 300000).length;
    const offlineTags = totalTags - onlineTags;
    
    // Calculate average battery
    const batteriesWithData = tags.filter(tag => tag.batteryMv && tag.batteryMv > 0);
    const avgBattery = batteriesWithData.length > 0 
        ? Math.round(batteriesWithData.reduce((sum, tag) => sum + Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 700 * 100)), 0) / batteriesWithData.length)
        : 0;

    // Update overview cards
    updateElement('dash-total-tags', totalTags);
    updateElement('dash-online-tags', onlineTags);
    updateElement('dash-offline-tags', offlineTags);
    updateElement('dash-avg-battery', `${avgBattery}%`);

    // Update header stats
    updateElement('header-tag-count', totalTags);
    updateElement('header-online-count', onlineTags);
    updateElement('header-battery-avg', `${avgBattery}%`);

    // Update battery chart
    updateBatteryChart(tags);
    
    // Update network status
    updateNetworkStatus();
    
    // Update system performance
    updateSystemPerformance();
}

// Update battery chart
function updateBatteryChart(tags) {
    if (!batteryChart) return;

    const batteryCounts = [0, 0, 0, 0]; // excellent, good, fair, low
    
    tags.forEach(tag => {
        if (tag.batteryMv && tag.batteryMv > 0) {
            const batteryPercent = Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 700 * 100));
            if (batteryPercent > 80) batteryCounts[0]++;
            else if (batteryPercent > 60) batteryCounts[1]++;
            else if (batteryPercent > 40) batteryCounts[2]++;
            else batteryCounts[3]++;
        }
    });

    batteryChart.data.datasets[0].data = batteryCounts;
    batteryChart.update('none');
}

// Update network status
function updateNetworkStatus() {
    updateElement('network-ap-status', apConfig.state || 'Unknown');
    updateElement('network-clients', Math.floor(Math.random() * 10)); // Simulated
    updateElement('network-signal', 'Strong'); // Simulated
    
    // Calculate uptime
    const uptime = new Date().toTimeString().slice(0, 5);
    updateElement('network-uptime', uptime);
}

// Update system performance metrics
function updateSystemPerformance() {
    // Simulated performance data
    const memoryUsage = Math.floor(Math.random() * 40 + 30); // 30-70%
    const cpuUsage = Math.floor(Math.random() * 30 + 10); // 10-40%
    const storageUsage = Math.floor(Math.random() * 20 + 40); // 40-60%

    updateElement('memory-text', `${memoryUsage}%`);
    updateElement('cpu-text', `${cpuUsage}%`);
    updateElement('storage-text', `${storageUsage}%`);

    // Update progress bars
    const memoryBar = document.getElementById('memory-usage');
    const cpuBar = document.getElementById('cpu-usage');
    const storageBar = document.getElementById('storage-usage');

    if (memoryBar) memoryBar.style.width = `${memoryUsage}%`;
    if (cpuBar) cpuBar.style.width = `${cpuUsage}%`;
    if (storageBar) storageBar.style.width = `${storageUsage}%`;
}

// Quick action functions
function findAllTags() {
    addActivityItem('🔍 Finding all tags...');
    Object.keys(tagDB).forEach(mac => {
        // Send LED flash command to help locate tags
        const formData = new FormData();
        formData.append('mac', mac);
        formData.append('cmd', 'ledflash');
        
        fetch('tag_cmd', {
            method: 'POST',
            body: formData
        })
        .then(response => response.text())
        .then(data => {
            addActivityItem(`📍 LED flash sent to ${mac.substring(0, 8)}: ${data}`);
        })
        .catch(error => {
            console.error('Find tag error:', error);
            addActivityItem(`❌ Error finding ${mac.substring(0, 8)}: ${error.message}`);
        });
    });
}

function blinkAllTags() {
    addActivityItem('💡 Blinking all tags...');
    Object.keys(tagDB).forEach(mac => {
        const formData = new FormData();
        formData.append('mac', mac);
        formData.append('cmd', 'ledflash');
        
        fetch('tag_cmd', {
            method: 'POST',
            body: formData
        })
        .then(response => response.text())
        .then(data => {
            addActivityItem(`✨ LED flash sent to ${mac.substring(0, 8)}: ${data}`);
        })
        .catch(error => {
            console.error('Blink tag error:', error);
            addActivityItem(`❌ Error blinking ${mac.substring(0, 8)}: ${error.message}`);
        });
    });
}

function refreshAllTags() {
    addActivityItem('🔄 Refreshing all tags...');
    // Trigger existing refresh functionality
    refreshData();
    setTimeout(() => {
        addActivityItem('✅ All tags refreshed');
    }, 2000);
}

function openAdvancedControl() {
    window.open('/tags', '_blank');
    addActivityItem('🎛️ Opened advanced control panel');
}

function toggleAdvancedMode() {
    const body = document.body;
    body.classList.toggle('advanced-mode');
    addActivityItem('🔧 Toggled advanced mode');
}

// Activity feed management
function addActivityItem(text) {
    const timestamp = new Date().toLocaleTimeString();
    activityFeed.unshift({ time: timestamp, text: text });
    
    // Keep only last 10 items
    if (activityFeed.length > 10) {
        activityFeed = activityFeed.slice(0, 10);
    }
    
    updateActivityFeed();
}

function updateActivityFeed() {
    const feedElement = document.getElementById('activity-feed');
    if (!feedElement) return;

    feedElement.innerHTML = activityFeed.map(item => `
        <div class="activity-item">
            <div class="activity-time">${item.time}</div>
            <div class="activity-text">${item.text}</div>
        </div>
    `).join('');
}

// Enhanced refresh function
function refreshData() {
    addActivityItem('🔄 Refreshing dashboard data...');
    updateDashboardData();
    
    // Call existing refresh functions
    if (typeof refreshTags === 'function') {
        refreshTags();
    }
    if (typeof refreshAPs === 'function') {
        refreshAPs();
    }
}

// Utility function for updating elements
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Enhanced tab click handlers
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Setting up tab functionality');
    
    // Initialize the dashboard tab as active on page load
    setTimeout(() => {
        console.log('Initializing dashboard tab');
        // Ensure the enhancedhome tab is shown and active
        const dashboardTab = document.getElementById('enhancedhome');
        if (dashboardTab) {
            console.log('Found dashboard tab, setting it as active');
            // Hide all other tabs first
            const allTabs = document.querySelectorAll('.tabcontent');
            allTabs.forEach(tab => {
                tab.style.display = 'none';
                tab.classList.remove('active');
            });
            
            // Show the dashboard tab
            dashboardTab.style.display = 'block';
            dashboardTab.classList.add('active');
            
            // Set the quick-menu dashboard button as active
            const quickMenuBtns = document.querySelectorAll('.quick-menu .menu-btn');
            quickMenuBtns.forEach(btn => btn.classList.remove('active'));
            const dashboardBtn = document.querySelector('.quick-menu .menu-btn[onclick*="enhancedhome"]');
            if (dashboardBtn) {
                dashboardBtn.classList.add('active');
                console.log('Set quick-menu dashboard button as active');
            }
            
            // Set the simple-tabs dashboard button as active
            const simpleTabBtns = document.querySelectorAll('.simple-tabs .tab-btn');
            simpleTabBtns.forEach(btn => btn.classList.remove('active'));
            const simpleDashboardBtn = document.querySelector('.simple-tabs .tab-btn[onclick*="enhancedhome"]');
            if (simpleDashboardBtn) {
                simpleDashboardBtn.classList.add('active');
                console.log('Set simple-tabs dashboard button as active');
            }
            
            // Initialize the dashboard
            try {
                initEnhancedDashboard();
                console.log('Enhanced dashboard initialized');
            } catch (error) {
                console.error('Error initializing enhanced dashboard:', error);
            }
        } else {
            console.error('Dashboard tab not found');
        }
    }, 100);

    // Add click handlers for enhanced tabs
    const enhancedTabs = document.querySelectorAll('.enhanced-tab');
    enhancedTabs.forEach(tab => {
        tab.addEventListener('click', function(evt) {
            const target = this.getAttribute('data-target');
            if (target) {
                openTab(evt, target);
            }
        });
    });
    
    // Test quick-menu buttons
    const quickMenuButtons = document.querySelectorAll('.quick-menu .menu-btn');
    console.log('Found quick-menu buttons:', quickMenuButtons.length);
    quickMenuButtons.forEach((btn, index) => {
        console.log(`Quick-menu button ${index}:`, btn.textContent.trim(), btn.onclick);
        
        // Add a test click event listener to debug
        btn.addEventListener('click', function(e) {
            console.log('Quick-menu button clicked:', this.textContent.trim());
        });
    });
    
    // Test simple-tabs buttons
    const simpleTabButtons = document.querySelectorAll('.simple-tabs .tab-btn');
    console.log('Found simple-tab buttons:', simpleTabButtons.length);
    simpleTabButtons.forEach((btn, index) => {
        console.log(`Simple-tab button ${index}:`, btn.textContent.trim(), btn.onclick);
    });

    // Initialize enhanced dashboard if it's the active tab
    if (document.getElementById('enhancedhome') && document.getElementById('enhancedhome').classList.contains('active')) {
        setTimeout(initEnhancedDashboard, 100);
    }

    // Add some initial activity
    addActivityItem('🚀 Enhanced OpenEPL ESP32 Control Center initialized');
});

// Implement openTab function for quick-menu and enhanced tabs
function openTab(evt, tabName) {
    // Hide all tab contents
    const tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    // Remove active class from all tab buttons (both quick-menu and simple-tabs)
    const quickMenuBtns = document.querySelectorAll(".quick-menu .menu-btn");
    const simpleTabBtns = document.querySelectorAll(".simple-tabs .tab-btn");
    
    quickMenuBtns.forEach(btn => btn.classList.remove("active"));
    simpleTabBtns.forEach(btn => btn.classList.remove("active"));

    // Show the selected tab content
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
        targetTab.style.display = "block";
        targetTab.classList.add("active");
        
        // Special handling for log tab scrolling
        if (tabName === "logtab") {
            targetTab.scrollTop = 0;
        }
    }

    // Add active class to the clicked button
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add("active");
    }

    // Trigger custom loadTab event
    const loadTabEvent = new CustomEvent('loadTab', { detail: tabName });
    document.dispatchEvent(loadTabEvent);

    // Initialize enhanced dashboard if switching to enhanced home
    if (tabName === 'enhancedhome') {
        setTimeout(initEnhancedDashboard, 100);
    }
}

// Set the global openTab function
window.openTab = openTab;

// System Control Functions
function updateFunctionStatus() {
    fetch('/get_function_status')
        .then(response => response.json())
        .then(data => {
            const contentGenStatus = document.getElementById('content-gen-status');
            const apStatus = document.getElementById('ap-status');
            const startBtn = document.getElementById('start-content-btn');
            const pauseBtn = document.getElementById('pause-content-btn');
            const stopBtn = document.getElementById('stop-content-btn');
            
            if (contentGenStatus) {
                contentGenStatus.textContent = data.runStatusText;
                contentGenStatus.className = 'status-value ' + 
                    (data.runStatus === 2 ? 'running' : 
                     data.runStatus === 0 ? 'stopped' : 
                     data.runStatus === 1 ? 'paused' : '');
            }
            
            if (apStatus) {
                apStatus.textContent = data.apOnline ? 'Online' : 'Offline';
                apStatus.className = 'status-value ' + (data.apOnline ? 'online' : 'offline');
            }
            
            // Update button states
            if (startBtn && pauseBtn && stopBtn) {
                const isRunning = data.runStatus === 2;
                const isStopped = data.runStatus === 0;
                const isPaused = data.runStatus === 1;
                
                startBtn.disabled = isRunning;
                pauseBtn.disabled = !isRunning;
                stopBtn.disabled = isStopped;
            }
        })
        .catch(error => {
            console.error('Error fetching function status:', error);
        });
}

function startContentGeneration() {
    const startBtn = document.getElementById('start-content-btn');
    if (startBtn) startBtn.disabled = true;
    
    fetch('/start_content_generation', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('Content generation started successfully', 'success');
                addActivityItem('▶️ Content generation started manually');
            } else {
                showMessage(data.message, 'warning');
            }
            updateFunctionStatus();
        })
        .catch(error => {
            console.error('Error starting content generation:', error);
            showMessage('Error starting content generation', 'error');
            updateFunctionStatus();
        });
}

function pauseContentGeneration() {
    const pauseBtn = document.getElementById('pause-content-btn');
    if (pauseBtn) pauseBtn.disabled = true;
    
    fetch('/pause_content_generation', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('Content generation paused successfully', 'success');
                addActivityItem('⏸️ Content generation paused manually');
            } else {
                showMessage(data.message, 'warning');
            }
            updateFunctionStatus();
        })
        .catch(error => {
            console.error('Error pausing content generation:', error);
            showMessage('Error pausing content generation', 'error');
            updateFunctionStatus();
        });
}

function stopContentGeneration() {
    const stopBtn = document.getElementById('stop-content-btn');
    if (stopBtn) stopBtn.disabled = true;
    
    fetch('/stop_content_generation', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('Content generation stopped successfully', 'success');
                addActivityItem('⏹️ Content generation stopped manually');
            } else {
                showMessage(data.message, 'warning');
            }
            updateFunctionStatus();
        })
        .catch(error => {
            console.error('Error stopping content generation:', error);
            showMessage('Error stopping content generation', 'error');
            updateFunctionStatus();
        });
}

// Update function status periodically
setInterval(updateFunctionStatus, 5000);

// Initial status update
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(updateFunctionStatus, 1000);
    
    // Initialize simple file flash functionality
    initSimpleFileFlash();
});

// Simple File Flash functionality
function initSimpleFileFlash() {
    const doSimpleFileFlashBtn = document.getElementById('doSimpleFileFlash');
    const flashFileInput = document.getElementById('flashFileInput');
    
    if (doSimpleFileFlashBtn && flashFileInput) {
        doSimpleFileFlashBtn.onclick = function () {
            // Trigger file input dialog
            flashFileInput.click();
        };
        
        flashFileInput.onchange = function (event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log("Starting simple file flash for:", file.name);
            
            // Show progress in console if available
            const flashConsole = document.getElementById('flashconsole');
            if (flashConsole) {
                addFlashMessage("Uploading file: " + file.name, "yellow");
            }
            
            // Upload file first, then send flash command
            uploadFlashFile(file)
                .then(() => {
                    if (flashConsole) {
                        addFlashMessage("File uploaded successfully. Starting flash...", "green");
                    }
                    
                    // Send flash command via WebSocket
                    const flashCmd = {
                        flashcmd: 7, // WEBFLASH_SIMPLE_FILE_FLASH
                        filename: file.name
                    };
                    
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify(flashCmd));
                    } else {
                        throw new Error("WebSocket not connected");
                    }
                })
                .catch((error) => {
                    console.error("Flash error:", error);
                    if (flashConsole) {
                        addFlashMessage("Error: " + error.message, "red");
                    }
                    showMessage("Flash error: " + error.message, 'error');
                })
                .finally(() => {
                    // Clear the file input
                    event.target.value = '';
                });
        };
    }
}

async function uploadFlashFile(file) {
    const formData = new FormData();
    formData.append('path', '/flash_temp.bin');
    formData.append('file', file, file.name);

    const response = await fetch('littlefs_put', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
}

function addFlashMessage(message, color = "white") {
    const flashConsole = document.getElementById('flashconsole');
    if (flashConsole) {
        const newLine = document.createElement('div');
        newLine.style.color = color;
        newLine.textContent = message;
        flashConsole.appendChild(newLine);
        
        // Auto-scroll to bottom
        flashConsole.scrollTop = flashConsole.scrollHeight;
    }
}

// C6 Module Support Detection
// ============================

async function checkC6ModuleSupport() {
    try {
        const response = await fetch('/sysinfo');
        const data = await response.json();
        
        if (data.hasC6 === 1 || data.C6 === "1") {
            // Show C6 module link in navigation
            const c6Link = document.getElementById('c6ModuleLink');
            if (c6Link) {
                c6Link.style.display = 'inline-block';
            }
            
            // Show C6 update option in updates page
            const c6UpdateOption = document.getElementById('updateC6Option');
            if (c6UpdateOption) {
                c6UpdateOption.style.display = 'block';
            }
            
            console.log('C6 module support detected');
        }
    } catch (error) {
        console.warn('Could not check C6 module support:', error);
    }
}

// Test function to debug quick-menu functionality
function testQuickMenu() {
    console.log('Testing quick-menu functionality...');
    
    // Test if openTab function exists
    if (typeof openTab === 'function') {
        console.log('openTab function is available');
    } else {
        console.error('openTab function is NOT available');
    }
    
    // Test if quick-menu elements exist
    const quickMenu = document.querySelector('.quick-menu');
    if (quickMenu) {
        console.log('Quick-menu element found');
        const buttons = quickMenu.querySelectorAll('.menu-btn');
        console.log('Quick-menu buttons found:', buttons.length);
        
        // Test clicking the dashboard button
        const dashboardBtn = quickMenu.querySelector('.menu-btn[onclick*="enhancedhome"]');
        if (dashboardBtn) {
            console.log('Dashboard button found, attempting to click...');
            dashboardBtn.click();
        } else {
            console.error('Dashboard button not found');
        }
    } else {
        console.error('Quick-menu element not found');
    }
    
    // Test if tab content exists
    const tabContents = document.querySelectorAll('.tabcontent');
    console.log('Tab content elements found:', tabContents.length);
    tabContents.forEach((tab, index) => {
        console.log(`Tab ${index}: id=${tab.id}, display=${tab.style.display}, visible=${tab.offsetParent !== null}`);
    });
}

// Make test function available globally
window.testQuickMenu = testQuickMenu;

// Enhanced Performance Monitoring Functions
function refreshPerformanceData() {
	if (window.systemMonitor) {
		window.systemMonitor.updateAllMetrics();
	} else {
		updatePerformanceMetrics();
	}
}

function togglePerformanceDetails() {
	const details = document.getElementById('performance-details');
	if (details) {
		details.classList.toggle('collapsed');
	}
}

function updatePerformanceMetrics() {
	// Legacy performance update with enhanced visualization
	const updateMetric = (id, value, max = 100, unit = '%') => {
		const fill = document.getElementById(id);
		const text = document.getElementById(id.replace('-usage', '-text').replace('-signal', '-text'));
		
		if (fill && text) {
			const percentage = Math.min((value / max) * 100, 100);
			fill.style.width = percentage + '%';
			
			// Set data level for styling
			let level = 'low';
			if (percentage > 90) level = 'critical';
			else if (percentage > 75) level = 'high';
			else if (percentage > 50) level = 'medium';
			
			fill.setAttribute('data-level', level);
			text.textContent = unit === '%' ? Math.round(percentage) + '%' : value + ' ' + unit;
		}
	};
	
	// Fetch system info
	fetch('/sysinfo')
		.then(response => response.json())
		.then(data => {
			if (data.heap) {
				const memUsed = data.heap.total - data.heap.free;
				const memPercent = (memUsed / data.heap.total) * 100;
				updateMetric('memory-usage', memPercent);
				
				// Update memory details
				const memUsedEl = document.getElementById('memory-used');
				const memTotalEl = document.getElementById('memory-total');
				if (memUsedEl) memUsedEl.textContent = Math.round(memUsed / 1024);
				if (memTotalEl) memTotalEl.textContent = Math.round(data.heap.total / 1024);
			}
			
			if (data.cpu_freq) {
				// CPU usage estimation based on frequency
				const maxFreq = 240; // MHz for ESP32
				const cpuPercent = (data.cpu_freq / maxFreq) * 100;
				updateMetric('cpu-usage', cpuPercent);
				
				const cpuFreqEl = document.getElementById('cpu-freq');
				if (cpuFreqEl) cpuFreqEl.textContent = data.cpu_freq;
			}
			
			if (data.flash) {
				const flashUsed = data.flash.used || 0;
				const flashTotal = data.flash.total || 1;
				const flashPercent = (flashUsed / flashTotal) * 100;
				updateMetric('storage-usage', flashPercent);
				
				const storageUsedEl = document.getElementById('storage-used');
				const storageTotalEl = document.getElementById('storage-total');
				if (storageUsedEl) storageUsedEl.textContent = Math.round(flashUsed / 1024);
				if (storageTotalEl) storageTotalEl.textContent = Math.round(flashTotal / 1024);
			}
			
			// Update system details
			if (data.uptime) {
				const uptimeEl = document.getElementById('system-uptime');
				if (uptimeEl) {
					const hours = Math.floor(data.uptime / 3600);
					const minutes = Math.floor((data.uptime % 3600) / 60);
					uptimeEl.textContent = `${hours}h ${minutes}m`;
				}
			}
			
			if (data.heap?.free) {
				const freeHeapEl = document.getElementById('free-heap');
				if (freeHeapEl) freeHeapEl.textContent = Math.round(data.heap.free / 1024) + ' KB';
			}
			
			if (data.heap?.largest_block) {
				const largestBlockEl = document.getElementById('largest-block');
				if (largestBlockEl) largestBlockEl.textContent = Math.round(data.heap.largest_block / 1024) + ' KB';
			}
			
			if (data.flash?.size) {
				const flashSizeEl = document.getElementById('flash-size');
				if (flashSizeEl) flashSizeEl.textContent = Math.round(data.flash.size / (1024 * 1024)) + ' MB';
			}
			
			if (data.chip_model) {
				const chipModelEl = document.getElementById('chip-model');
				if (chipModelEl) chipModelEl.textContent = data.chip_model;
			}
			
			if (data.sdk_version) {
				const sdkVersionEl = document.getElementById('sdk-version');
				if (sdkVersionEl) sdkVersionEl.textContent = data.sdk_version;
			}
		})
		.catch(error => {
			console.warn('Failed to fetch system info:', error);
		});
	
	// Fetch WiFi info
	fetch('/get_wifi_config')
		.then(response => response.json())
		.then(data => {
			if (data.rssi) {
				// Convert RSSI to percentage (approximate)
				const signalPercent = Math.max(0, Math.min(100, (data.rssi + 100) * 2));
				updateMetric('wifi-signal', data.rssi, 1, 'dBm');
				
				// Update signal bars
				const signalFill = document.getElementById('wifi-signal');
				if (signalFill) {
					signalFill.style.width = signalPercent + '%';
					
					let level = 'low';
					if (data.rssi > -50) level = 'low';
					else if (data.rssi > -65) level = 'medium';
					else if (data.rssi > -80) level = 'high';
					else level = 'critical';
					
					signalFill.setAttribute('data-level', level);
				}
			}
			
			if (data.ssid) {
				const wifiSsidEl = document.getElementById('wifi-ssid');
				if (wifiSsidEl) wifiSsidEl.textContent = data.ssid;
			}
		})
		.catch(error => {
			console.warn('Failed to fetch WiFi status:', error);
			const wifiTextEl = document.getElementById('wifi-text');
			const wifiSsidEl = document.getElementById('wifi-ssid');
			if (wifiTextEl) wifiTextEl.textContent = 'Not connected';
			if (wifiSsidEl) wifiSsidEl.textContent = 'Not connected';
		});
}

// Auto-refresh performance data
setInterval(updatePerformanceMetrics, 5000);

// Load initial performance data when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	setTimeout(updatePerformanceMetrics, 1000);
});

// Manual Tag Addition Functionality
document.addEventListener('DOMContentLoaded', () => {
	// Add Tag Manually button event
	const addTagManuallyBtn = $('#addTagManually');
	if (addTagManuallyBtn) {
		addTagManuallyBtn.addEventListener('click', () => {
			$('#addTagDialog').showModal();
		});
	}
	
	// Refresh Tags button event
	const refreshTagsBtn = $('#refreshTags');
	if (refreshTagsBtn) {
		refreshTagsBtn.addEventListener('click', () => {
			// Force reload tags from server
			if (window.location.pathname.includes('tags.html') || window.location.pathname === '/') {
				window.location.reload();
			} else {
				// Try to call existing reload function
				if (typeof loadTags === 'function') {
					loadTags(0);
				} else if (typeof updatecards === 'function') {
					updatecards();
				}
			}
		});
	}
	
	// Add Tag Dialog - Cancel button
	const addTagCancelBtn = $('#addTagCancel');
	if (addTagCancelBtn) {
		addTagCancelBtn.addEventListener('click', () => {
			$('#addTagDialog').close();
			clearAddTagForm();
		});
	}
	
	// Add Tag Dialog - Save button
	const addTagSaveBtn = $('#addTagSave');
	if (addTagSaveBtn) {
		addTagSaveBtn.addEventListener('click', () => {
			addTagManually();
		});
	}
	
	// MAC address input formatting
	const newTagMacInput = $('#newTagMac');
	if (newTagMacInput) {
		newTagMacInput.addEventListener('input', (e) => {
			// Remove any non-hex characters and convert to uppercase
			let value = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
			// Limit to 12 characters
			if (value.length > 12) {
				value = value.substring(0, 12);
			}
			e.target.value = value;
		});
		
		newTagMacInput.addEventListener('paste', (e) => {
			e.preventDefault();
			let paste = (e.clipboardData || window.clipboardData).getData('text');
			// Clean pasted MAC address (remove colons, spaces, etc.)
			paste = paste.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
			if (paste.length > 12) {
				paste = paste.substring(0, 12);
			}
			e.target.value = paste;
		});
	}
});

function clearAddTagForm() {
	const form = $('#addTagDialog');
	if (form) {
		$('#newTagMac').value = '';
		$('#newTagAlias').value = '';
		$('#newTagType').value = '1';
	}
}

function addTagManually() {
	const macInput = $('#newTagMac');
	const aliasInput = $('#newTagAlias');
	const typeInput = $('#newTagType');
	
	if (!macInput || !typeInput) {
		alert('Form elements not found');
		return;
	}
	
	const mac = macInput.value.trim().toUpperCase();
	const alias = aliasInput ? aliasInput.value.trim() : '';
	const tagType = parseInt(typeInput.value);
	
	// Validate MAC address
	if (!/^[0-9A-F]{12}$/.test(mac)) {
		alert('Please enter a valid 12-digit hexadecimal MAC address');
		macInput.focus();
		return;
	}
	
	// Check if tag already exists
	if (tagDB[mac]) {
		alert('A tag with this MAC address already exists');
		macInput.focus();
		return;
	}
	
	// Create virtual tag object
	const virtualTag = {
		mac: mac,
		alias: alias || mac.replace(/^0+/, '') || mac,
		hwType: tagType,
		contentMode: 0, // Not configured
		batteryMv: 0,
		temperature: 0,
		RSSI: -999, // Indicate virtual/offline tag
		pending: false,
		isexternal: false,
		nextcheckin: 0,
		nextupdate: 0,
		lastSeen: 0,
		wakeupreason: 0,
		capabilities: getTagCapabilities(tagType),
		modecfgjson: '{}',
		rotate: 0,
		lut: 0,
		invert: 0,
		ch: 0,
		isVirtual: true // Flag to indicate this is manually added
	};
	
	// Add to tagDB
	tagDB[mac] = virtualTag;
	
	// Create visual element
	createTagElement(virtualTag);
	
	// Update tag list display
	updatecards();
	
	// Close dialog and clear form
	$('#addTagDialog').close();
	clearAddTagForm();
	
	// Show success message
	showMessage(`Virtual tag ${alias || mac} added successfully. Configure content to complete setup.`);
	
	console.log('Manual tag added:', virtualTag);
}

function getTagCapabilities(hwType) {
	// Define basic capabilities based on tag type
	const capabilities = {
		1: 0, // 1.54" BWR
		2: 0, // 2.13" BWR  
		3: 0, // 2.9" BWR
		4: 0, // 4.2" BWR
		5: 0, // 7.5" BWR
		6: 0, // 2.13" BW
		7: 0, // 2.9" BW
		8: 0, // 4.2" BW
		9: 0, // 7.5" BW
		10: 0 // 1.54" BW
	};
	return capabilities[hwType] || 0;
}

function createTagElement(tagData) {
	const tagmac = tagData.mac;
	
	// Clone template
	let div = $('#tagtemplate').cloneNode(true);
	div.setAttribute('id', 'tag' + tagmac);
	div.dataset.mac = tagmac;
	div.dataset.hwtype = tagData.hwType;
	div.style.display = 'block';
	
	// Mark as virtual tag
	if (tagData.isVirtual) {
		div.classList.add('virtual-tag');
		div.style.opacity = '0.8';
		div.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
	}
	
	// Set basic info
	div.querySelector('.mac').innerHTML = tagmac + (tagData.isVirtual ? ' (Virtual)' : '');
	div.querySelector('.alias').innerHTML = tagData.alias;
	div.querySelector('.contentmode').innerHTML = 'Not configured';
	div.querySelector('.lastseen').innerHTML = tagData.isVirtual ? 'Virtual tag' : '';
	
	// Append to tag list
	$('#taglist').appendChild(div);
}

function showMessage(message) {
	// Create or update a simple message display
	let messageEl = $('#statusMessage');
	if (!messageEl) {
		messageEl = document.createElement('div');
		messageEl.id = 'statusMessage';
		messageEl.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: rgba(16, 185, 129, 0.9);
			color: white;
			padding: 1rem 1.5rem;
			border-radius: 8px;
			box-shadow: 0 4px 15px rgba(0,0,0,0.2);
			z-index: 10000;
			font-weight: 500;
			backdrop-filter: blur(10px);
		`;
		document.body.appendChild(messageEl);
	}
	
	messageEl.textContent = message;
	messageEl.style.display = 'block';
	
	// Auto hide after 5 seconds
	setTimeout(() => {
		if (messageEl) {
			messageEl.style.display = 'none';
		}
	}, 5000);
}

// Enhanced notification system
function showNotification(message, type = 'info', duration = 3000, action = null) {
	// Create notification element
	const notification = document.createElement('div');
	const notificationId = 'notification-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
	notification.id = notificationId;
	
	// Enhanced styling based on type
	const typeStyles = {
		success: {
			background: 'linear-gradient(135deg, #4CAF50, #45a049)',
			icon: '✓',
			border: '#4CAF50'
		},
		error: {
			background: 'linear-gradient(135deg, #f44336, #da190b)',
			icon: '✗',
			border: '#f44336'
		},
		warning: {
			background: 'linear-gradient(135deg, #ff9800, #f57c00)',
			icon: '⚠',
			border: '#ff9800'
		},
		info: {
			background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
			icon: 'ℹ',
			border: '#4facfe'
		}
	};
	
	const style = typeStyles[type] || typeStyles.info;
	
	notification.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: ${style.background};
		color: white;
		padding: 16px 20px;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0,0,0,0.3);
		z-index: 10000;
		max-width: 400px;
		min-width: 300px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 14px;
		font-weight: 500;
		border: 1px solid ${style.border};
		backdrop-filter: blur(10px);
		animation: slideInRight 0.3s ease-out;
		cursor: pointer;
		transition: all 0.3s ease;
	`;
	
	// Add action button if provided
	const actionButton = action ? `
		<button onclick="${action.callback}" style="
			background: rgba(255,255,255,0.2);
			border: 1px solid rgba(255,255,255,0.3);
			color: white;
			padding: 6px 12px;
			border-radius: 6px;
			font-size: 12px;
			margin-left: 10px;
			cursor: pointer;
			transition: all 0.2s ease;
		" onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
		   onmouseout="this.style.background='rgba(255,255,255,0.2)'">
			${action.text}
		</button>
	` : '';
	
	notification.innerHTML = `
		<div style="display: flex; align-items: center; justify-content: space-between;">
			<div style="display: flex; align-items: center;">
				<span style="font-size: 18px; margin-right: 12px;">${style.icon}</span>
				<span>${message}</span>
				${actionButton}
			</div>
			<span onclick="closeNotification('${notificationId}')" style="
				cursor: pointer;
				font-size: 20px;
				opacity: 0.8;
				margin-left: 15px;
				transition: opacity 0.2s ease;
			" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">×</span>
		</div>
	`;
	
	// Add hover effects
	notification.onmouseover = () => {
		notification.style.transform = 'translateY(-2px)';
		notification.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)';
	};
	notification.onmouseout = () => {
		notification.style.transform = 'translateY(0)';
		notification.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
	};
	
	document.body.appendChild(notification);
	
	// Auto-remove after duration
	setTimeout(() => {
		closeNotification(notificationId);
	}, duration);
	
	return notificationId;
}

// Close notification function
window.closeNotification = function(notificationId) {
	const notification = document.getElementById(notificationId);
	if (notification) {
		notification.style.animation = 'slideOutRight 0.3s ease-in';
		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 300);
	}
}
