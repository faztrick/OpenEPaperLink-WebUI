// // ============================================================================
// // DEPRECATED: Legacy WifiManager (historical reference only)
// // ----------------------------------------------------------------------------
// // This file contains the old WifiManager implementation kept solely for
// // reference during the transition to the unified WiFiModule (see
// // include/wifi_module.h / wifi_module.cpp). A global search confirmed no
// // translation units include wifimanager.h anymore, so this code is no longer
// // part of the active firmware logic.
// //
// // Removal Plan:
// //   1. Perform on-device regression tests (AP mode, STA connect/reconnect,
// //      Improv provisioning, Ethernet if enabled).
// //   2. If all pass, delete wifimanager.cpp & wifimanager.h entirely.
// //   3. Update docs to remove references to "WifiManager".
// //
// // Until removal, the implementation is excluded from compilation via #if 0
// // to avoid increasing binary size / compile time.
// // ============================================================================
// #if 0 // LEGACY WIFI MANAGER DISABLED (compile excluded)

// // (legacy code begins)

// void WifiManager::rankCandidateNetworks(std::vector<std::pair<String, String>> &candidates)
// {
//     if (candidates.size() <= 1)
//         return;
//     wifi_mode_t currentMode; // ensure STA active for scan
//     if (esp_wifi_get_mode(&currentMode) == ESP_OK)
//     {
//         if (currentMode == WIFI_MODE_AP)
//             WiFi.mode(WIFI_AP_STA);
//     }
//     terminalLog("[WiFi] Scanning to rank candidate networks...");
//     int16_t found = WiFi.scanNetworks(false, true);
//     if (found < 0)
//     {
//         Serial.println("[WiFi] Scan failed or returned no networks; retaining original candidate order");
//         WiFi.scanDelete();
//         return;
//     }
//     struct Ranked
//     {
//         String ssid;
//         String pass;
//         int rssi;
//         bool present;
//     };
//     std::vector<Ranked> ranked;
//     ranked.reserve(candidates.size());
//     for (auto &p : candidates)
//     {
//         int bestRssi = -300;
//         bool present = false;
//         for (int i = 0; i < found; ++i)
//         {
//             String scanned = WiFi.SSID(i);
//             if (scanned == p.first)
//             {
//                 int r = WiFi.RSSI(i);
//                 if (r > bestRssi)
//                 {
//                     bestRssi = r;
//                     present = true;
//                 }
//             }
//         }
//         ranked.push_back({p.first, p.second, bestRssi, present});
//     }
//     std::stable_sort(ranked.begin(), ranked.end(), [](const Ranked &a, const Ranked &b)
//                      { if (a.present!=b.present) return a.present && !b.present; if (a.present && b.present) return a.rssi > b.rssi; return false; });
//     std::vector<std::pair<String, String>> reordered;
//     reordered.reserve(ranked.size());
//     for (auto &r : ranked)
//     {
//         reordered.emplace_back(r.ssid, r.pass);
//         if (r.present)
//             Serial.printf("[WiFi] Candidate SSID '%s' RSSI %d dBm\n", r.ssid.c_str(), r.rssi);
//         else
//             Serial.printf("[WiFi] Candidate SSID '%s' not currently visible\n", r.ssid.c_str());
//     }
//     candidates.swap(reordered);
//     WiFi.scanDelete();
// }
// uint8_t x_buffer[100];
// uint8_t x_position = 0;

// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
// static bool eth_init = false;
// static bool eth_connected = false;
// static bool eth_ip_ok = false;
// static long eth_timeout = 0;
// #endif

// WifiManager::WifiManager()
// {
//     _reconnectIntervalCheck = 5000;
//     _retryIntervalCheck = 5 * 60000;
//     _connectionTimeout = 20000; // Increased timeout for ESP32-S3

//     _nextReconnectCheck = 0;
//     _connected = false;
//     _savewhensuccessfull = false;

//     // Default: verbose WiFi scan debug off
//     _scanVerbose = false;

//     // Initialize buffer to prevent undefined behavior
//     memset(serialBuffer, 0, sizeof(serialBuffer));
//     _ssid = "";
//     _APstarted = false;
//     wifiStatus = NOINIT;

//     WiFi.onEvent(WiFiEvent);
//     WiFiEventId_t eventID = WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info)
//                                          {
//         Serial.printf("WiFi lost connection. Reason: %d - ", info.wifi_sta_disconnected.reason);
//         // Print human-readable disconnect reason
//         switch (info.wifi_sta_disconnected.reason) {
//             case WIFI_REASON_AUTH_EXPIRE:
//                 Serial.println("Auth expired");
//                 break;
//             case WIFI_REASON_AUTH_LEAVE:
//                 Serial.println("Auth leave");
//                 break;
//             case WIFI_REASON_ASSOC_EXPIRE:
//                 Serial.println("Assoc expired");
//                 break;
//             case WIFI_REASON_ASSOC_TOOMANY:
//                 Serial.println("Too many associations");
//                 break;
//             case WIFI_REASON_NOT_AUTHED:
//                 Serial.println("Not authenticated");
//                 break;
//             case WIFI_REASON_NOT_ASSOCED:
//                 Serial.println("Not associated");
//                 break;
//             case WIFI_REASON_ASSOC_LEAVE:
//                 Serial.println("Association leave");
//                 break;
//             case WIFI_REASON_BEACON_TIMEOUT:
//                 Serial.println("Beacon timeout");
//                 break;
//             case WIFI_REASON_NO_AP_FOUND:
//                 Serial.println("No AP found");
//                 break;
//             case WIFI_REASON_AUTH_FAIL:
//                 Serial.println("Auth failed");
//                 break;
//             case WIFI_REASON_ASSOC_FAIL:
//                 Serial.println("Association failed");
//                 break;
//             case WIFI_REASON_HANDSHAKE_TIMEOUT:
//                 Serial.println("Handshake timeout");
//                 break;
//             default:
//                 Serial.printf("Unknown reason: %d\n", info.wifi_sta_disconnected.reason);
//                 break;
//         } },
//                                          WiFiEvent_t::ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
// }

// void WifiManager::setScanVerbose(bool v)
// {
//     _scanVerbose = v;
// }

// bool WifiManager::scanVerbose() const
// {
//     return _scanVerbose;
// }

