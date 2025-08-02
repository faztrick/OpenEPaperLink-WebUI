// Dashboard JavaScript functionality
// Enhanced Dashboard Functionality
function initializeEnhancements() {
	// Initialize dashboard with real data
	updateCompactHeaderStatus();
	updateFooterStatus();
	updateSystemControlStatus();
	updateDashboardStats();
	
	// Set up periodic updates
	setInterval(updateCompactHeaderStatus, 5000);
	setInterval(updateFooterStatus, 10000);
	setInterval(updateHeaderUptime, 60000);
	setInterval(updateSystemControlStatus, 15000);
	setInterval(updateDashboardStats, 30000);

	// Enhanced status updates with animations
	const originalUpdateStatus = window.updateStatus;
	if (originalUpdateStatus) {
		window.updateStatus = function() {
			// Add loading state
			const cards = document.querySelectorAll('.glass-card, .dashboard-card');
			cards.forEach(card => card.classList.add('loading'));
			
			// Call original function
			const result = originalUpdateStatus.apply(this, arguments);
			
			// Remove loading state after delay
			setTimeout(() => {
				cards.forEach(card => card.classList.remove('loading'));
				// Update our enhanced dashboard after original update
				updateDashboardStats();
				updateCompactHeaderStatus();
			}, 500);
			
			return result;
		};
	}

	// Hook into the existing processTags function if available
	const originalProcessTags = window.processTags;
	if (originalProcessTags) {
		window.processTags = function(tagArray) {
			// Call original function first
			const result = originalProcessTags.apply(this, arguments);
			
			// Update our dashboard stats after processing tags
			setTimeout(() => {
				updateDashboardStats();
				updateCompactHeaderStatus();
			}, 100);
			
			return result;
		};
	}

	// Signal strength visualization
	updateSignalBars();
	
	// Memory usage animation
	animateProgressBars();
	
	// Add interactive tooltips
	addTooltips();
}

// Update compact header status
function updateCompactHeaderStatus() {
	// Fetch current system status
	fetch('get_ap_config')
		.then(response => response.json())
		.then(data => {
			const systemDot = document.getElementById('systemDot');
			const systemStatus = document.getElementById('systemStatus');
			const tagCount = document.getElementById('tagCount');
			const wifiStatus = document.getElementById('wifiStatus');
			
			if (systemDot && systemStatus && data.apstate !== undefined) {
				// Update system status based on AP state
				if (data.apstate === 1) { // online
					systemDot.className = 'status-dot online';
					systemStatus.textContent = 'Online';
				} else if (data.apstate === 2) { // flashing
					systemDot.className = 'status-dot warning';
					systemStatus.textContent = 'Flashing';
				} else if (data.apstate === 5) { // failed
					systemDot.className = 'status-dot offline';
					systemStatus.textContent = 'Failed';
				} else {
					systemDot.className = 'status-dot warning';
					systemStatus.textContent = 'Starting';
				}
			}
			
			// Update tag count
			if (tagCount) {
				const totalTags = Object.keys(tagDB || {}).length;
				tagCount.textContent = `${totalTags} Tags`;
			}
			
			// Update WiFi status
			if (wifiStatus) {
				wifiStatus.textContent = data.wifiConnected ? 'Connected' : 'Disconnected';
			}
		})
		.catch(error => {
			console.error('Status update error:', error);
			const systemDot = document.getElementById('systemDot');
			const systemStatus = document.getElementById('systemStatus');
			if (systemDot && systemStatus) {
				systemDot.className = 'status-dot offline';
				systemStatus.textContent = 'Error';
			}
		});
}

