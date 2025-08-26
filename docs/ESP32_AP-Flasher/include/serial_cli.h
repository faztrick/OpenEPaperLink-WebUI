// Lightweight developer serial CLI
// Provides simple ASCII line-based commands without interfering with
// the existing Improv provisioning protocol. Any bytes that do not
// form a valid Improv frame are fed into this CLI.
//
// Commands:
//   help    - list commands
//   sysinfo - basic heap / WiFi / uptime info
//   tasks   - number of FreeRTOS tasks (and optionally names if enabled)
//   reboot  - reboot the MCU
//
// Usage: type command then Enter (\r or \n). A '>' prompt is shown after boot
// and after each completed command. Unknown commands produce an error message.

#pragma once

#include <Arduino.h>

void serial_cli_init();
void serial_cli_feed_char(char c); // feed one character (printable or control) into CLI
void serial_cli_print_prompt();     // print the '>' prompt (exposed so setup() can call)