// void WifiManager::terminalLog(String text)
// {
//     Serial.println(text);
// #ifdef HAS_TFT
//     TFTLog(text);
// #endif
// }

// void WifiManager::poll()
// {
// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)

//     if (eth_connected)
//     {
//         wifiStatus = ETHERNET;
//         if (!eth_ip_ok && eth_timeout != 0 && millis() - eth_timeout > 2000)
//         {
//             eth_timeout = 0;
//             eth_connected = false;
//         }
//     }
//     else if (!eth_connected && wifiStatus == ETHERNET)
//     {
//         wifiStatus = NOINIT;
//         _APstarted = false;
//         WiFi.mode(WIFI_STA);
//         connectToWifi();
//     }

// #endif

//     // Initial bring-up: if WiFi hasn't been initialized yet, try to connect.
//     // On failure or missing credentials, connectToWifi() will start the open config AP.
//     if (wifiStatus == NOINIT)
//     {
//         Serial.println("[WiFi] Initializing WiFi subsystem (NOINIT → CONNECT/CONFIG AP)");
//         // Always bring up the configuration AP first so users can connect immediately
//         // and so AP remains available while STA attempts proceed.
//         startManagementServer();
//         // Attempt STA connection in parallel; AP will stay up (WIFI_AP_STA)
//         connectToWifi();
//         _nextReconnectCheck = millis() + _reconnectIntervalCheck;
//     }

//     // Optimized WiFi reconnection logic
//     if (wifiStatus == AP && millis() > _nextReconnectCheck && !_ssid.isEmpty())
//     {
//         if (apClients == 0)
//         {
//             terminalLog("Attempting to reconnect to WiFi (no AP clients).");
//             logLine("Attempting to reconnect to WiFi.");
//             _APstarted = false;
//             wifiStatus = NOINIT;
//             connectToWifi();
//         }
//         else
//         {
//             // Extend retry interval when clients are connected
//             _nextReconnectCheck = millis() + _retryIntervalCheck;
//         }
//     }

//     // Enhanced connection monitoring
//     if (wifiStatus == CONNECTED && millis() > _nextReconnectCheck)
//     {
//         // rename variable to avoid shadowing member wifiStatus
//         wl_status_t currentStaStatus = WiFi.status();
//         if (currentStaStatus != WL_CONNECTED)
//         {
//             _connected = false;
//             Serial.printf("WiFi connection lost (status: %d). Attempting to reconnect.\n", currentStaStatus);
//             terminalLog("WiFi connection lost. Attempting to reconnect.");
//             logLine("WiFi connection lost. Attempting to reconnect.");

//             // Use WiFi.reconnect() first, then full reconnect if needed
//             WiFi.reconnect();
//             _connected = waitForConnection();

//             if (!_connected)
//             {
//                 Serial.println("Reconnect failed, trying full connection process");
//                 connectToWifi();
//             }
//         }
//         else
//         {
//             _nextReconnectCheck = millis() + _reconnectIntervalCheck;
//         }
//     }

// #ifndef HAS_USB

// #ifdef ETHERNET_CLK_MODE
//     if (!(ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_IN || ETHERNET_CLK_MODE == ETH_CLOCK_GPIO0_OUT))
//     {
// #endif
//         // Handle GPIO0 reset functionality
//         if (digitalRead(0) == LOW)
//         {
//             Serial.println("GPIO0 LOW detected");
//             unsigned long starttime = millis();
//             while (digitalRead(0) == LOW && millis() - starttime < 5000)
//             {
//                 vTaskDelay(pdMS_TO_TICKS(10)); // Small delay to prevent tight loop
//             }
//             if (digitalRead(0) == LOW)
//             {
//                 Serial.println("Resetting WiFi settings...");

//                 // Clear WiFi settings stored in filesystem (STA credentials)
//                 if (contentFS)
//                 {
//                     xSemaphoreTake(fsMutex, portMAX_DELAY);
//                     fs::File f = contentFS->open("/current/staconfig.json", "w");
//                     if (f)
//                     {
//                         const char *empty = "{\"ssid\":\"\",\"password\":\"\",\"ip\":\"\",\"mask\":\"\",\"gw\":\"\",\"dns\":\"\"}";
//                         f.print(empty);
//                         f.close();
//                         Serial.println("✅ STA WiFi settings cleared from staconfig.json");
//                     }
//                     else
//                     {
//                         Serial.println("❌ Failed to open staconfig.json for clearing");
//                     }
//                     xSemaphoreGive(fsMutex);
//                 }

//                 // Clear ESP32 WiFi config
//                 wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
//                 esp_err_t ret = esp_wifi_init(&cfg);
//                 if (ret == ESP_OK || ret == ESP_ERR_WIFI_NOT_INIT)
//                 {
//                     vTaskDelay(pdMS_TO_TICKS(2000));

//                     ret = esp_wifi_restore();
//                     if (ret != ESP_OK)
//                     {
//                         Serial.printf("WiFi restore failed: %s\n", esp_err_to_name(ret));
//                     }
//                     else
//                     {
//                         Serial.println("✅ WiFi configurations cleared!");
//                     }
//                 }
//                 else
//                 {
//                     Serial.printf("WiFi init failed: %s\n", esp_err_to_name(ret));
//                 }

//                 vTaskDelay(pdMS_TO_TICKS(100));
//                 ESP.restart();
//             }
//         }
// #ifdef ETHERNET_CLK_MODE
//     }
// #endif

// #endif

//     pollSerial();
// }

// void WifiManager::initEth()
// {
// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
//     if (!eth_init)
//     {
//         eth_init = true;
//         ETH.begin(
//             ETH_PHY_ADDR,
//             ETHERNET_PHY_POWER,
//             ETHERNET_PHY_MDC,
//             ETHERNET_PHY_MDIO,
//             ETHERNET_PHY_TYPE,
//             ETHERNET_CLK_MODE,
//             false);
//     }
// #endif
// }

// bool WifiManager::connectToWifi()
// {
// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
//     if (wifiStatus == ETHERNET || eth_connected)
//         return true;
// #endif