// Update footer status
function updateFooterStatus() {
	const timestamp = new Date().toLocaleTimeString();
	const footerTimestamp = document.getElementById('footerTimestamp');
	
	if (footerTimestamp) footerTimestamp.textContent = `Last updated: ${timestamp}`;
	
	// Fetch system information
	fetch('get_ap_config')
		.then(response => response.json())
		.then(data => {
			const footerSystemInfo = document.getElementById('footerSystemInfo');
			const footerMemoryInfo = document.getElementById('footerMemoryInfo');
			const footerWifiInfo = document.getElementById('footerWifiInfo');
			const footerTagInfo = document.getElementById('footerTagInfo');
			const footerPerformance = document.getElementById('footerPerformance');
			
			if (footerSystemInfo) {
				footerSystemInfo.textContent = data.version ? `ESP32 v${data.version}` : 'ESP32 Ready';
			}
			
			if (footerMemoryInfo) {
				const freeHeap = data.freeHeap ? Math.round(data.freeHeap / 1024) : 0;
				footerMemoryInfo.textContent = freeHeap > 0 ? `${freeHeap} KB Free` : 'Memory OK';
			}
			
			if (footerWifiInfo) {
				footerWifiInfo.textContent = data.wifiConnected ? 'WiFi Connected' : 'WiFi Ready';
			}
			
			if (footerTagInfo) {
				const tagCount = Object.keys(tagDB || {}).length;
				const activeCount = Object.values(tagDB || {}).filter(tag => 
					tag.lastseen && (Date.now() - tag.lastseen * 1000) < 300000 // 5 minutes
				).length;
				footerTagInfo.textContent = `${activeCount}/${tagCount} Tags Active`;
			}
			
			if (footerPerformance) {
				const cpuLoad = data.cpuLoad || 0;
				if (cpuLoad > 80) footerPerformance.textContent = 'High Load';
				else if (cpuLoad > 50) footerPerformance.textContent = 'Medium Load';
				else footerPerformance.textContent = 'Performance OK';
			}
		})
		.catch(error => {
			console.error('Footer status error:', error);
		});
}

// Update header uptime
function updateHeaderUptime() {
	const now = new Date();
	const uptime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	const uptimeDisplay = document.getElementById('uptimeDisplay');
	if (uptimeDisplay) {
		uptimeDisplay.textContent = uptime;
	}
}

// System control functions
function startContentGeneration() {
	const formData = new FormData();
	formData.append('cmd', 'start_content_generation');
	
	fetch('system_cmd', {
		method: 'POST',
		body: formData
	})
	.then(response => response.text())
	.then(data => {
		console.log('Content generation started:', data);
		updateSystemControlStatus();
	})
	.catch(error => {
		console.error('Start content generation error:', error);
	});
}

function pauseContentGeneration() {
	const formData = new FormData();
	formData.append('cmd', 'pause_content_generation');
	
	fetch('system_cmd', {
		method: 'POST',
		body: formData
	})
	.then(response => response.text())
	.then(data => {
		console.log('Content generation paused:', data);
		updateSystemControlStatus();
	})
	.catch(error => {
		console.error('Pause content generation error:', error);
	});
}

function stopContentGeneration() {
	const formData = new FormData();
	formData.append('cmd', 'stop_content_generation');
	
	fetch('system_cmd', {
		method: 'POST',
		body: formData
	})
	.then(response => response.text())
	.then(data => {
		console.log('Content generation stopped:', data);
		updateSystemControlStatus();
	})
	.catch(error => {
		console.error('Stop content generation error:', error);
	});
}

// Update system control panel status
function updateSystemControlStatus() {
	fetch('get_ap_config')
		.then(response => response.json())
		.then(data => {
			const contentGenStatus = document.getElementById('content-gen-status');
			const apStatus = document.getElementById('ap-status');
			
			if (contentGenStatus) {
				// Map runstate to content generation status
				const runStates = ['Stopped', 'Paused', 'Running', 'Initializing'];
				const currentState = data.runstate !== undefined ? runStates[data.runstate] || 'Unknown' : 'Ready';
				contentGenStatus.textContent = currentState;
			}
			
			if (apStatus) {
				// Map apstate to AP status
				const apStates = ['Offline', 'Online', 'Flashing', 'Wait for Reset', 'Requires Reboot', 'Failed', 'Coming Online', 'No Radio'];
				const currentApState = data.apstate !== undefined ? apStates[data.apstate] || 'Unknown' : 'Ready';
				apStatus.textContent = currentApState;
			}
		})
		.catch(error => {
			console.error('System control status error:', error);
		});
}

