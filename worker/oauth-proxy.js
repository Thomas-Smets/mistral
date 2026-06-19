// Cloudflare Worker: GitHub OAuth callback + token exchange
// Deploy: npx wrangler deploy
// Set secret: npx wrangler secret put GITHUB_CLIENT_SECRET

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Refresh an expired access token using the refresh token. GitHub App user
    // tokens expire (~8h); the client posts its refresh_token here and gets a
    // fresh bundle, so publishing doesn't require re-authorizing each session.
    if (url.pathname === "/refresh" && request.method === "POST") {
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      };
      const body = await request.json().catch(() => ({}));
      if (!body.refresh_token) {
        return new Response(
          JSON.stringify({ error: "missing_refresh_token" }),
          {
            status: 400,
            headers: cors,
          },
        );
      }
      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: body.refresh_token,
        }),
      });
      const data = await resp.json();
      return new Response(JSON.stringify(data), { headers: cors });
    }

    // GitHub redirects here after user authorizes
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }
      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await resp.json();
      // Return an HTML page that sends the token back to the opener and closes
      const html = `<!DOCTYPE html><html><body><script>
        window.opener.postMessage(${JSON.stringify(data)}, "*");
        window.close();
      </script><p>Authorized. This window will close.</p></body></html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