//     // Collect candidates: NVS first, then file-defined
//     std::vector<std::pair<String, String>> candidates;
//     String nvs_ssid = WiFi_SSID();
//     String nvs_pass = WiFi_psk();
//     if (!nvs_ssid.isEmpty())
//         candidates.emplace_back(nvs_ssid, nvs_pass);

//     StationConfig scfg;
//     loadStationConfig(scfg);
//     for (auto &p : scfg.networks)
//     {
//         bool exists = false;
//         for (auto &c : candidates)
//         {
//             if (c.first == p.first)
//             {
//                 exists = true;
//                 break;
//             }
//         }
//         if (!exists)
//             candidates.push_back(p);
//     }
//     _ssid = scfg.networks.empty() ? String() : scfg.networks.front().first;
//     _pass = scfg.networks.empty() ? String() : scfg.networks.front().second;

//     if (candidates.empty())
//     {
//         terminalLog("No connection info saved");
//         logLine("No connection information saved");
//         startManagementServer();
//         return false;
//     }

//     terminalLog("Trying saved WiFi networks (" + String((int)candidates.size()) + ")...");
//     // Rank candidates by current RSSI
//     rankCandidateNetworks(candidates);

//     // Apply network IP/DNS settings
//     applyStationIpConfig(scfg);

//     // Try each candidate until one connects
//     for (size_t i = 0; i < candidates.size(); ++i)
//     {
//         const String &ssid = candidates[i].first;
//         const String &pass = candidates[i].second;
//         if (ssid.isEmpty())
//             continue;
//         terminalLog("ssid: " + ssid);
//         // Save credentials back to staconfig.json when a candidate succeeds
//         if (connectToWifi(ssid, pass, true))
//         {
//             _ssid = ssid;
//             _pass = pass;
//             return true;
//         }
//     }

//     // If all candidates failed, start open AP for configuration
//     startManagementServer();
//     return false;
// }

// bool WifiManager::connectToWifi(String ssid, String pass, bool savewhensuccessfull)
// {
// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
//     if (wifiStatus == ETHERNET)
//         return true;
// #endif

//     if (ssid.isEmpty())
//     {
//         Serial.println("ERROR: Empty SSID provided");
//         return false;
//     }

//     _ssid = ssid;
//     _pass = pass;
//     _savewhensuccessfull = savewhensuccessfull;

//     // Keep AP running if we already started it (always-on AP)
//     // Avoid tearing down AP by not forcing full disconnect/mode-null.
//     // Instead, ensure the correct combined mode is set below.

//     // Set hostname before connecting
//     String hostname = buildHostname(WIFI_IF_STA);
//     if (!WiFi.setHostname(hostname.c_str()))
//     {
//         Serial.printf("WARNING: Failed to set hostname: %s\n", hostname.c_str());
//     }

//     // If AP is active, use dual mode so AP remains available during STA connect
//     if (_APstarted)
//     {
//         WiFi.mode(WIFI_AP_STA);
//         // Ensure AP is up (idempotent if already started)
//         if (WiFi.softAPIP() == IPAddress(0, 0, 0, 0))
//         {
//             WiFi.softAP("OpenEPaperLink", "", 1, false, 8);
//         }
//     }
//     else
//     {
//         WiFi.mode(WIFI_STA);
//     }

//     // ESP32-S3 Performance optimizations
//     esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE); // Disable power saving for faster connection
//     if (ret != ESP_OK)
//     {
//         Serial.printf("WARNING: Failed to set power save mode: %s\n", esp_err_to_name(ret));
//     }

//     // Set TX power (Arduino API returns bool)
//     {
//         bool txp_ok = WiFi.setTxPower(WIFI_POWER_19_5dBm); // Optimal power for ESP32-S3
//         if (!txp_ok)
//         {
//             Serial.println("WARNING: Failed to set TX power");
//         }
//     }

//     // Initialize WiFi with optimized configuration
//     wifi_init_config_t wifi_init_cfg = WIFI_INIT_CONFIG_DEFAULT();
//     wifi_init_cfg.nvs_enable = 0; // Disable NVS storage
//     ret = esp_wifi_init(&wifi_init_cfg);
//     // It's not an error if WiFi was already initialized
//     if (ret != ESP_OK && ret != ESP_ERR_WIFI_INIT_STATE)
//     {
//         Serial.printf("ERROR: WiFi init failed: %s\n", esp_err_to_name(ret));
//         return false;
//     }

//     // Use RAM storage only; persistence handled via filesystem
//     ret = esp_wifi_set_storage(WIFI_STORAGE_RAM);
//     if (ret != ESP_OK)
//     {
//         Serial.printf("WARNING: Failed to set WiFi storage: %s\n", esp_err_to_name(ret));
//     }

//     Serial.printf("WiFi optimizations applied for ESP32-S3 - SSID: %s\n", ssid.c_str());

//     // Configure WiFi connection parameters
//     wifi_config_t wifi_config{}; // value-initialize to zero

//     // Safely copy SSID and password
//     strncpy((char *)wifi_config.sta.ssid, ssid.c_str(), sizeof(wifi_config.sta.ssid) - 1);
//     wifi_config.sta.ssid[sizeof(wifi_config.sta.ssid) - 1] = '\0';

//     strncpy((char *)wifi_config.sta.password, pass.c_str(), sizeof(wifi_config.sta.password) - 1);
//     wifi_config.sta.password[sizeof(wifi_config.sta.password) - 1] = '\0';

//     // Optimized scan and connection settings
//     wifi_config.sta.scan_method = WIFI_FAST_SCAN;            // Fast scan method
//     wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL; // Connect to strongest signal
//     wifi_config.sta.threshold.rssi = -127;                   // Accept any signal strength
//     wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;     // Accept any auth mode initially
//     wifi_config.sta.pmf_cfg.capable = true;                  // Enable PMF capability
//     wifi_config.sta.pmf_cfg.required = false;                // But don't require it

//     terminalLog("Connecting to WiFi with optimized settings...");
// #ifdef HAS_RGB_LED
//     // Indicate scanning/connecting with blue idle
//     rgbIdleColor = CRGB::Blue;
//     shortBlink(CRGB::Blue);
// #endif
//     WiFi.persistent(false);

//     // Apply configuration and connect
//     ret = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
//     if (ret != ESP_OK)
//     {
//         Serial.printf("ERROR: Failed to set WiFi config: %s\n", esp_err_to_name(ret));
//         return false;
//     }

