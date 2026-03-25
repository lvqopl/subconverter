import { convertSubscription } from "./converter.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

async function loadInput(request, url) {
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await request.json();
      return {
        subscription: payload.subscription || "",
        sourceUrl: payload.url || payload.sourceUrl || "",
        target: payload.target || url.searchParams.get("target") || "clash"
      };
    }

    const text = await request.text();
    return {
      subscription: text,
      sourceUrl: url.searchParams.get("url") || "",
      target: url.searchParams.get("target") || "clash"
    };
  }

  return {
    subscription: url.searchParams.get("subscription") || "",
    sourceUrl: url.searchParams.get("url") || "",
    target: url.searchParams.get("target") || "clash"
  };
}

async function fetchSubscription(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "cf-sub-converter-worker/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Upstream subscription request failed with status ${response.status}.`);
  }

  return response.text();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname !== "/" && url.pathname !== "/convert") {
      return json(
        {
          ok: false,
          message: "Use /convert?target=clash|v2rayn|singbox&url=https://example.com/sub or POST the subscription body."
        },
        404
      );
    }

    try {
      const { subscription, sourceUrl, target } = await loadInput(request, url);
      const input = subscription || (sourceUrl ? await fetchSubscription(sourceUrl) : "");

      if (!input.trim()) {
        return json(
          {
            ok: false,
            message: "Missing subscription content. Provide ?url=... or POST a subscription payload."
          },
          400
        );
      }

      const result = convertSubscription(input, String(target || "clash").toLowerCase());
      return new Response(result.body, {
        status: 200,
        headers: {
          "content-type": result.contentType,
          "cache-control": "no-store",
          "x-subconverter-target": String(target || "clash").toLowerCase(),
          "x-subconverter-node-count": String(result.meta?.count || 0),
          "x-subconverter-skipped-count": String(result.meta?.skipped || 0)
        }
      });
    } catch (error) {
      return json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Unknown error"
        },
        500
      );
    }
  }
};
