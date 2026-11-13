import app from '../server/index.js';

// Vercel rewrites /api/<route> to this function and passes the captured route
// in the `path` query parameter. Restore the Express route before dispatching.
export default function handler(req, res) {
  const path = typeof req.query?.path === 'string' ? req.query.path : '';
  if (path) req.url = `/api/${path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  else if (req.url === '/api' || req.url.startsWith('/api?')) req.url = req.url.replace(/^\/api/, '/api/health');
  return app(req, res);
}