//     ret = esp_wifi_connect();
//     if (ret != ESP_OK)
//     {
//         Serial.printf("ERROR: WiFi connect failed: %s\n", esp_err_to_name(ret));
// #ifdef HAS_RGB_LED
//         shortBlink(CRGB::Red);
// #endif
//         return false;
//     }

//     _connected = waitForConnection();
//     return _connected;
// }

// bool WifiManager::waitForConnection()
// {
// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)
//     if (wifiStatus == ETHERNET)
//         return true;
// #endif

//     unsigned long timeout = millis() + _connectionTimeout;
//     wifiStatus = WAIT_CONNECTING;
//     wl_status_t lastStatus = WL_IDLE_STATUS;

//     while (WiFi.status() != WL_CONNECTED)
//     {
//         if (millis() > timeout)
//         {
//             wl_status_t currentStatus = WiFi.status();
//             Serial.printf("WiFi connection timeout. Final status: %d\n", currentStatus);

//             // Provide more detailed error information
//             switch (currentStatus)
//             {
//             case WL_NO_SSID_AVAIL:
//                 terminalLog("!WiFi Error: SSID not found");
//                 break;
//             case WL_CONNECT_FAILED:
//                 terminalLog("!WiFi Error: Connection failed (wrong password?)");
//                 break;
//             case WL_CONNECTION_LOST:
//                 terminalLog("!WiFi Error: Connection lost during handshake");
//                 break;
//             case WL_DISCONNECTED:
//                 terminalLog("!WiFi Error: Disconnected");
//                 break;
//             default:
//                 terminalLog("!Unable to connect to WiFi - timeout");
//                 break;
//             }

//             logLine("Unable to connect to WiFi");
// #ifdef HAS_RGB_LED
//             // Show error in red, then revert to AP-yellow if AP is active, else keep blue
//             shortBlink(CRGB::Red);
//             if (_APstarted)
//             {
//                 rgbIdleColor = CRGB::Yellow;
//             }
//             else
//             {
//                 rgbIdleColor = CRGB::Blue;
//             }
// #endif
//             startManagementServer();
//             return false;
//         }

//         // Log status changes for debugging
//         wl_status_t currentStatus = WiFi.status();
//         if (currentStatus != lastStatus)
//         {
//             Serial.printf("WiFi status changed: %d -> %d\n", lastStatus, currentStatus);
//             lastStatus = currentStatus;
//         }

//         vTaskDelay(pdMS_TO_TICKS(250));
//     }

//     // Save credentials if requested
//     if (_savewhensuccessfull)
//     {
//         if (contentFS)
//         {
//             JsonDocument cfg;
//             fs::File r = contentFS->open("/current/staconfig.json", "r");
//             if (r)
//             {
//                 deserializeJson(cfg, r);
//                 r.close();
//             }
//             cfg["ssid"] = _ssid;
//             cfg["password"] = _pass;
//             xSemaphoreTake(fsMutex, portMAX_DELAY);
//             fs::File w = contentFS->open("/current/staconfig.json", "w");
//             if (w)
//             {
//                 serializeJson(cfg, w);
//                 w.close();
//             }
//             xSemaphoreGive(fsMutex);
//             Serial.println("✅ WiFi credentials saved to staconfig.json");
//         }
//         _savewhensuccessfull = false;
//     }

//     // Configure WiFi for optimal performance
//     WiFi.setAutoReconnect(true);
//     WiFi.persistent(false);

//     IPAddress IP = WiFi.localIP();
//     terminalLog("✅ Connected! IP: " + IP.toString());
//     Serial.printf("WiFi connected successfully - IP: %s, RSSI: %d dBm\n",
//                   IP.toString().c_str(), WiFi.RSSI());

//     _nextReconnectCheck = millis() + _reconnectIntervalCheck;
//     wifiStatus = CONNECTED;
// #ifdef HAS_RGB_LED
//     shortBlink(CRGB::Green);
//     rgbIdleColor = CRGB::Green;
// #endif
//     return true;
// }

// void WifiManager::startManagementServer()
// {
//     if (!_APstarted && wifiStatus != ETHERNET)
//     {
//         ApConfig apcfg;
//         loadApConfig(apcfg); // load if present
//         String apSsid = apcfg.ssid;
//         String apPassword = apcfg.password; // will be ignored for open AP
//         int apChannel = apcfg.channel;
//         bool apHidden = apcfg.hidden;
//         int apMaxClients = apcfg.maxClients;
//         bool apEnabled = apcfg.enabled;
//         String apIPStr = apcfg.ip;
//         String apMaskStr = apcfg.mask;
//         String apGwStr = apcfg.gw;

//         // Sanitize configuration
//         if (apSsid.length() == 0)
//             apSsid = "OpenEPaperLink";
//         // Always run open AP (no password), per requirement
//         bool usePassword = false;
//         if (apChannel < 1 || apChannel > 13)
//             apChannel = 1;
//         if (apMaxClients < 1)
//             apMaxClients = 1;
//         else if (apMaxClients > 10)
//             apMaxClients = 10;

//         if (!apEnabled)
//         {
//             // AP explicitly disabled by config; don't start management AP
//             terminalLog("Config AP disabled by configuration");
//             Serial.println("[WiFiManager] Config AP disabled by configuration (apEnabled=false)");
//             return;
//         }

//         terminalLog("Starting config AP, ssid: " + apSsid);
//         logLine("Starting configuration AP, ssid " + apSsid);
//         Serial.printf("[WiFiManager] Attempting to start AP: ssid=%s, channel=%d, max_clients=%d, hidden=%s, password='%s'\n", apSsid.c_str(), apChannel, apMaxClients, apHidden ? "true" : "false", apPassword.c_str());

//         // Proper mode: keep STA available too
//         // Avoid full disconnect if already in AP/dual to keep clients
//         if ((WiFi.getMode() & WIFI_MODE_AP) == 0)
//         {
//             terminalLog("Switching to AP mode (WIFI_AP_STA) for management server");
//             Serial.println("[WiFiManager] Switching to AP mode (WIFI_AP_STA)");
//             WiFi.disconnect(true, true);
//             vTaskDelay(pdMS_TO_TICKS(200));
//         }

