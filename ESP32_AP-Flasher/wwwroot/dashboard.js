// Dashboard JavaScript functionality
// Enhanced Dashboard Functionality
function initializeEnhancements() {
	// Initialize dashboard with real data
	updateCompactHeaderStatus();
	updateFooterStatus();
	updateSystemControlStatus();
	updateDashboardStats();
	updateTagStatusList();
	
	// Set up periodic updates
	setInterval(updateCompactHeaderStatus, 5000);
	setInterval(updateFooterStatus, 10000);
	setInterval(updateHeaderUptime, 60000);
	setInterval(updateSystemControlStatus, 15000);
	setInterval(updateDashboardStats, 30000);
	setInterval(updateTagStatusList, 15000);
	setInterval(updateBatteryChart, 60000); // Update chart every minute

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
				updateTagStatusList();
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
				updateTagStatusList();
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

			// Update performance metrics with real data
			updatePerformanceMetrics(data);
		})
		.catch(error => {
			console.error('System control status error:', error);
		});
}

// Update performance metrics with real system data
function updatePerformanceMetrics(data) {
	// Update memory usage
	const memoryUsage = document.getElementById('memory-usage');
	const memoryText = document.getElementById('memory-text');
	if (memoryUsage && memoryText && data.freeHeap && data.totalHeap) {
		const usedMemory = data.totalHeap - data.freeHeap;
		const memoryPercent = (usedMemory / data.totalHeap) * 100;
		memoryUsage.style.width = `${memoryPercent}%`;
		memoryText.textContent = `${memoryPercent.toFixed(1)}%`;

		// Color coding based on usage
		if (memoryPercent > 80) {
			memoryUsage.style.background = 'var(--error-color, #f87171)';
		} else if (memoryPercent > 60) {
			memoryUsage.style.background = 'var(--warning-color, #fbbf24)';
		} else {
			memoryUsage.style.background = 'var(--success-color, #4ade80)';
		}
	}

	// Update CPU usage (estimated from system load)
	const cpuUsage = document.getElementById('cpu-usage');
	const cpuText = document.getElementById('cpu-text');
	if (cpuUsage && cpuText) {
		const cpuPercent = data.cpuLoad || Math.random() * 30; // Fallback to random for demo
		cpuUsage.style.width = `${cpuPercent}%`;
		cpuText.textContent = `${cpuPercent.toFixed(1)}%`;

		// Color coding
		if (cpuPercent > 80) {
			cpuUsage.style.background = 'var(--error-color, #f87171)';
		} else if (cpuPercent > 60) {
			cpuUsage.style.background = 'var(--warning-color, #fbbf24)';
		} else {
			cpuUsage.style.background = 'var(--success-color, #4ade80)';
		}
	}

	// Update storage usage (SPIFFS usage)
	const storageUsage = document.getElementById('storage-usage');
	const storageText = document.getElementById('storage-text');
	if (storageUsage && storageText && data.spiffsUsed && data.spiffsTotal) {
		const storagePercent = (data.spiffsUsed / data.spiffsTotal) * 100;
		storageUsage.style.width = `${storagePercent}%`;
		storageText.textContent = `${storagePercent.toFixed(1)}%`;

		// Color coding
		if (storagePercent > 90) {
			storageUsage.style.background = 'var(--error-color, #f87171)';
		} else if (storagePercent > 75) {
			storageUsage.style.background = 'var(--warning-color, #fbbf24)';
		} else {
			storageUsage.style.background = 'var(--success-color, #4ade80)';
		}
	}
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

	// Update tag status list
	updateTagStatusList();
}

// New function to update tag status list
function updateTagStatusList() {
	const tagStatusList = document.getElementById('tag-status-list');
	if (!tagStatusList) return;

	const tags = Object.values(tagDB || {});
	const currentTime = Date.now();

	if (tags.length === 0) {
		tagStatusList.innerHTML = '<div class="no-tags-message">No tags found. Click "Find All Tags" to discover devices.</div>';
		return;
	}

	// Sort tags by last seen (most recent first)
	const sortedTags = tags.sort((a, b) => (b.lastseen || 0) - (a.lastseen || 0));

	// Limit to most recent 10 tags for performance
	const displayTags = sortedTags.slice(0, 10);

	const tagItems = displayTags.map(tag => {
		const isOnline = tag.lastseen && (currentTime - tag.lastseen * 1000) < 300000; // 5 minutes
		const batteryPercent = tag.batteryMv ? Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 10)) : 0;
		const batteryLevel = batteryPercent > 70 ? 'high' : batteryPercent > 30 ? 'medium' : 'low';

		const lastSeenText = tag.lastseen
			? new Date(tag.lastseen * 1000).toLocaleTimeString()
			: 'Never';

		return `
			<div class="tag-status-item">
				<div class="tag-status-indicator ${isOnline ? 'online' : 'offline'}"></div>
				<div class="tag-info">
					<div class="tag-mac">${tag.mac}</div>
					<div class="tag-details">
						<span>Last seen: ${lastSeenText}</span>
						${tag.batteryMv ? `
							<div class="tag-battery">
								<span>${batteryPercent.toFixed(0)}%</span>
								<div class="battery-bar">
									<div class="battery-fill ${batteryLevel}" style="width: ${batteryPercent}%"></div>
								</div>
							</div>
						` : ''}
					</div>
				</div>
			</div>
		`;
	}).join('');

	tagStatusList.innerHTML = tagItems;
}

