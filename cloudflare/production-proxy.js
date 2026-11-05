export default {
  async fetch(request, env) {
    const upstreamUrl = new URL(request.url);
    upstreamUrl.hostname = "openpos-cloudflare-staging.b4u2store.workers.dev";
    return env.UPSTREAM.fetch(new Request(upstreamUrl, request));
  }
};