//         // Optimized WiFi settings for ESP32-S3 AP mode
//         terminalLog("Configuring WiFi for ESP32-S3 AP mode with optimizations");
//         WiFi.mode(WIFI_AP_STA); // Use dual mode to allow scanning while in AP mode

//         // Configure WiFi performance settings
//         esp_err_t ret = esp_wifi_set_ps(WIFI_PS_NONE); // Disable power saving for better performance
//         if (ret != ESP_OK)
//         {
//             Serial.printf("WARNING: Failed to set AP power save mode: %s\n", esp_err_to_name(ret));
//         }

//         if (!WiFi.setTxPower(WIFI_POWER_19_5dBm))
//         { // Set optimal power for ESP32-S3
//             Serial.println("WARNING: Failed to set AP TX power");
//         }

//         // Remove unused local scanConf; scanning is handled elsewhere when needed

//         // Optional: configure AP IP if provided
//         if (apIPStr.length() > 0 && apMaskStr.length() > 0 && apGwStr.length() > 0)
//         {
//             IPAddress apIP, apMask, apGw;
//             if (apIP.fromString(apIPStr) && apMask.fromString(apMaskStr) && apGw.fromString(apGwStr))
//             {
//                 WiFi.softAPConfig(apIP, apGw, apMask);
//             }
//         }

//         // Start AP with optimized settings and configured parameters
//         const char *apPassCStr = usePassword ? apPassword.c_str() : "";
//         if (!WiFi.softAP(apSsid.c_str(), apPassCStr, apChannel, apHidden, apMaxClients))
//         { // Allow up to apMaxClients connections
//             Serial.println("[WiFiManager] ERROR: Failed to start WiFi AP");
//             Serial.printf("[WiFiManager] softAP() params: ssid='%s', password='%s', channel=%d, hidden=%s, max_clients=%d\n", apSsid.c_str(), apPassCStr, apChannel, apHidden ? "true" : "false", apMaxClients);
//             Serial.printf("[WiFiManager] WiFi.getMode() = %d\n", WiFi.getMode());
//             return;
//         }

//         // Set AP hostname based on buildHostname(AP)
//         String apHost = buildHostname(WIFI_IF_AP);
//         if (!WiFi.softAPsetHostname(apHost.c_str()))
//         {
//             Serial.println("WARNING: Failed to set AP hostname");
//         }

//         // Set optimal bandwidth for AP mode
//         ret = esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
//         if (ret != ESP_OK)
//         {
//             Serial.printf("WARNING: Failed to set AP bandwidth: %s\n", esp_err_to_name(ret));
//         }

//         IPAddress IP = WiFi.softAPIP();
//         terminalLog("✅ AP Started (open). Connect and visit http://" + String(IP.toString().c_str()) + "/setup");
//         Serial.printf("AP Mode (open): SSID=%s, CH=%d, Hidden=%s, Max=%d, IP=%s, MAC=%s\n",
//                       apSsid.c_str(), apChannel, apHidden ? "yes" : "no", apMaxClients,
//                       IP.toString().c_str(), WiFi.softAPmacAddress().c_str());

//         _APstarted = true;
//         _nextReconnectCheck = millis() + _retryIntervalCheck;
//         wifiStatus = AP;
// #ifdef HAS_RGB_LED
//         // Indicate AP availability with yellow idle
//         rgbIdleColor = CRGB::Yellow;
//         shortBlink(CRGB::Yellow);
// #endif
//     }
// }

// String WifiManager::buildHostname(wifi_interface_t interface)
// {
//     char hostname[32] = "OpenEpaperLink-";
//     uint8_t mac[6];
//     esp_wifi_get_mac(interface, mac);
//     char lastTwoBytes[5];
//     snprintf(lastTwoBytes, sizeof(lastTwoBytes), "%02X%02X", mac[4], mac[5]);

//     // Use safe string concatenation with bounds checking
//     size_t currentLen = strlen(hostname);
//     size_t remaining = sizeof(hostname) - currentLen - 1;
//     if (strlen(lastTwoBytes) <= remaining)
//     {
//         strncat(hostname, lastTwoBytes, remaining);
//     }

//     if (config.alias[0] != '\0')
//     {
//         // Reset hostname to use alias instead
//         memset(hostname, 0, sizeof(hostname));
//         int len = strlen(config.alias);
//         int j = 0;
//         for (int i = 0; i < len && j < (int)(sizeof(hostname) - 1); i++)
//         {
//             char c = config.alias[i];
//             if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-')
//             {
//                 hostname[j] = c;
//                 j++;
//             }
//         }
//         hostname[j] = '\0';
//     }
//     return String(hostname);
// }

// IPAddress WifiManager::localIP()
// {
//     if (wifiStatus == ETHERNET)
//     {
//         return ETH.localIP();
//     }
//     else
//     {
//         return WiFi.localIP();
//     }
// }

// String WifiManager::WiFi_SSID()
// {
//     wifi_config_t conf;
//     esp_wifi_get_config(WIFI_IF_STA, &conf);
//     return String(reinterpret_cast<const char *>(conf.sta.ssid));
// }

// String WifiManager::WiFi_psk()
// {
//     if (WiFiGenericClass::getMode() == WIFI_MODE_NULL)
//     {
//         return String();
//     }
//     wifi_config_t conf;
//     esp_wifi_get_config(WIFI_IF_STA, &conf);
//     return String(reinterpret_cast<char *>(conf.sta.password));
// }

// void WifiManager::pollSerial()
// {
//     while (Serial.available() > 0)
//     {
//         char receivedChar = Serial.read();

//         if (parse_improv_serial_byte(x_position, receivedChar, x_buffer, onCommandCallback, onErrorCallback))
//         {
//             x_buffer[x_position++] = receivedChar;
//             if (x_position > 100)
//             {
//                 x_position = 0;
//                 Serial.println("buffer full!");
//             }
//         }
//         else
//         {
//             x_position = 0;
//         }
//     }
// }

// void WifiManager::WiFiEvent(WiFiEvent_t event)
// {
//     Serial.printf("[WiFi-event %d] ", event);
//     String eventname = "";

