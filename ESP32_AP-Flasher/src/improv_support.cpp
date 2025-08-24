#include "improv_support.h"
#include "serial_cli.h" // lightweight developer CLI
#include <WiFi.h>
#include <algorithm>
#include <ArduinoJson.h>
#include "storage.h"
#include "module_manager.h"
#include "wifi_module.h"
#include <esp_wifi.h>

// Local state
static uint8_t improv_buffer[128];
static size_t improv_pos = 0;
static bool scanVerboseFlag = false;

// Helpers to access WiFiModule instance
static WiFiModule *getWiFiModule()
{
  auto *m = ModuleManager::getInstance().getModuleInstance("WiFiModule");
  return static_cast<WiFiModule *>(m);
}

// Forward declarations of handlers
static bool improv_on_command(improv::ImprovCommand cmd);
static void improv_on_error(improv::Error err);
static std::vector<std::string> improv_getLocalUrl();
static void improv_getAvailableWifiNetworks();

void improv_set_scan_verbose(bool v) { scanVerboseFlag = v; }
bool improv_scan_verbose() { return scanVerboseFlag; }

void improv_poll()
{
  while (Serial.available() > 0)
  {
    uint8_t c = Serial.read();
    bool matched = improv::parse_improv_serial_byte(improv_pos, c, improv_buffer, improv_on_command, improv_on_error);
    if (matched)
    {
      improv_buffer[improv_pos++] = c;
      if (improv_pos >= sizeof(improv_buffer))
        improv_pos = 0; // safety wrap
      continue;         // byte consumed by improv
    }

    // Mismatch: previously buffered bytes were a false start; feed them to CLI if printable
    if (improv_pos > 0)
    {
      for (size_t i = 0; i < improv_pos; ++i)
      {
        char pc = (char)improv_buffer[i];
        if (pc == '\r' || pc == '\n' || (pc >= 32 && pc < 127))
          serial_cli_feed_char(pc);
      }
    }
    // Feed current mismatching char as well (if printable)
    if (c == '\r' || c == '\n' || (c >= 32 && c < 127) || c == 0x08 || c == 0x7f)
      serial_cli_feed_char((char)c);
    improv_pos = 0; // reset improv state
  }
}

void improv_set_state(improv::State state)
{
  std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
  data.resize(11);
  data[6] = improv::IMPROV_SERIAL_VERSION;
  data[7] = improv::TYPE_CURRENT_STATE;
  data[8] = 1;
  data[9] = state;
  uint8_t checksum = 0;
  for (uint8_t b : data)
    checksum += b;
  data[10] = checksum;
  Serial.write(data.data(), data.size());
}

void improv_send_response(std::vector<uint8_t> &response)
{
  std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
  data.resize(9);
  data[6] = improv::IMPROV_SERIAL_VERSION;
  data[7] = improv::TYPE_RPC_RESPONSE;
  data[8] = response.size();
  data.insert(data.end(), response.begin(), response.end());
  uint8_t checksum = 0;
  for (uint8_t b : data)
    checksum += b;
  data.push_back(checksum);
  Serial.write(data.data(), data.size());
}

void improv_set_error(improv::Error error)
{
  std::vector<uint8_t> data = {'I', 'M', 'P', 'R', 'O', 'V'};
  data.resize(11);
  data[6] = improv::IMPROV_SERIAL_VERSION;
  data[7] = improv::TYPE_ERROR_STATE;
  data[8] = 1;
  data[9] = error;
  uint8_t checksum = 0;
  for (uint8_t b : data)
    checksum += b;
  data[10] = checksum;
  Serial.write(data.data(), data.size());
}