// Update dashboard statistics
function updateDashboardStats() {
	const tags = Object.values(tagDB || {});
	const currentTime = Date.now();
	
	// Calculate statistics
	const totalTags = tags.length;
	const onlineTags = tags.filter(tag => 
		tag.lastseen && (currentTime - tag.lastseen * 1000) < 300000 // 5 minutes
	).length;
	const offlineTags = totalTags - onlineTags;
	
	// Calculate average battery level
	const tagsWithBattery = tags.filter(tag => tag.batteryMv && tag.batteryMv > 0);
	const avgBattery = tagsWithBattery.length > 0 
		? Math.round(tagsWithBattery.reduce((sum, tag) => sum + (tag.batteryMv || 0), 0) / tagsWithBattery.length / 30) // Rough battery percentage
		: 0;
	
	// Update dashboard elements
	const dashTotalTags = document.getElementById('dash-total-tags');
	const dashOnlineTags = document.getElementById('dash-online-tags');
	const dashOfflineTags = document.getElementById('dash-offline-tags');
	const dashAvgBattery = document.getElementById('dash-avg-battery');
	
	if (dashTotalTags) dashTotalTags.textContent = totalTags;
	if (dashOnlineTags) dashOnlineTags.textContent = onlineTags;
	if (dashOfflineTags) dashOfflineTags.textContent = offlineTags;
	if (dashAvgBattery) dashAvgBattery.textContent = `${avgBattery}%`;
	
	// Update network stats
	const networkClients = document.getElementById('network-clients');
	const networkUptime = document.getElementById('network-uptime');
	
	if (networkClients) networkClients.textContent = onlineTags;
	if (networkUptime) {
		const uptimeHours = Math.floor(Date.now() / 3600000) % 24;
		const uptimeMinutes = Math.floor(Date.now() / 60000) % 60;
		networkUptime.textContent = `${uptimeHours}h ${uptimeMinutes}m`;
	}
}

// Quick action functions for dashboard
function findAllTags() {
	// Send LED flash command to all active tags to help locate them
	Object.keys(tagDB || {}).forEach(mac => {
		const formData = new FormData();
		formData.append('mac', mac);
		formData.append('cmd', 'ledflash');
		
		fetch('tag_cmd', {
			method: 'POST',
			body: formData
		})
		.then(response => response.text())
		.then(data => {
			console.log(`Find tag LED flash sent to ${mac}:`, data);
		})
		.catch(error => {
			console.error(`Find tag error for ${mac}:`, error);
		});
	});
	
	// Update dashboard components
	updateCompactHeaderStatus();
	updateDashboardStats();
}

function blinkAllTags() {
	// Send LED flash command to all active tags
	Object.keys(tagDB || {}).forEach(mac => {
		const formData = new FormData();
		formData.append('mac', mac);
		formData.append('cmd', 'ledflash');
		
		fetch('tag_cmd', {
			method: 'POST',
			body: formData
		})
		.then(response => response.text())
		.then(data => {
			console.log(`LED flash command sent to ${mac}:`, data);
		})
		.catch(error => {
			console.error(`LED flash error for ${mac}:`, error);
		});
	});
}

function refreshAllTags() {
	// Refresh all tag data from the server
	if (typeof loadTags === 'function') {
		loadTags(0);
	} else {
		// Fallback: reload the page data
		fetch('get_db?pos=0')
			.then(response => response.json())
			.then(data => {
				if (data.tags) {
					// Update tagDB with fresh data
					data.tags.forEach(tag => {
						tagDB[tag.mac] = tag;
					});
					updateDashboardStats();
					updateCompactHeaderStatus();
				}
			})
			.catch(error => {
				console.error('Refresh error:', error);
			});
	}
}

function openAdvancedControl() {
	// Open advanced control interface
	window.location.href = 'tag_control_panel_optimized.html';
}