//     switch (event)
//     {
//     case ARDUINO_EVENT_WIFI_STA_CONNECTED:
//         eventname = "Connected to access point";
// #ifdef HAS_RGB_LED
//         // Briefly show progress
//         shortBlink(CRGB::Blue);
// #endif
//         break;
//     case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
//         // eventname = "Disconnected from WiFi access point";
// #ifdef HAS_RGB_LED
//         shortBlink(CRGB::Red);
//         // Fall back to AP yellow if AP is running, else blue
//         if ((WiFi.getMode() & WIFI_MODE_AP) != 0)
//             rgbIdleColor = CRGB::Yellow;
//         else
//             rgbIdleColor = CRGB::Blue;
// #endif
//         break;
//     case ARDUINO_EVENT_WIFI_STA_AUTHMODE_CHANGE:
//         eventname = "Authentication mode of access point has changed";
//         break;
//     case ARDUINO_EVENT_WIFI_STA_GOT_IP:
//         eventname = "Obtained IP address: " + String(WiFi.localIP().toString().c_str());
//         init_udp();
//         // Start web server when IP is ready (safe to call multiple times)
//         ensure_webserver_started();
// #ifdef HAS_RGB_LED
//         shortBlink(CRGB::Green);
//         rgbIdleColor = CRGB::Green;
// #endif
//         break;
//     case ARDUINO_EVENT_WIFI_STA_LOST_IP:
//         eventname = "Lost IP address and IP address is reset to 0";
//         break;

//     case ARDUINO_EVENT_WIFI_AP_START:
//         // eventname = "WiFi access point started";
//         // In AP mode, netif is up; ensure web server is started
//         ensure_webserver_started();
// #ifdef HAS_RGB_LED
//         rgbIdleColor = CRGB::Yellow;
//         shortBlink(CRGB::Yellow);
// #endif
//         break;
//     case ARDUINO_EVENT_WIFI_AP_STOP:
//         // eventname = "WiFi access point stopped";
//         break;
//     case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
//         apClients++;
//         // eventname = "Client connected";
//         break;
//     case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
//         apClients--;
//         // eventname = "Client disconnected";
//         break;
//     case ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED:
//         // eventname = "Assigned IP address to client";
//         break;

// #if defined(ETHERNET_PHY_POWER) && defined(ETHERNET_PHY_MDC) && defined(ETHERNET_PHY_MDIO) && defined(ETHERNET_PHY_TYPE) && defined(ETHERNET_CLK_MODE)

//     case ARDUINO_EVENT_ETH_START:
//         eventname = "ETH Started";
//         // set eth hostname here
//         ETH.setHostname(buildHostname(WIFI_IF_STA).c_str());
//         eth_timeout = 0;
//         break;
//     case ARDUINO_EVENT_ETH_CONNECTED:
//         eventname = "ETH Connected";
//         WiFi.mode(WIFI_MODE_NULL);
//         WiFi.disconnect();
//         eth_connected = true;
//         eth_timeout = millis();
//         // Start web server when ETH is connected
//         ensure_webserver_started();
//         break;
//     case ARDUINO_EVENT_ETH_GOT_IP:
//         if (ETH.fullDuplex())
//         {
//             eventname = "ETH MAC: " + ETH.macAddress() + ", IPv4: " + ETH.localIP().toString() + ", FULL_DUPLEX, " + ETH.linkSpeed() + "Mbps";
//         }
//         else
//         {
//             eventname = "ETH MAC: " + ETH.macAddress() + ", IPv4: " + ETH.localIP().toString() + ", " + ETH.linkSpeed() + "Mbps";
//         }
//         eth_ip_ok = true;
//         init_udp();
//         eth_timeout = 0;
//         ensure_webserver_started();
//         break;
//     case ARDUINO_EVENT_ETH_DISCONNECTED:
//         eventname = "ETH Disconnected";
//         eth_connected = false;
//         eth_ip_ok = false;
//         eth_timeout = 0;
//         break;
//     case ARDUINO_EVENT_ETH_STOP:
//         eventname = "ETH Stopped";
//         eth_connected = false;
//         eth_ip_ok = false;
//         eth_timeout = 0;
//         break;

// #endif

//     default:
//         break;
//     }
//     if (eventname)
//         terminalLog(eventname);
//     // logLine("WiFi event [" + String(event) + "]: " + eventname);
// }

// // *** Improv
// // https :  // github.com/jnthas/improv-wifi-demo

// #define STR_IMPL(x) #x
// #define STR(x) STR_IMPL(x)

// #ifndef BUILD_ENV_NAME
// #define BUILD_ENV_NAME unknown
// #endif
// #ifndef BUILD_TIME
// #define BUILD_TIME 0
// #endif
// #ifndef BUILD_VERSION
// #define BUILD_VERSION custom
// #endif

// std::vector<std::string> getLocalUrl()
// {
//     return {String("http://" + WiFi.localIP().toString()).c_str()};
// }

// void onErrorCallback(improv::Error err)
// {
// }

// bool onCommandCallback(improv::ImprovCommand cmd)
// {
//     switch (cmd.command)
//     {
//     case improv::Command::GET_CURRENT_STATE:
//     {
//         if ((WiFi.status() == WL_CONNECTED))
//         {
//             set_state(improv::State::STATE_PROVISIONED);
//             std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_CURRENT_STATE, getLocalUrl(), false);
//             send_response(data);
//         }
//         else
//         {
//             set_state(improv::State::STATE_AUTHORIZED);
//         }
//         break;
//     }

//     case improv::Command::WIFI_SETTINGS:
//     {
//         if (cmd.ssid.length() == 0)
//         {
//             set_error(improv::Error::ERROR_INVALID_RPC);
//             break;
//         }

//         set_state(improv::STATE_PROVISIONING);

//         ws.enable(false);
//         refreshAllPending();
//         saveDB("/current/tagDB.json");
//         ws.closeAll();
//         delay(100);
//         if (wm.connectToWifi(String(cmd.ssid.c_str()), String(cmd.password.c_str()), true))
//         {
//             if (contentFS)
//             {
//                 JsonDocument cfg;
//                 fs::File r = contentFS->open("/current/staconfig.json", "r");
//                 if (r)
//                 {
//                     deserializeJson(cfg, r);
//                     r.close();
//                 }
//                 cfg["ssid"] = cmd.ssid.c_str();
//                 cfg["password"] = cmd.password.c_str();
//                 xSemaphoreTake(fsMutex, portMAX_DELAY);
//                 fs::File w = contentFS->open("/current/staconfig.json", "w");
//                 if (w)
//                 {
//                     serializeJson(cfg, w);
//                     w.close();
//                 }
//                 xSemaphoreGive(fsMutex);
//             }
//             ws.enable(true);