// Command handling ----------------------------------------------------
static bool improv_on_command(improv::ImprovCommand cmd)
{
  using namespace improv;
  switch (cmd.command)
  {
  case Command::GET_CURRENT_STATE:
  {
    if (WiFi.status() == WL_CONNECTED)
    {
      improv_set_state(State::STATE_PROVISIONED);
      auto data = improv::build_rpc_response(GET_CURRENT_STATE, improv_getLocalUrl(), false);
      improv_send_response(data);
    }
    else
    {
      improv_set_state(State::STATE_AUTHORIZED);
    }
    break;
  }
  case Command::WIFI_SETTINGS:
  {
    if (cmd.ssid.empty())
    {
      improv_set_error(Error::ERROR_INVALID_RPC);
      break;
    }
    improv_set_state(State::STATE_PROVISIONING);
    // Persist credentials to staconfig.json (append/replace primary)
    if (contentFS)
    {
      JsonDocument cfg;
      {
        File r = contentFS->open("/current/staconfig.json", "r");
        if (r)
        {
          deserializeJson(cfg, r);
          r.close();
        }
      }
      cfg["ssid"] = cmd.ssid.c_str();
      cfg["password"] = cmd.password.c_str();
      // also create minimal networks array for WiFiMulti future use
      JsonArray nets = cfg["networks"].to<JsonArray>();
      bool exists = false;
      for (JsonObject n : nets)
        if (n["ssid"].is<String>() && n["ssid"].as<String>() == cmd.ssid.c_str())
        {
          n["password"] = cmd.password.c_str();
          exists = true;
          break;
        }
      if (!exists)
      {
        JsonObject n = nets.add<JsonObject>();
        n["ssid"] = cmd.ssid.c_str();
        n["password"] = cmd.password.c_str();
      }
      xSemaphoreTake(fsMutex, portMAX_DELAY);
      File w = contentFS->open("/current/staconfig.json", "w");
      if (w)
      {
        serializeJson(cfg, w);
        w.close();
      }
      xSemaphoreGive(fsMutex);
    }
    // Trigger WiFiModule to restart/connect using new creds
    auto *wm = getWiFiModule();
    if (wm)
    {
      wm->stop();
      wm->start();
    }
    if (WiFi.status() == WL_CONNECTED)
    {
      improv_set_state(State::STATE_PROVISIONED);
      auto data = improv::build_rpc_response(WIFI_SETTINGS, improv_getLocalUrl(), false);
      improv_send_response(data);
    }
    else
    {
      improv_set_state(State::STATE_STOPPED);
      improv_set_error(Error::ERROR_UNABLE_TO_CONNECT);
    }
    break;
  }
  case Command::GET_DEVICE_INFO:
  {
    std::vector<std::string> info = {"OpenEPaperLink", "custom", "ESP32", "Access Point"};
    auto data = improv::build_rpc_response(GET_DEVICE_INFO, info, false);
    improv_send_response(data);
    break;
  }
  case Command::GET_WIFI_NETWORKS:
  {
    improv_getAvailableWifiNetworks();
    break;
  }
  default:
  {
    improv_set_error(Error::ERROR_UNKNOWN_RPC);
    return false;
  }
  }
  return true;
}

static void improv_on_error(improv::Error) {}

static std::vector<std::string> improv_getLocalUrl()
{
  return {String("http://" + WiFi.localIP().toString()).c_str()};
}

static void improv_getAvailableWifiNetworks()
{
  WiFi.scanDelete();
  wifi_scan_config_t conf{};
  conf.show_hidden = true;
  conf.scan_type = WIFI_SCAN_TYPE_ACTIVE;
  conf.scan_time.active.min = 100;
  conf.scan_time.active.max = 200;
  conf.channel = 0;
  esp_err_t ret = esp_wifi_scan_start(&conf, true); // blocking
  if (ret != ESP_OK)
  {
    auto data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
    improv_send_response(data);
    return;
  }
  int count = WiFi.scanComplete();
  if (count <= 0)
  {
    auto data = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
    improv_send_response(data);
    WiFi.scanDelete();
    return;
  }
  struct Net
  {
    int idx;
    int rssi;
  };
  std::vector<Net> nets;
  nets.reserve(std::min(count, 30));
  for (int i = 0; i < count; i++)
  {
    String ss = WiFi.SSID(i);
    if (ss.length() > 0 && ss.length() <= 32)
      nets.push_back({i, WiFi.RSSI(i)});
  }
  std::sort(nets.begin(), nets.end(), [](const Net &a, const Net &b)
            { return a.rssi > b.rssi; });
  int limit = std::min((int)nets.size(), 30);
  for (int i = 0; i < limit; i++)
  {
    int id = nets[i].idx;
    String ss = WiFi.SSID(id);
    int32_t r = WiFi.RSSI(id);
    wifi_auth_mode_t auth = WiFi.encryptionType(id);
    int8_t ch = WiFi.channel(id);
    (void)ch;
    auto resp = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, {ss, String(r), (auth == WIFI_AUTH_OPEN ? "NO" : "YES")}, false);
    improv_send_response(resp);
    vTaskDelay(pdMS_TO_TICKS(1));
  }
  // final empty to mark end
  auto finalResp = improv::build_rpc_response(improv::GET_WIFI_NETWORKS, std::vector<std::string>{}, false);
  improv_send_response(finalResp);
  WiFi.scanDelete();
}

