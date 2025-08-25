// Routes for AI tool (Responses API) chat endpoint
const selectAiToolModel = require('../lib/aiToolModel');
module.exports = function registerAiToolRoutes(app, deps){
  const { ToolSchemas, ToolDispatcher, aiToolSessionStore, aiToolDispatcherRef, appendLog } = deps;
  app.get('/api/ai/tool-model', (req,res)=>{
    try { res.json({ success:true, model: selectAiToolModel(), explicit: !!process.env.OPEL_AI_TOOL_MODEL, list: process.env.OPEL_AI_TOOL_MODELS || null, mock: !process.env.OPENAI_API_KEY }); }
    catch(e){ res.status(500).json({ success:false, error:e.message }); }
  });
  app.post('/api/ai/chat-tool', async (req,res)=>{
    try {
      const { message, sessionId='default' } = req.body || {};
      if(!message) return res.status(400).json({ success:false, error:'message required' });
      if(!ToolSchemas || !ToolSchemas.toolSchemas) return res.status(503).json({ success:false, error:'tool schemas unavailable' });
      if(!aiToolDispatcherRef.current){
        aiToolDispatcherRef.current = ToolDispatcher ? ToolDispatcher.createDispatcher({ deviceManager: deps.deviceManager, serialManager: deps.serialManager, log: appendLog }) : null;
      }
      if(!process.env.OPENAI_API_KEY){
        return res.json({ success:true, mock:true, responseText:`[mock] You said: ${message}`, toolCalls:[], toolResults:[] });
      }
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const session = aiToolSessionStore.get(sessionId) || { inputList: [] };
      const inputList = session.inputList;
      inputList.push({ role:'user', content: message });
      const tools = ToolSchemas.toolSchemas;
      const model = selectAiToolModel();
      const basePayload = { model, tools, input: inputList };
      let response = await client.responses.create(basePayload);
      inputList.push(...response.output);
      const toolCalls = []; const toolResults = [];
      for (const item of response.output){
        if (item.type === 'function_call'){
          let argsParsed={}; try { argsParsed = JSON.parse(item.arguments||'{}'); } catch(_){}
          toolCalls.push({ name:item.name, call_id:item.call_id, arguments: argsParsed });
          if(aiToolDispatcherRef.current){
            const result = await aiToolDispatcherRef.current.dispatch(item.name, argsParsed);
            const outObj = { type:'function_call_output', call_id:item.call_id, output: JSON.stringify(result) };
            inputList.push(outObj);
            toolResults.push({ call_id:item.call_id, result });
          }
        }
      }
      if (toolResults.length){
        response = await client.responses.create({ model, tools, input: inputList, instructions:'Incorporate tool results. If errors, explain next step. Be concise.' });
        inputList.push(...response.output);
      }
      aiToolSessionStore.set(sessionId, { inputList });
      res.json({ success:true, responseText: response.output_text, toolCalls, toolResults, model });
    } catch(e){ appendLog('ai-tools','error '+(e.message||e)); res.status(500).json({ success:false, error:e.message||String(e) }); }
  });
};