//             set_state(improv::STATE_PROVISIONED);
//             std::vector<uint8_t> data = improv::build_rpc_response(improv::WIFI_SETTINGS, getLocalUrl(), false);
//             send_response(data);
//         }
//         else
//         {
//             set_state(improv::STATE_STOPPED);
//             set_error(improv::Error::ERROR_UNABLE_TO_CONNECT);
//         }

//         break;
//     }

//     case improv::Command::GET_DEVICE_INFO:
//     {
//         std::vector<std::string> infos = {
//             // Firmware name
//             "OpenEPaperLink",
//             // Firmware version
//             STR(BUILD_VERSION),
//             // Hardware chip/variant
//             STR(BUILD_ENV_NAME),
//             // Device name
//             "Access Point"};
//         std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_DEVICE_INFO, infos, false);
//         send_response(data);
//         break;
//     }

//     case improv::Command::GET_WIFI_NETWORKS:
//     {
//         getAvailableWifiNetworks();
//         break;
//     }

//     default:
//     {
//         set_error(improv::ERROR_UNKNOWN_RPC);
//         return false;
//     }
//     }

//     return true;
// }

// void getAvailableWifiNetworks()
// {
//     // Clear previous scan results
//     WiFi.scanDelete();

//     // Configure optimized scan parameters for ESP32-S3
//     wifi_scan_config_t scanConf;
//     memset(&scanConf, 0, sizeof(scanConf));
//     scanConf.ssid = NULL;
//     scanConf.bssid = NULL;
//     scanConf.channel = 0;
//     scanConf.show_hidden = true;
//     scanConf.scan_type = WIFI_SCAN_TYPE_ACTIVE;
//     scanConf.scan_time.active.min = 100; // Fast scan
//     scanConf.scan_time.active.max = 200;

//     // Start optimized scan with timeout protection
//     esp_err_t ret = esp_wifi_scan_start(&scanConf, true); // blocking scan for Improv
//     if (ret != ESP_OK)
//     {
//         if (wm.scanVerbose())
//             Serial.printf("ERROR: WiFi scan failed: %s\n", esp_err_to_name(ret));
//         // Send empty response on scan failure
//         std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
//         send_response(data);
//         return;
//     }

//     int networkNum = WiFi.scanComplete();
//     if (networkNum < 0)
//     {
//         // scanComplete returns negative on error
//         if (wm.scanVerbose())
//             Serial.printf("WiFi scan failed (scanComplete returned %d)\n", networkNum);
//         // Send final empty response to indicate scan completion/error
//         std::vector<uint8_t> finalDataErr = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
//         send_response(finalDataErr);
//         WiFi.scanDelete();
//         return;
//     }

//     if (wm.scanVerbose())
//         Serial.printf("WiFi scan completed: %d networks found\n", networkNum);

//     if (networkNum > 0)
//     {
//         // Create vector for sorting by signal strength with better memory management
//         std::vector<std::pair<int, int>> networks;
//         networks.reserve(std::min(networkNum, 30)); // Reserve memory to prevent reallocations

//         for (int i = 0; i < networkNum; i++)
//         {
//             String ssid = WiFi.SSID(i);
//             if (ssid.length() > 0 && ssid.length() <= 32)
//             { // Valid SSID length check
//                 networks.push_back(std::make_pair(i, WiFi.RSSI(i)));
//             }
//             else
//             {
//                 if (wm.scanVerbose())
//                     Serial.printf("Skipping network %d with invalid SSID (len=%d)\n", i, ssid.length());
//             }
//         }

//         // Sort by signal strength (strongest first)
//         std::sort(networks.begin(), networks.end(),
//                   [](const std::pair<int, int> &a, const std::pair<int, int> &b)
//                   {
//                       return a.second > b.second;
//                   });

//         // Send sorted results with memory-efficient processing
//         int maxNetworks = std::min((int)networks.size(), 30);
//         for (int idx = 0; idx < maxNetworks; idx++)
//         {
//             int id = networks[idx].first;

//             // Get network info with bounds checking
//             String ssid = WiFi.SSID(id);
//             int32_t rssi = WiFi.RSSI(id);
//             wifi_auth_mode_t authMode = WiFi.encryptionType(id);
//             int8_t channel = WiFi.channel(id);

//             if (ssid.length() == 0)
//             {
//                 if (wm.scanVerbose())
//                     Serial.printf("Skipping empty SSID at scan index %d\n", id);
//                 continue; // Skip invalid entries
//             }

//             const char *authStr = (authMode == WIFI_AUTH_OPEN) ? "OPEN" : "SECURED";
//             if (wm.scanVerbose())
//                 Serial.printf("Network: '%s' RSSI: %d Auth: %s Channel: %d\n", ssid.c_str(), rssi, authStr, channel);

//             // Build response efficiently (SSID, RSSI, Auth required)
//             std::vector<uint8_t> data = improv::build_rpc_response(
//                 improv::GET_WIFI_NETWORKS,
//                 {ssid, String(rssi), (authMode == WIFI_AUTH_OPEN ? "NO" : "YES")},
//                 false);
//             send_response(data);

//             // Small delay to prevent overwhelming the serial interface
//             vTaskDelay(pdMS_TO_TICKS(1));
//         }
//     }
//     else
//     {
//         if (wm.scanVerbose())
//             Serial.println("No WiFi networks found during scan");
//     }

//     // Send final empty response to indicate scan completion
//     std::vector<uint8_t> data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
//     send_response(data);

//     // Clean up scan results to free memory
//     WiFi.scanDelete();
// }

// void set_state(improv::State state)
// {
//     std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
//     data.resize(11);
//     data[6] = improv::IMPROV_SERIAL_VERSION;
//     data[7] = improv::TYPE_CURRENT_STATE;
//     data[8] = 1;
//     data[9] = state;

