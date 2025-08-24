#pragma once
// Improv serial provisioning support (extracted from legacy WifiManager)
// Provides a lightweight serial protocol to configure WiFi credentials
// without entering AP web interface. Integrates with WiFiModule.

#include <Arduino.h>
#include <functional>
#include <vector>
#include <string>

namespace improv
{
  enum Command : uint8_t
  {
    GET_CURRENT_STATE = 0x01,
    WIFI_SETTINGS = 0x02,
    GET_DEVICE_INFO = 0x03,
    GET_WIFI_NETWORKS = 0x04,
    BAD_CHECKSUM = 0xFF,
    UNKNOWN = 0xFE
  };

  enum State : uint8_t
  {
    STATE_STOPPED = 0x00,
    STATE_AWAITING_AUTH = 0x01,
    STATE_AUTHORIZED = 0x02,
    STATE_PROVISIONING = 0x03,
    STATE_PROVISIONED = 0x04
  };

  enum Error : uint8_t
  {
    ERROR_NONE = 0x00,
    ERROR_INVALID_RPC = 0x01,
    ERROR_UNABLE_TO_CONNECT = 0x02,
    ERROR_UNKNOWN_RPC = 0x03
  };

  struct ImprovCommand
  {
    Command command = UNKNOWN;
    std::string ssid;
    std::string password;
  };

  static const uint8_t IMPROV_SERIAL_VERSION = 1;
  static const uint8_t TYPE_RPC = 0x01;          // incoming
  static const uint8_t TYPE_RPC_RESPONSE = 0x02; // outgoing
  static const uint8_t TYPE_CURRENT_STATE = 0x03;
  static const uint8_t TYPE_ERROR_STATE = 0x04;

  ImprovCommand parse_improv_data(const uint8_t *data, size_t length, bool check_checksum);
  ImprovCommand parse_improv_data(const std::vector<uint8_t> &data, bool check_checksum);
  bool parse_improv_serial_byte(size_t position, uint8_t byte, const uint8_t *buffer,
                                std::function<bool(ImprovCommand)> &&callback,
                                std::function<void(Error)> &&on_error);
  std::vector<uint8_t> build_rpc_response(Command command, const std::vector<std::string> &datum, bool add_checksum);
  std::vector<uint8_t> build_rpc_response(Command command, const std::vector<String> &datum, bool add_checksum);
}

// Public API of improv support layer
void improv_poll(); // poll serial for improv packets (call from loop/task)
void improv_set_state(improv::State state);
void improv_set_error(improv::Error err);
void improv_send_response(std::vector<uint8_t> &response);

// Optional: enable/disable verbose scan logging reused from old implementation
void improv_set_scan_verbose(bool v);
bool improv_scan_verbose();
