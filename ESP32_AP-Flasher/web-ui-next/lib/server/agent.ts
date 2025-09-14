import crypto from 'crypto';
import { appendLog } from './logging';

export interface AgentActionResult { success: boolean; started?: boolean; data?: any; error?: string; }

type ActionFn = (config?: any) => Promise<AgentActionResult> | AgentActionResult;

class AgentActionRunner {
  private actions: Record<string, ActionFn> = {};
  constructor() {
    // built-in minimal actions
    this.actions['ping'] = async () => ({ success: true, data: { pong: true, ts: Date.now() } });
    this.actions['echo'] = async (cfg) => ({ success: true, data: { echo: cfg } });
  }
  listActions() { return Object.keys(this.actions).sort(); }
  register(name: string, fn: ActionFn) { this.actions[name] = fn; }
  async execute(name: string, opts: { config?: any }): Promise<AgentActionResult> {
    const fn = this.actions[name];
    if (!fn) return { success: false, error: 'unknown_action' };
    try { return await fn(opts.config); }
    catch (e: any) { return { success: false, error: e.message || String(e) }; }
  }
  kill(_processId: string) { return { success: false, error: 'no_long_running_processes' }; }
}

export const agentActionRunner = new AgentActionRunner();

export function createAgentAuth() {
  const token = process.env.AGENT_TOKEN || '';
  return function requireAgentAuth(req: any, res: any, next: () => void) {
    if (!process.env.ENABLE_AGENT_API || process.env.ENABLE_AGENT_API === 'false') return res.status(503).json({ success: false, error: 'agent_api_disabled' });
    if (!token) return res.status(503).json({ success: false, error: 'agent_token_not_set' });
    const provided = req.headers['x-agent-token'] || req.query.token || (req.body && req.body.token);
    if (provided !== token) return res.status(401).json({ success: false, error: 'unauthorized' });
    next();
  };
}

export function genAgentToken() { return crypto.randomBytes(16).toString('hex'); }

export function getAgentHealth() {
  return {
    enabled: !!process.env.ENABLE_AGENT_API && process.env.ENABLE_AGENT_API !== 'false',
    actions: agentActionRunner.listActions().length,
  };
}

// Placeholder AI agent provider switching
let currentProvider = 'default';
export function setProvider(p: string) { currentProvider = p; appendLog('agent', 'provider set ' + p); return true; }
export function getProvider() { return currentProvider; }
