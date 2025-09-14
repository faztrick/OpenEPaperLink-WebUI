import { appendLog } from './logging';

export interface AiChatResponse { success: boolean; responseText: string; toolCalls: any[]; toolResults: any[]; model: string; mock?: boolean; }

export function selectAiToolModel(): string {
  if (process.env.OPEL_AI_TOOL_MODEL) return process.env.OPEL_AI_TOOL_MODEL;
  const list = (process.env.OPEL_AI_TOOL_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length) return list[0];
  return 'gpt-4o-mini';
}

// cache the constructed OpenAI client between calls so we only attempt dynamic import once
let _openAiClient: any | null | undefined; // undefined = not attempted, null = unavailable, object = client

export async function performAiChat(message: string): Promise<AiChatResponse> {
  const model = selectAiToolModel();
  if (!process.env.ENABLE_AI_TOOL_API || process.env.ENABLE_AI_TOOL_API === 'false') {
    return { success: false, responseText: 'AI tool API disabled', toolCalls: [], toolResults: [], model };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { success: true, mock: true, responseText: `[mock] You said: ${message}`, toolCalls: [], toolResults: [], model };
  }
  // Late / opaque dynamic import so the bundler does NOT try to resolve 'openai' at build time.
  // Using new Function prevents static analysis. This keeps the dependency truly optional.
  if (_openAiClient === undefined) {
    try {
      const dynImport = new Function('m', 'return import(m)');
      const mod: any = await (dynImport as any)('openai');
      _openAiClient = new mod.OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } catch (e: any) {
      appendLog('ai', 'openai module unavailable: ' + (e?.message || e));
      _openAiClient = null;
    }
  }
  if (_openAiClient === null) {
    return { success: true, mock: true, responseText: `[mock-no-openai] ${message}`, toolCalls: [], toolResults: [], model };
  }
  const openai = _openAiClient;
  try {
    if (openai.responses) {
      const resp = await openai.responses.create({ model, input: [{ role: 'user', content: message }] });
      const text = resp.output_text || message;
      return { success: true, responseText: text, toolCalls: [], toolResults: [], model };
    }
    const completion = await openai.chat.completions.create({ model, messages: [{ role: 'user', content: message }] });
    const text = completion.choices?.[0]?.message?.content || message;
    return { success: true, responseText: text, toolCalls: [], toolResults: [], model };
  } catch (e: any) {
    appendLog('ai', 'api error ' + (e.message || e));
    return { success: false, responseText: 'AI error: ' + (e.message || e), toolCalls: [], toolResults: [], model };
  }
}
