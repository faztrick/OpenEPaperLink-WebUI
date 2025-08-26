// Embedded Agent Stub
// This header declares a minimal interface for an on-device automation/command
// agent that can later coordinate with the host-side AI agent. Implementation
// can live in a new embedded_agent.cpp (not yet created) once behaviors are defined.
//
// Goals:
//  - Provide a consistent command dispatch entry point (serial / websocket / UDP)
//  - Allow safe querying of system state (heap, wifi status, task list)
//  - Support a small allow-list of maintenance actions (reboot, wifi reset, log flush)
//
// Security Principles:
//  1. Explicit allow-list of commands.
//  2. No raw eval or dynamic memory code injection.
//  3. Bounded output size per command to avoid flooding transports.
//
#pragma once

#include <Arduino.h>

namespace EmbeddedAgent {

struct CommandResult {
    String output;      // Human readable single or multi-line reply
    bool   success;     // True if command executed without internal error
    int    code;        // 0 success, non-zero for specific error classes
};

// Initialize internal resources (call early in setup after logging/WiFi init)
void begin();

// Periodic tasks (call from loop). Should be lightweight (<= 1ms typical).
void update();

// Execute a command. Input should be a single line without newline terminator.
// Recognized baseline commands (initial proposal):
//  help, ping, heap, tasks, wifi_status, reboot, uptime
// Future expansions negotiated with host; unknown commands return code=2.
CommandResult execute(const String &cmdLine);

// Optional: provide a compact JSON status snapshot (fits < 512 bytes)
String jsonStatus();

} // namespace EmbeddedAgent
