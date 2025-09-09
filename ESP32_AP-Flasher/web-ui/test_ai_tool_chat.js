#!/usr/bin/env node
/*
 Simple test harness for the AI Tool Chat endpoint.
 Usage:
   node test_ai_tool_chat.js "your message here" [sessionId]

 If OPENAI_API_KEY is NOT set, server should reply with mock response.
 This script assumes the server is already running on PORT (default 3000).
*/

const http = require('http');

function postJSON(host, port, path, body) {
  const data = JSON.stringify(body);
  const opts = {
    hostname: host,
    port,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d.toString());
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, text: buf, parseError: e.message }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const message = process.argv[2] || 'list serial ports';
  const sessionId = process.argv[3] || 'harness';
  const port = process.env.PORT || 3000;
  try {
    const resp = await postJSON('127.0.0.1', port, '/api/ai/chat-tool', { message, sessionId });
    console.log('Status:', resp.status);
    console.log('Response:', JSON.stringify(resp.json || resp, null, 2));
    if (!resp.json?.success) process.exitCode = 2;
  } catch (e) {
    console.error('Request failed:', e.message);
    process.exitCode = 1;
  }
})();
