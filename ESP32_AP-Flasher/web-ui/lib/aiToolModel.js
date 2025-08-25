// Utility to select AI tool model with environment precedence
// Order: OPEL_AI_TOOL_MODEL > first of OPEL_AI_TOOL_MODELS list > default fallback
module.exports = function selectAiToolModel(env = process.env) {
  const explicit = env.OPEL_AI_TOOL_MODEL && env.OPEL_AI_TOOL_MODEL.trim();
  if (explicit) return explicit;
  const list = env.OPEL_AI_TOOL_MODELS;
  if (list) {
    const parts = list.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[0];
  }
  return 'gpt-4.1-mini';
};