// Enhanced refresh function with visual feedback and real data
function refreshData() {
	const refreshBtn = document.querySelector('[onclick="refreshData()"]');
	if (refreshBtn) {
		const icon = refreshBtn.querySelector('.material-symbols-outlined');
		if (icon) {
			icon.style.animation = 'spin 1s linear infinite';
		}
	}
	
	// Refresh all data sources
	Promise.all([
		// Refresh AP config
		fetch('get_ap_config').then(response => response.json()),
		// Refresh tag database
		fetch('get_db?pos=0').then(response => response.json())
	])
	.then(([apData, tagData]) => {
		// Update AP configuration
		if (apData) {
			apConfig = apData;
		}
		
		// Update tag database
		if (tagData && tagData.tags) {
			tagData.tags.forEach(tag => {
				tagDB[tag.mac] = tag;
			});
			
			// Continue loading if there are more tags
			if (tagData.continu) {
				return fetch(`get_db?pos=${tagData.continu}`)
					.then(response => response.json())
					.then(moreData => {
						if (moreData && moreData.tags) {
							moreData.tags.forEach(tag => {
								tagDB[tag.mac] = tag;
							});
						}
					});
			}
		}
	})
	.then(() => {
		// Update all dashboard components
		updateCompactHeaderStatus();
		updateFooterStatus();
		updateSystemControlStatus();
		updateDashboardStats();
		
		console.log('Data refresh completed');
	})
	.catch(error => {
		console.error('Refresh error:', error);
	})
	.finally(() => {
		// Stop loading animation
		if (refreshBtn) {
			const icon = refreshBtn.querySelector('.material-symbols-outlined');
			if (icon) {
				setTimeout(() => {
					icon.style.animation = '';
				}, 2000);
			}
		}
	});
	
	// Call existing refresh logic if available
	if (window.originalRefreshData) {
		window.originalRefreshData();
	} else if (typeof loadTags === 'function') {
		loadTags(0);
	}
}

function updateSignalBars() {
	const signalBars = document.getElementById('signalBars');
	const wifiSignal = document.getElementById('wifiSignal');
	
	if (signalBars && wifiSignal) {
		const signal = parseInt(wifiSignal.textContent) || -100;
		signalBars.className = 'signal-bars';
		
		if (signal > -50) signalBars.classList.add('strong');
		else if (signal > -70) signalBars.classList.add('medium');
		else signalBars.classList.add('weak');
	}
}

function animateProgressBars() {
	const progressBars = document.querySelectorAll('.progress-bar');
	progressBars.forEach(bar => {
		const width = bar.style.width;
		bar.style.width = '0%';
		setTimeout(() => {
			bar.style.width = width;
		}, 100);
	});
}

function addTooltips() {
	const elements = document.querySelectorAll('[title]');
	elements.forEach(element => {
		element.addEventListener('mouseenter', function(e) {
			// Enhanced tooltip styling could be added here
		});
	});
}

// Initialize all enhancements when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
	// Wait for main.js to load and initialize
	const initializeWhenReady = () => {
		if (typeof tagDB !== 'undefined' && typeof loadTags === 'function') {
			initializeEnhancements();
			updateHeaderUptime();
			
			// Connect to existing WebSocket if available
			if (typeof socket !== 'undefined' && socket) {
				const originalOnMessage = socket.onmessage;
				socket.onmessage = function(event) {
					// Call original handler first
					if (originalOnMessage) {
						originalOnMessage.call(this, event);
					}
					
					// Update our enhanced components
					setTimeout(() => {
						updateDashboardStats();
						updateCompactHeaderStatus();
					}, 100);
				};
			}
		} else {
			// Retry in 100ms if main.js isn't ready yet
			setTimeout(initializeWhenReady, 100);
		}
	};
	
	initializeWhenReady();
	
	// Add CSS for animations
	const style = document.createElement('style');
	style.textContent = `
		@keyframes spin {
			from { transform: rotate(0deg); }
			to { transform: rotate(360deg); }
		}
	`;
	document.head.appendChild(style);
});
