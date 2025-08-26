// Factory to build agent auth middleware with injected dependencies
module.exports = function createAgentAuth({ agentActionRunner, token }){
  return function requireAgentAuth(req, res, next){
    if (!agentActionRunner) return res.status(501).json({ success:false, error:'agent runner disabled' });
    if (!token) return res.status(503).json({ success:false, error:'agent token not configured' });
    const header = req.headers['x-agent-token'] || req.headers['authorization'] || '';
    const queryTok = req.query.token;
    let provided = '';
    if (header.startsWith('Bearer ')) provided = header.substring(7).trim();
    else if (header && !header.toLowerCase().startsWith('bearer')) provided = header.toString();
    if (!provided && queryTok) provided = String(queryTok);
    if (provided !== token) return res.status(403).json({ success:false, error:'forbidden' });
    next();
  };
};
