export default {
  async fetch(request, env) {
    return env.UPSTREAM.fetch(request);
  }
};
