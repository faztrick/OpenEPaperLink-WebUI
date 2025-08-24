// Centralized logging utilities for the development server.
// Provides appendLog (with timestamp), tailLines, and an EventEmitter "logEmitter" for streaming.
// Environment variables:
//   LOG_DIR  (optional) override default logs directory (defaults to ./logs relative to this file)

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logsDir = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logEmitter = new EventEmitter();

function appendLog(name, msg) {
    try {
        const file = path.join(logsDir, `${name}.log`);
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(file, line, { encoding: 'utf8' });
        logEmitter.emit(name, line);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('appendLog error', err);
    }
}

function tailLines(name, lines = 200) {
    try {
        const file = path.join(logsDir, `${name}.log`);
        if (!fs.existsSync(file)) return '';
        const content = fs.readFileSync(file, 'utf8');
        const all = content.split(/\r?\n/).filter(Boolean);
        return all.slice(-lines).join('\n');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('tailLines error', err);
        return '';
    }
}

module.exports = { appendLog, tailLines, logEmitter, logsDir };