//     uint8_t checksum = 0x00;
//     for (uint8_t d : data)
//         checksum += d;
//     data[10] = checksum;

//     Serial.write(data.data(), data.size());
// }

// void send_response(std::vector<uint8_t> &response)
// {
//     std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
//     data.resize(9);
//     data[6] = improv::IMPROV_SERIAL_VERSION;
//     data[7] = improv::TYPE_RPC_RESPONSE;
//     data[8] = response.size();
//     data.insert(data.end(), response.begin(), response.end());

//     uint8_t checksum = 0x00;
//     for (uint8_t d : data)
//         checksum += d;
//     data.push_back(checksum);

//     Serial.write(data.data(), data.size());
// }

// void set_error(improv::Error error)
// {
//     std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
//     data.resize(11);
//     data[6] = improv::IMPROV_SERIAL_VERSION;
//     data[7] = improv::TYPE_ERROR_STATE;
//     data[8] = 1;
//     data[9] = error;

//     uint8_t checksum = 0x00;
//     for (uint8_t d : data)
//         checksum += d;
//     data[10] = checksum;

//     Serial.write(data.data(), data.size());
// }

// // **** improv ****

// namespace improv
// {

//     ImprovCommand parse_improv_data(const std::vector<uint8_t> &data, bool check_checksum)
//     {
//         return parse_improv_data(data.data(), data.size(), check_checksum);
//     }

//     ImprovCommand parse_improv_data(const uint8_t *data, size_t length, bool check_checksum)
//     {
//         ImprovCommand improv_command;
//         // basic length sanity
//         if (length < 2)
//         {
//             improv_command.command = UNKNOWN;
//             return improv_command;
//         }
//         Command command = (Command)data[0];
//         uint8_t data_length = data[1];

//         if (data_length != length - 2 - (check_checksum ? 1 : 0))
//         {
//             improv_command.command = UNKNOWN;
//             return improv_command;
//         }

//         if (check_checksum)
//         {
//             uint8_t checksum = data[length - 1];

//             uint32_t calculated_checksum = 0;
//             for (uint8_t i = 0; i < length - 1; i++)
//             {
//                 calculated_checksum += data[i];
//             }

//             if ((uint8_t)calculated_checksum != checksum)
//             {
//                 improv_command.command = BAD_CHECKSUM;
//                 return improv_command;
//             }
//         }

//         if (command == WIFI_SETTINGS)
//         {
//             if (data_length < 2)
//             { // at least ssid len + pass len
//                 improv_command.command = UNKNOWN;
//                 return improv_command;
//             }
//             uint8_t ssid_length = data[2];
//             size_t ssid_start = 3;
//             size_t ssid_end = ssid_start + ssid_length;
//             if (ssid_end >= length - (check_checksum ? 1 : 0))
//             {
//                 improv_command.command = UNKNOWN;
//                 return improv_command;
//             }
//             uint8_t pass_length = data[ssid_end];
//             size_t pass_start = ssid_end + 1;
//             size_t pass_end = pass_start + pass_length;
//             if (pass_end > length - (check_checksum ? 1 : 0))
//             {
//                 improv_command.command = UNKNOWN;
//                 return improv_command;
//             }
//             std::string ssid(reinterpret_cast<const char *>(data + ssid_start), ssid_length);
//             std::string password(reinterpret_cast<const char *>(data + pass_start), pass_length);
//             return {.command = command, .ssid = std::move(ssid), .password = std::move(password)};
//         }

//         improv_command.command = command;
//         return improv_command;
//     }

//     bool parse_improv_serial_byte(size_t position, uint8_t byte, const uint8_t *buffer,
//                                   std::function<bool(ImprovCommand)> &&callback, std::function<void(Error)> &&on_error)
//     {
//         if (position == 0)
//             return byte == 'I';
//         if (position == 1)
//             return byte == 'M';
//         if (position == 2)
//             return byte == 'P';
//         if (position == 3)
//             return byte == 'R';
//         if (position == 4)
//             return byte == 'O';
//         if (position == 5)
//             return byte == 'V';

//         if (position == 6)
//             return byte == IMPROV_SERIAL_VERSION;

//         if (position <= 8)
//             return true;

//         uint8_t type = buffer[7];
//         uint8_t data_len = buffer[8];

//         if (position <= 8 + data_len)
//             return true;

//         if (position == 8 + data_len + 1)
//         {
//             uint8_t checksum = 0x00;
//             for (size_t i = 0; i < position; i++)
//                 checksum += buffer[i];

//             if (checksum != byte)
//             {
//                 on_error(ERROR_INVALID_RPC);
//                 return false;
//             }

//             if (type == TYPE_RPC)
//             {
//                 auto command = parse_improv_data(&buffer[9], data_len, false);
//                 return callback(command);
//             }
//         }

//         return false;
//     }

//     std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string> &datum, bool add_checksum)
//     {
//         std::vector<uint8_t> out;
//         uint32_t length = 0;
//         out.push_back(command);
//         for (const auto &str : datum)
//         {
//             uint8_t len = str.length();
//             length += len + 1;
//             out.push_back(len);
//             out.insert(out.end(), str.begin(), str.end());
//         }
//         out.insert(out.begin() + 1, length);

//         if (add_checksum)
//         {
//             uint32_t calculated_checksum = 0;

//             for (uint8_t byte : out)
//             {
//                 calculated_checksum += byte;
//             }
//             out.push_back(calculated_checksum);
//         }
//         return out;
//     }

//     std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String> &datum, bool add_checksum)
//     {
//         std::vector<uint8_t> out;
//         uint32_t length = 0;
//         out.push_back(command);
//         for (const auto &str : datum)
//         {
//             uint8_t len = str.length();
//             length += len + 1; // include length byte like std::string variant
//             out.push_back(len);
//             out.insert(out.end(), str.begin(), str.end());
//         }
//         out.insert(out.begin() + 1, length);

//         if (add_checksum)
//         {
//             uint32_t calculated_checksum = 0;

//             for (uint8_t byte : out)
//             {
//                 calculated_checksum += byte;
//             }
//             out.push_back(calculated_checksum);
//         }
//         return out;
//     }

// } // namespace improv
// #endif // LEGACY WIFI MANAGER DISABLED