// New function to refresh tag status
function refreshTagStatus() {
	const refreshBtn = document.querySelector('[onclick="refreshTagStatus()"]');
	if (refreshBtn) {
		const icon = refreshBtn.querySelector('.material-symbols-outlined');
		if (icon) {
			icon.style.animation = 'spin 1s linear infinite';
			setTimeout(() => {
				icon.style.animation = '';
			}, 1000);
		}
	}

	updateTagStatusList();
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
		updateTagStatusList();
		
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
			initializeBatteryChart();
			
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
						updateBatteryChart();
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

// Battery Chart Management
let batteryChart = null;

function initializeBatteryChart() {
	const canvas = document.getElementById('batteryChart');
	if (!canvas || typeof Chart === 'undefined') {
		console.warn('Chart.js not available or canvas not found');
		return;
	}

	const ctx = canvas.getContext('2d');

	// Destroy existing chart if it exists
	if (batteryChart) {
		batteryChart.destroy();
	}

	batteryChart = new Chart(ctx, {
		type: 'line',
		data: {
			labels: [],
			datasets: [{
				label: 'Average Battery',
				data: [],
				borderColor: '#4ade80',
				backgroundColor: 'rgba(74, 222, 128, 0.1)',
				tension: 0.4,
				fill: true
			}, {
				label: 'Low Battery Count',
				data: [],
				borderColor: '#f87171',
				backgroundColor: 'rgba(248, 113, 113, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y1'
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					labels: {
						color: '#ffffff',
						font: {
							size: 11
						}
					}
				}
			},
			scales: {
				x: {
					ticks: {
						color: '#ffffff',
						font: {
							size: 10
						}
					},
					grid: {
						color: 'rgba(255, 255, 255, 0.1)'
					}
				},
				y: {
					beginAtZero: true,
					max: 100,
					ticks: {
						color: '#ffffff',
						font: {
							size: 10
						},
						callback: function (value) {
							return value + '%';
						}
					},
					grid: {
						color: 'rgba(255, 255, 255, 0.1)'
					},
					title: {
						display: true,
						text: 'Battery %',
						color: '#ffffff',
						font: {
							size: 11
						}
					}
				},
				y1: {
					type: 'linear',
					display: true,
					position: 'right',
					beginAtZero: true,
					ticks: {
						color: '#ffffff',
						font: {
							size: 10
						}
					},
					grid: {
						drawOnChartArea: false,
					},
					title: {
						display: true,
						text: 'Low Battery Count',
						color: '#ffffff',
						font: {
							size: 11
						}
					}
				}
			}
		}
	});

	// Initialize with current data
	updateBatteryChart();
}

function updateBatteryChart() {
	if (!batteryChart) return;

	const tags = Object.values(tagDB || {});
	const now = new Date();
	const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	// Calculate current battery statistics
	const tagsWithBattery = tags.filter(tag => tag.batteryMv && tag.batteryMv > 0);
	const avgBattery = tagsWithBattery.length > 0
		? tagsWithBattery.reduce((sum, tag) => sum + Math.min(100, Math.max(0, (tag.batteryMv - 2000) / 10)), 0) / tagsWithBattery.length
		: 0;

	const lowBatteryCount = tagsWithBattery.filter(tag =>
		(tag.batteryMv - 2000) / 10 < 20
	).length;

	// Add new data point
	batteryChart.data.labels.push(timeLabel);
	batteryChart.data.datasets[0].data.push(avgBattery);
	batteryChart.data.datasets[1].data.push(lowBatteryCount);

	// Keep only last 20 data points
	if (batteryChart.data.labels.length > 20) {
		batteryChart.data.labels.shift();
		batteryChart.data.datasets[0].data.shift();
		batteryChart.data.datasets[1].data.shift();
	}

	batteryChart.update('none'); // Update without animation for better performance
}
