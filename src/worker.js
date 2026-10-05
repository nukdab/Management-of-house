export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test-db") {
      const result = await env.DB
        .prepare("SELECT 1 AS connected")
        .first();

      return Response.json({
        success: true,
        database: result?.connected === 1
      });
    }

    return env.ASSETS.fetch(request);
  }
};
