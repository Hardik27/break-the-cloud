// Cloudflare Worker in front of the static site. It runs only for /api/* (see wrangler.jsonc);
// every other request is served straight from the built files in dist/.
//   GET /api/geo → {"country":"IN"}: the visitor's country as Cloudflare sees it, for anonymous
//   learning statistics ("learners from N countries"). The IP address is never returned or stored.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/geo') {
      const country = request.cf && typeof request.cf.country === 'string' ? request.cf.country : null;
      return new Response(JSON.stringify({ country }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
