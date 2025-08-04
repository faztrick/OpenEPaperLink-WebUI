// OpenEPL ESP32 - Tag Management
// Contains all tag-related functionality and management

/**
 * Tag Management Class
 */
class TagManager {
    constructor() {
        this.tagDB = {};
        this.contentCards = [];
        this.serverTimeDiff = 0;
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for tag management
     */
    initializeEventListeners() {
        // Tag list click handler
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
                this.loadContentCard(mac);
            });
        }

        // Manual tag addition handlers
        this.initializeManualTagAddition();
    }

    /**
     * Load tags from server
     */
    async loadTags(pos = 0, limit = 50) {
        try {
            // Use the correct endpoint from web.cpp: /get_db
            const response = await fetch(`/get_db?pos=${pos}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.tags) {
                this.processTags(data.tags);
            }
            
            // Continue loading if there are more tags
            if (data.continu) {
                return this.loadTags(data.continu, limit);
            }
            
        } catch (error) {
            console.error('Load tags error:', error);
        }
    }

    /**
     * Process tags array from server
     */
    processTags(tagArray) {
        if (!Array.isArray(tagArray)) return;
        
        for (const element of tagArray) {
            const tagmac = element.mac;
            this.tagDB[tagmac] = element;

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
                showStatusMessage(tagmac + " removed by remote AP", 'info');
                continue;
            }

            this.updateTagDisplay(tagmac, element);
        }

        this.updateTagList();
    }

    /**
     * Update tag display elements
     */
    updateTagDisplay(tagmac, element) {
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

        let contentDefObj = this.getContentDefById(element.contentMode);
        if (contentDefObj) {
            $('#tag' + tagmac + ' .contentmode').innerHTML = contentDefObj.name;
        } else {
            // Fallback when content definition is not found
            $('#tag' + tagmac + ' .contentmode').innerHTML = `Content Mode ${element.contentMode}`;
        }
        
        // Update additional tag information
        this.updateTagDetails(tagmac, element);
    }

    /**
     * Update tag details and status
     */
    updateTagDetails(tagmac, element) {
        const tagElement = $('#tag' + tagmac);
        if (!tagElement) return;

        // Set data attributes for filtering and sorting
        tagElement.dataset.lastseen = element.lastSeen || 0;
        tagElement.dataset.nextcheckin = element.nextcheckin || 0;
        tagElement.dataset.nextupdate = element.nextupdate || 0;
        tagElement.dataset.wakeupreason = element.wakeupreason || 0;
        
        // Update battery and signal info
        if (element.batteryMv) {
            const batteryElement = tagElement.querySelector('.battery');
            if (batteryElement) {
                batteryElement.textContent = `${element.batteryMv}mV`;
                
                // Add battery level indicator
                if (element.batteryMv < 2400) {
                    batteryElement.classList.add('low-battery');
                } else {
                    batteryElement.classList.remove('low-battery');
                }
            }
        }
        
        if (element.RSSI) {
            const rssiElement = tagElement.querySelector('.rssi');
            if (rssiElement) {
                rssiElement.textContent = `${element.RSSI}dBm`;
            }
        }
    }

    /**
     * Update tag cards display and status
     */
    updateTagList() {
        if (this.serverTimeDiff > 1000000000) this.serverTimeDiff = 0;
        
        let tagcount = 0;
        let pendingcount = 0;
        let timeoutcount = 0;
        let lowbattcount = 0;

        const taglistElement = $('#taglist');
        if (!taglistElement) return;
        
        taglistElement.querySelectorAll('[data-mac]').forEach(item => {
            let tagmac = item.dataset.mac;
            tagcount++;
            
            if (this.tagDB[tagmac].batteryMv < 2400 && 
                this.tagDB[tagmac].batteryMv != 0 && 
                this.tagDB[tagmac].batteryMv != 1337) {
                lowbattcount++;
            }
            
            this.updateTagTimestamps(tagmac, item);
            this.updateTagStatus(tagmac, item);
            
            if (this.tagDB[tagmac].pending) pendingcount++;
        });

        // Update dashboard counters
        this.updateDashboardCounters(tagcount, pendingcount, lowbattcount, timeoutcount);
        
        // Show/hide no tags message
        this.toggleNoTagsMessage(tagcount === 0);
    }

    /**
     * Update tag timestamps display
     */
    updateTagTimestamps(tagmac, item) {
        if (item.dataset.lastseen && 
            item.dataset.lastseen > (Date.now() / 1000) - this.serverTimeDiff - 30 * 24 * 3600 * 60) {
            
            let idletime = (Date.now() / 1000) - this.serverTimeDiff - item.dataset.lastseen;
            $('#tag' + tagmac + ' .lastseen').innerHTML = 
                "<span>last seen</span>" + displayTime(Math.floor(idletime)) + " ago";
            
            if (idletime > 24 * 3600) {
                $('#tag' + tagmac).style.opacity = '.5';
                $('#tag' + tagmac + ' .lastseen').style.color = "red";
            }
        } else {
            const lastSeenEl = $('#tag' + tagmac + ' .lastseen');
            if (lastSeenEl) {
                lastSeenEl.innerHTML = "";
            }
        }

        // Update next checkin
        if (item.dataset.nextcheckin == 3216153600) {
            $('#tag' + tagmac + ' .nextcheckin').innerHTML = "In deep sleep";
        } else if (item.dataset.nextcheckin > 1672531200 && 
                   parseInt(item.dataset.wakeupreason) == 0) {
            let nextcheckin = item.dataset.nextcheckin - 
                             ((Date.now() / 1000) - this.serverTimeDiff);
            $('#tag' + tagmac + ' .nextcheckin').innerHTML = 
                "<span>expected checkin</span>" + displayTime(Math.floor(nextcheckin));
        }
    }

    /**
     * Update tag status indicators
     */
    updateTagStatus(tagmac, item) {
        // Update waiting icon
        if (item.dataset.nextupdate < (Date.now() / 1000) - this.serverTimeDiff) {
            $('#tag' + tagmac + ' .waitingicon').style.display = 'inline-block';
        } else {
            $('#tag' + tagmac + ' .waitingicon').style.display = 'none';
        }
        
        // Update warning indicators
        const warningIcon = $('#tag' + tagmac + ' .warningicon');
        if (warningIcon) {
            // Add warning logic here based on tag status
            if (this.tagDB[tagmac].batteryMv < 2200) {
                warningIcon.style.display = 'inline-block';
                warningIcon.title = 'Critical battery level';
            }
        }
    }

    /**
     * Update dashboard counters
     */
    updateDashboardCounters(tagcount, pendingcount, lowbattcount, timeoutcount) {
        updateElement('dashboardTagCount', tagcount);
        updateElement('dashboardPending', pendingcount);
        updateElement('dashboardLowBatt', lowbattcount);
        updateElement('dashboardTimeout', timeoutcount);
    }

    /**
     * Toggle no tags message visibility
     */
    toggleNoTagsMessage(showMessage) {
        const noTagsMessage = $('#noTagsMessage');
        const taglistContainer = $('#taglist');
        
        if (noTagsMessage && taglistContainer) {
            if (showMessage) {
                noTagsMessage.style.display = 'block';
                taglistContainer.style.display = 'none';
            } else {
                noTagsMessage.style.display = 'none';
                taglistContainer.style.display = 'block';
            }
        }
    }

    /**
     * Load content card configuration for a tag
     */
    async loadContentCard(mac) {
        try {
            // Use the correct endpoint from web.cpp: /get_db?mac=<mac>
            const response = await fetch(`/get_db?mac=${mac}`);
            const tagdata = await response.json();
            
            $('#cfgmac').innerHTML = mac;
            $('#cfgalias').value = tagdata.alias || '';
            
            // Show configuration dialog
            $('#configbox').showModal();
            
        } catch (error) {
            console.error('Error loading content card:', error);
            showStatusMessage('Failed to load tag configuration', 'error');
        }
    }

    /**
     * Get content definition by ID
     */
    getContentDefById(id) {
        // Safety check to ensure contentCards is an array
        if (!Array.isArray(this.contentCards)) {
            console.warn('contentCards is not an array, returning null for id:', id);
            return null;
        }
        return this.contentCards.find(card => card.id === id);
    }

    /**
     * Send command to tag
     */
    async sendCmd(mac, cmd) {
        try {
            // Use the correct endpoint from web.cpp: /tag_cmd with form data
            const formData = new FormData();
            formData.append('mac', mac);
            formData.append('cmd', cmd);
            
            const response = await fetch('/tag_cmd', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                showStatusMessage(`Command sent to ${mac}`, 'success');
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending command:', error);
            showStatusMessage('Failed to send command', 'error');
        }
    }

    /**
     * Initialize manual tag addition functionality
     */
    initializeManualTagAddition() {
        // Add Tag Manually button
        const addTagManuallyBtn = $('#addTagManually');
        if (addTagManuallyBtn) {
            addTagManuallyBtn.addEventListener('click', () => {
                $('#addTagDialog').showModal();
            });
        }
        
        // Refresh Tags button
        const refreshTagsBtn = $('#refreshTags');
        if (refreshTagsBtn) {
            refreshTagsBtn.addEventListener('click', () => {
                this.loadTags(0);
            });
        }
        
        // Dialog handlers
        const addTagCancelBtn = $('#addTagCancel');
        if (addTagCancelBtn) {
            addTagCancelBtn.addEventListener('click', () => {
                $('#addTagDialog').close();
                this.clearAddTagForm();
            });
        }
        
        const addTagSaveBtn = $('#addTagSave');
        if (addTagSaveBtn) {
            addTagSaveBtn.addEventListener('click', () => {
                this.addTagManually();
            });
        }
        
        // MAC address input formatting
        const newTagMacInput = $('#newTagMac');
        if (newTagMacInput) {
            newTagMacInput.addEventListener('input', (e) => {
                let value = cleanMacAddress(e.target.value);
                if (value.length > 12) {
                    value = value.substring(0, 12);
                }
                e.target.value = value;
            });
        }
    }

    /**
     * Add tag manually
     */
    addTagManually() {
        const macInput = $('#newTagMac');
        const aliasInput = $('#newTagAlias');
        const typeInput = $('#newTagType');
        
        if (!macInput || !typeInput) {
            showStatusMessage('Form elements not found', 'error');
            return;
        }
        
        const mac = macInput.value.trim().toUpperCase();
        const alias = aliasInput ? aliasInput.value.trim() : '';
        const tagType = parseInt(typeInput.value);
        
        // Validate MAC address
        if (!validateMacAddress(mac)) {
            showStatusMessage('Please enter a valid 12-digit hexadecimal MAC address', 'error');
            macInput.focus();
            return;
        }
        
        // Check if tag already exists
        if (this.tagDB[mac]) {
            showStatusMessage('A tag with this MAC address already exists', 'error');
            macInput.focus();
            return;
        }
        
        // Create virtual tag
        const virtualTag = this.createVirtualTag(mac, alias, tagType);
        
        // Add to database and create visual element
        this.tagDB[mac] = virtualTag;
        this.createTagElement(virtualTag);
        this.updateTagList();
        
        // Close dialog
        $('#addTagDialog').close();
        this.clearAddTagForm();
        
        showStatusMessage(`Virtual tag ${alias || mac} added successfully`, 'success');
    }

    /**
     * Create virtual tag object
     */
    createVirtualTag(mac, alias, tagType) {
        return {
            mac: mac,
            alias: alias || mac.replace(/^0+/, '') || mac,
            hwType: tagType,
            contentMode: 0,
            batteryMv: 0,
            temperature: 0,
            RSSI: -999,
            pending: false,
            isexternal: false,
            nextcheckin: 0,
            nextupdate: 0,
            lastSeen: 0,
            wakeupreason: 0,
            capabilities: TAG_CAPABILITIES[tagType] || 0,
            modecfgjson: '{}',
            rotate: 0,
            lut: 0,
            invert: 0,
            ch: 0,
            isVirtual: true
        };
    }

    /**
     * Create tag visual element
     */
    createTagElement(tagData) {
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

    /**
     * Clear add tag form
     */
    clearAddTagForm() {
        const form = $('#addTagDialog');
        if (form) {
            $('#newTagMac').value = '';
            $('#newTagAlias').value = '';
            $('#newTagType').value = '1';
        }
    }

    /**
     * Load content cards configuration
     */
    async loadContentCards() {
        try {
            const response = await fetch('/content_cards.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Check if data is already an array or has a cards property
            this.contentCards = Array.isArray(data) ? data : (data.cards || []);
            
            // Synchronize with global cardconfig variable for legacy compatibility
            if (typeof window !== 'undefined') {
                window.cardconfig = this.contentCards;
            }
        } catch (error) {
            console.error('Could not load content_cards.json:', error);
            showStatusMessage('Could not load content cards configuration', 'error');
            // Initialize with empty array as fallback
            this.contentCards = [];
            if (typeof window !== 'undefined') {
                window.cardconfig = [];
            }
        }
    }
}

// Create global tag manager instance
window.tagManager = new TagManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TagManager;
}
