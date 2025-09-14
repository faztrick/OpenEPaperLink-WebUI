// Domain re-export layer for AI features.
// Keeps API routes importing from a stable domain path instead of server implementation file.
// This allows future swapping (e.g. multiple providers, adapters) without touching route handlers.
export { performAiChat, selectAiToolModel, type AiChatResponse } from '../../server/aiTools';
