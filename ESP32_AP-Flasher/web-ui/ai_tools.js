// AI Tool Schemas for OpenEPaperLink OutdoorAP project
// Strict JSON-schema function tools exposed to OpenAI Responses API
// Keep descriptions concise (token economy) yet explicit (accuracy)

const TOOL_VERSION = 1; // increment if schema changes to invalidate cached prompt

// Utility: build shared enums / patterns
const ENVIRONMENTS = ["OutdoorAP"]; // extend if more envs added
const BAUD_ENUM = [115200, 921600];

// NOTE: All parameters objects use additionalProperties:false and require all fields (strict mode)
// Optional semantic fields are modeled as nullable (type includes 'null').
const toolSchemas = [
  {
    type: 'function',
    name: 'build_firmware',
    description: 'Compile firmware for an environment. Use fast=true only when user hints speed/turbo. Use clean=true only after repeated build failures or explicit request.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        environment: { type: 'string', enum: ENVIRONMENTS, description: 'PlatformIO environment id.' },
        fast: { type: 'boolean', description: 'true => use fast_compile.py path; false => plain pio run.' },
        clean: { type: 'boolean', description: 'true => perform clean build (expensive).' }
      },
      required: ['environment','fast','clean'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'flash_firmware',
    description: 'Flash previously built firmware to a serial port. Do NOT call before successful build unless user explicitly wants to flash anyway.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        environment: { type: 'string', enum: ENVIRONMENTS },
        port: { type: 'string', description: 'Serial port name e.g. COM10' },
        baud: { type: 'integer', enum: BAUD_ENUM, description: 'Upload baud rate.' },
        monitor: { type: 'boolean', description: 'Open serial monitor after flash (best-effort).' }
      },
      required: ['environment','port','baud','monitor'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'upload_filesystem',
    description: 'Upload only filesystem image (LittleFS). Skip firmware flashing.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        environment: { type: 'string', enum: ENVIRONMENTS },
        port: { type: 'string' },
        baud: { type: 'integer', enum: BAUD_ENUM },
        skipBuild: { type: 'boolean', description: 'If true, assumes image already built.' }
      },
      required: ['environment','port','baud','skipBuild'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'list_serial_ports',
    description: 'Enumerate available serial ports. Call BEFORE choosing a port if user did not specify one.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        refresh: { type: 'boolean', description: 'Ignored; always fresh list.' }
      },
      required: ['refresh'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'optimize_www_assets',
    description: 'Run web asset optimization (minify/gzip). Use only when user requests optimization or preparing release.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        minify: { type: 'boolean' },
        gzip: { type: 'boolean' }
      },
      required: ['minify','gzip'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'query_device_status',
    description: 'Get WiFi/device status for a device id or host/IP. If identifier absent in saved devices treat as host.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Device id, host or IP.' },
        detail: { type: 'string', enum: ['summary','full'], description: 'full => include raw aggregated payload.' }
      },
      required: ['identifier','detail'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'run_emulation',
    description: 'Start QEMU emulation for environment. Only call when user explicitly wants emulation.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        environment: { type: 'string', enum: ENVIRONMENTS },
        headless: { type: 'boolean', description: 'true => no GUI if supported.' }
      },
      required: ['environment','headless'],
      additionalProperties: false
    }
  }
];

module.exports = { toolSchemas, TOOL_VERSION };