// ------------------ Improv protocol implementation (parsers) -----------------
namespace improv
{

  ImprovCommand parse_improv_data(const std::vector<uint8_t> &data, bool check_checksum)
  {
    return parse_improv_data(data.data(), data.size(), check_checksum);
  }

  ImprovCommand parse_improv_data(const uint8_t *data, size_t length, bool check_checksum)
  {
    ImprovCommand ic;
    if (length < 2)
    {
      ic.command = UNKNOWN;
      return ic;
    }
    Command cmd = (Command)data[0];
    uint8_t data_len = data[1];
    if (data_len != length - 2 - (check_checksum ? 1 : 0))
    {
      ic.command = UNKNOWN;
      return ic;
    }
    if (check_checksum)
    {
      uint8_t checksum = data[length - 1];
      uint32_t calc = 0;
      for (size_t i = 0; i < length - 1; i++)
        calc += data[i];
      if ((uint8_t)calc != checksum)
      {
        ic.command = BAD_CHECKSUM;
        return ic;
      }
    }
    if (cmd == WIFI_SETTINGS)
    {
      if (data_len < 2)
      {
        ic.command = UNKNOWN;
        return ic;
      }
      uint8_t ssid_len = data[2];
      size_t ssid_start = 3;
      size_t ssid_end = ssid_start + ssid_len;
      if (ssid_end >= length - (check_checksum ? 1 : 0))
      {
        ic.command = UNKNOWN;
        return ic;
      }
      uint8_t pass_len = data[ssid_end];
      size_t pass_start = ssid_end + 1;
      size_t pass_end = pass_start + pass_len;
      if (pass_end > length - (check_checksum ? 1 : 0))
      {
        ic.command = UNKNOWN;
        return ic;
      }
      ic.ssid.assign(reinterpret_cast<const char *>(data + ssid_start), ssid_len);
      ic.password.assign(reinterpret_cast<const char *>(data + pass_start), pass_len);
    }
    ic.command = cmd;
    return ic;
  }

  bool parse_improv_serial_byte(size_t position, uint8_t byte, const uint8_t *buffer,
                                std::function<bool(ImprovCommand)> &&callback,
                                std::function<void(Error)> &&on_error)
  {
    if (position == 0)
      return byte == 'I';
    if (position == 1)
      return byte == 'M';
    if (position == 2)
      return byte == 'P';
    if (position == 3)
      return byte == 'R';
    if (position == 4)
      return byte == 'O';
    if (position == 5)
      return byte == 'V';
    if (position == 6)
      return byte == IMPROV_SERIAL_VERSION; // version
    if (position <= 8)
      return true; // type + length bytes
    uint8_t type = buffer[7];
    uint8_t len = buffer[8];
    if (position <= 8 + len)
      return true;
    if (position == 8 + len + 1)
    {
      uint8_t checksum = 0;
      for (size_t i = 0; i < position; i++)
        checksum += buffer[i];
      if (checksum != byte)
      {
        on_error(ERROR_INVALID_RPC);
        return false;
      }
      if (type == TYPE_RPC)
      {
        auto command = parse_improv_data(&buffer[9], len, false);
        return callback(command);
      }
    }
    return false;
  }

  std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string> &datum, bool add_checksum)
  {
    std::vector<uint8_t> out;
    uint32_t length = 0;
    out.push_back(command);
    for (auto &s : datum)
    {
      uint8_t l = s.length();
      length += l + 1;
      out.push_back(l);
      out.insert(out.end(), s.begin(), s.end());
    }
    out.insert(out.begin() + 1, length);
    if (add_checksum)
    {
      uint32_t calc = 0;
      for (uint8_t b : out)
        calc += b;
      out.push_back(calc);
    }
    return out;
  }
  std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String> &datum, bool add_checksum)
  {
    std::vector<uint8_t> out;
    uint32_t length = 0;
    out.push_back(command);
    for (auto &s : datum)
    {
      uint8_t l = s.length();
      length += l + 1;
      out.push_back(l);
      out.insert(out.end(), s.begin(), s.end());
    }
    out.insert(out.begin() + 1, length);
    if (add_checksum)
    {
      uint32_t calc = 0;
      for (uint8_t b : out)
        calc += b;
      out.push_back(calc);
    }
    return out;
  }

} // namespace improv
