import { convertSubscription } from './converter.js';
import { createSharedResult, getSharedResult, purgeExpiredResults } from './storage.js';

const TEMPLATE_PRESETS = [
  { id: 'none', label: 'No extra Clash template', url: '' },
  { id: 'acl4ssr-full', label: 'ACL4SSR Online Full', url: 'https://raw.githubusercontent.com/cmliu/ACL4SSR/refs/heads/main/Clash/config/ACL4SSR_Online_Full.ini' }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

function getTemplateOptionsMarkup() {
  return TEMPLATE_PRESETS.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
}

function resolveTemplateUrl(templatePreset, customTemplateUrl) {
  if (templatePreset && templatePreset !== 'custom' && templatePreset !== 'none') {
    return TEMPLATE_PRESETS.find((preset) => preset.id === templatePreset)?.url || '';
  }
  return (customTemplateUrl || '').trim();
}

function shareUrlFor(requestUrl, id) {
  const url = new URL(requestUrl);
  url.pathname = `/share/${id}`;
  url.search = '';
  return url.toString();
}

function buildResponse(result, target, templateUrl) {
  return new Response(result.body, {
    status: 200,
    headers: {
      'content-type': result.contentType,
      'cache-control': 'no-store',
      'x-subconverter-target': String(target || 'clash').toLowerCase(),
      'x-subconverter-node-count': String(result.meta?.count || 0),
      'x-subconverter-skipped-count': String(result.meta?.skipped || 0),
      'x-clash-config-url': templateUrl || '',
      'x-clash-template-merged': result.meta?.templateMerged ? 'true' : 'false'
    }
  });
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Subscription Converter</title>
    <style>
      :root { color-scheme: light; --panel: rgba(255, 252, 246, 0.92); --ink: #1b1a17; --muted: #645f56; --line: rgba(27, 26, 23, 0.12); --accent: #0e7a6d; --accent-2: #cb5c32; --shadow: 0 24px 80px rgba(75, 57, 37, 0.15); }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, rgba(203, 92, 50, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(14, 122, 109, 0.18), transparent 30%), linear-gradient(135deg, #f8f3ea 0%, #efe5d8 100%); min-height: 100vh; }
      .shell { max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
      .hero { display: grid; gap: 20px; margin-bottom: 24px; }
      .eyebrow { display: inline-block; padding: 6px 12px; border-radius: 999px; background: rgba(14, 122, 109, 0.1); color: var(--accent); font-size: 13px; letter-spacing: 0.08em; }
      h1 { margin: 8px 0 0; font-size: clamp(34px, 8vw, 64px); line-height: 0.96; }
      .lead { max-width: 780px; color: var(--muted); font-size: 16px; line-height: 1.7; }
      .grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; box-shadow: var(--shadow); backdrop-filter: blur(10px); }
      .form, .result { padding: 24px; }
      .stack { display: grid; gap: 16px; }
      label { display: grid; gap: 8px; font-weight: 600; }
      .hint { color: var(--muted); font-size: 13px; font-weight: 400; }
      input, select, textarea, button { font: inherit; }
      input, select, textarea { width: 100%; border: 1px solid rgba(27, 26, 23, 0.14); border-radius: 16px; padding: 14px 16px; background: rgba(255, 255, 255, 0.8); color: var(--ink); }
      textarea { min-height: 220px; resize: vertical; }
      .row { display: grid; grid-template-columns: 1fr 180px; gap: 14px; }
      .row3 { display: grid; grid-template-columns: 1fr 180px 220px; gap: 14px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; }
      button { border: 0; border-radius: 999px; padding: 13px 20px; cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease; }
      button:hover { transform: translateY(-1px); }
      button:disabled { opacity: 0.6; cursor: wait; transform: none; }
      .primary { background: var(--ink); color: #fff; }
      .secondary { background: rgba(14, 122, 109, 0.12); color: var(--accent); }
      .result { display: grid; gap: 14px; }
      pre { margin: 0; padding: 18px; min-height: 420px; overflow: auto; border-radius: 20px; background: #171614; color: #f6f1e8; line-height: 1.5; }
      .meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
      .pill { padding: 8px 12px; border-radius: 999px; background: rgba(27, 26, 23, 0.06); }
      .status { min-height: 24px; color: var(--accent-2); font-size: 14px; }
      .share-box { border: 1px dashed rgba(27, 26, 23, 0.18); padding: 14px; border-radius: 18px; background: rgba(255,255,255,0.55); }
      .share-link { word-break: break-all; color: var(--accent); font-size: 14px; }
      @media (max-width: 980px) { .grid, .row, .row3 { grid-template-columns: 1fr; } pre { min-height: 300px; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">Cloudflare Workers + D1</div>
        <h1>Subscription Converter</h1>
        <div class="lead">Convert remote subscription URLs or raw node content into Clash, v2rayN, sing-box, Loon, or Quantumult X. Clash output can merge ACL4SSR-style ini templates into real proxy groups and rules, and you can create an expiring share link stored in D1.</div>
      </section>
      <section class="grid">
        <form class="card form" id="converter-form">
          <div class="stack">
            <div class="row">
              <label>
                Subscription URL
                <span class="hint">Use a remote subscription URL, or leave it empty and paste raw content below.</span>
                <input id="source-url" type="url" placeholder="https://example.com/sub">
              </label>
              <label>
                Target format
                <span class="hint">Choose the output client format.</span>
                <select id="target">
                  <option value="clash">Clash</option>
                  <option value="v2rayn">v2rayN</option>
                  <option value="singbox">sing-box</option>
                  <option value="loon">Loon</option>
                  <option value="qx">Quantumult X</option>
                </select>
              </label>
            </div>
            <div class="row3">
              <label>
                Clash template preset
                <span class="hint">Used when the target is Clash.</span>
                <select id="template-preset">
                  ${getTemplateOptionsMarkup()}
                  <option value="custom">Custom URL</option>
                </select>
              </label>
              <label>
                Share link TTL
                <span class="hint">How long the stored link stays valid.</span>
                <select id="ttl-seconds">
                  <option value="1800">30 minutes</option>
                  <option value="3600" selected>1 hour</option>
                  <option value="21600">6 hours</option>
                  <option value="86400">1 day</option>
                  <option value="604800">7 days</option>
                </select>
              </label>
              <label>
                Custom template URL
                <span class="hint">Leave empty unless preset is Custom.</span>
                <input id="custom-template-url" type="url" placeholder="https://example.com/custom.ini">
              </label>
            </div>
            <label>
              Raw subscription content
              <span class="hint">Paste a Base64 subscription or one node URI per line.</span>
              <textarea id="subscription" placeholder="vmess://...&#10;vless://...&#10;trojan://..."></textarea>
            </label>
            <div class="actions">
              <button class="primary" id="submit-btn" type="submit">Convert</button>
              <button class="secondary" id="copy-btn" type="button">Copy result</button>
              <button class="secondary" id="share-btn" type="button">Create share link</button>
              <button class="secondary" id="copy-share-btn" type="button">Copy share link</button>
            </div>
            <div class="status" id="status"></div>
            <div class="share-box">
              <div class="hint">Expiring share link</div>
              <div class="share-link" id="share-link"></div>
            </div>
          </div>
        </form>
        <section class="card result">
          <div class="meta">
            <div class="pill" id="meta-target">Target: clash</div>
            <div class="pill" id="meta-count">Nodes: 0</div>
            <div class="pill" id="meta-skipped">Skipped: 0</div>
          </div>
          <pre id="result"></pre>
        </section>
      </section>
    </main>
    <script>
      const form = document.getElementById('converter-form');
      const submitBtn = document.getElementById('submit-btn');
      const copyBtn = document.getElementById('copy-btn');
      const shareBtn = document.getElementById('share-btn');
      const copyShareBtn = document.getElementById('copy-share-btn');
      const statusEl = document.getElementById('status');
      const resultEl = document.getElementById('result');
      const shareLinkEl = document.getElementById('share-link');
      const sourceUrlEl = document.getElementById('source-url');
      const subscriptionEl = document.getElementById('subscription');
      const targetEl = document.getElementById('target');
      const templatePresetEl = document.getElementById('template-preset');
      const customTemplateUrlEl = document.getElementById('custom-template-url');
      const ttlSecondsEl = document.getElementById('ttl-seconds');
      const metaTarget = document.getElementById('meta-target');
      const metaCount = document.getElementById('meta-count');
      const metaSkipped = document.getElementById('meta-skipped');
      function setStatus(message) { statusEl.textContent = message || ''; }
      function getPayload() {
        return {
          url: sourceUrlEl.value.trim(),
          subscription: subscriptionEl.value,
          target: targetEl.value,
          templatePreset: templatePresetEl.value,
          customTemplateUrl: customTemplateUrlEl.value.trim(),
          ttlSeconds: ttlSecondsEl.value
        };
      }
      async function copyResult() {
        if (!resultEl.textContent) { setStatus('No result to copy yet.'); return; }
        await navigator.clipboard.writeText(resultEl.textContent);
        setStatus('Result copied to clipboard.');
      }
      async function copyShareLink() {
        if (!shareLinkEl.textContent) { setStatus('No share link has been created yet.'); return; }
        await navigator.clipboard.writeText(shareLinkEl.textContent);
        setStatus('Share link copied to clipboard.');
      }
      async function convert(event) {
        event.preventDefault();
        submitBtn.disabled = true;
        setStatus('Converting...');
        resultEl.textContent = '';
        try {
          const response = await fetch('/convert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(getPayload()) });
          const text = await response.text();
          if (!response.ok) throw new Error(text);
          resultEl.textContent = text;
          metaTarget.textContent = 'Target: ' + targetEl.value;
          metaCount.textContent = 'Nodes: ' + (response.headers.get('x-subconverter-node-count') || '0');
          metaSkipped.textContent = 'Skipped: ' + (response.headers.get('x-subconverter-skipped-count') || '0');
          setStatus(response.headers.get('x-clash-template-merged') === 'true' ? 'Conversion completed with ini template merge.' : 'Conversion completed.');
        } catch (error) {
          setStatus('Conversion failed. Check the URL or raw subscription content.');
          resultEl.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          submitBtn.disabled = false;
        }
      }
      async function createShareLink() {
        shareBtn.disabled = true;
        setStatus('Creating share link...');
        try {
          const response = await fetch('/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(getPayload()) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Unable to create share link.');
          shareLinkEl.textContent = data.url;
          if (data.content) resultEl.textContent = data.content;
          metaTarget.textContent = 'Target: ' + data.target;
          metaCount.textContent = 'Nodes: ' + data.nodeCount;
          metaSkipped.textContent = 'Skipped: ' + data.skippedCount;
          setStatus('Share link created. Expires at ' + data.expiresAt);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        } finally {
          shareBtn.disabled = false;
        }
      }
      form.addEventListener('submit', convert);
      copyBtn.addEventListener('click', copyResult);
      shareBtn.addEventListener('click', createShareLink);
      copyShareBtn.addEventListener('click', copyShareLink);
    </script>
  </body>
</html>`;
}

async function loadInput(request, url) {
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await request.json();
      return {
        subscription: payload.subscription || '',
        sourceUrl: payload.url || payload.sourceUrl || '',
        target: payload.target || url.searchParams.get('target') || 'clash',
        templatePreset: payload.templatePreset || url.searchParams.get('templatePreset') || 'none',
        customTemplateUrl: payload.customTemplateUrl || url.searchParams.get('config') || url.searchParams.get('templateUrl') || '',
        ttlSeconds: payload.ttlSeconds || url.searchParams.get('ttlSeconds') || '3600'
      };
    }
    const text = await request.text();
    return {
      subscription: text,
      sourceUrl: url.searchParams.get('url') || '',
      target: url.searchParams.get('target') || 'clash',
      templatePreset: url.searchParams.get('templatePreset') || 'none',
      customTemplateUrl: url.searchParams.get('config') || url.searchParams.get('templateUrl') || '',
      ttlSeconds: url.searchParams.get('ttlSeconds') || '3600'
    };
  }
  return {
    subscription: url.searchParams.get('subscription') || '',
    sourceUrl: url.searchParams.get('url') || '',
    target: url.searchParams.get('target') || 'clash',
    templatePreset: url.searchParams.get('templatePreset') || 'none',
    customTemplateUrl: url.searchParams.get('config') || url.searchParams.get('templateUrl') || '',
    ttlSeconds: url.searchParams.get('ttlSeconds') || '3600'
  };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'cf-sub-converter-worker/1.0' } });
  if (!response.ok) throw new Error(`Upstream request failed with status ${response.status}: ${url}`);
  return response.text();
}

async function runConversion(inputData) {
  const input = inputData.subscription || (inputData.sourceUrl ? await fetchText(inputData.sourceUrl) : '');
  if (!input.trim()) throw new Error('Missing subscription content. Provide ?url=... or POST a subscription payload.');
  const templateUrl = resolveTemplateUrl(inputData.templatePreset, inputData.customTemplateUrl);
  const normalizedTarget = String(inputData.target || 'clash').toLowerCase();
  let templateText = '';
  if (normalizedTarget === 'clash' && templateUrl) {
    templateText = await fetchText(templateUrl);
  }
  const result = await convertSubscription(input, normalizedTarget, { templateUrl, templateText, fetchText });
  return { target: normalizedTarget, templateUrl, ttlSeconds: inputData.ttlSeconds, result };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return html(renderPage());
    if (url.pathname === '/health') return json({ ok: true, now: new Date().toISOString() });

    if (url.pathname === '/share' && request.method === 'POST') {
      try {
        const inputData = await loadInput(request, url);
        const payload = await runConversion(inputData);
        await purgeExpiredResults(env).catch(() => {});
        const shared = await createSharedResult(env, { target: payload.target, content: payload.result.body, contentType: payload.result.contentType, templateUrl: payload.templateUrl, ttlSeconds: payload.ttlSeconds });
        return json({ ok: true, id: shared.id, url: shareUrlFor(request.url, shared.id), expiresAt: shared.expiresAt, target: payload.target, nodeCount: payload.result.meta?.count || 0, skippedCount: payload.result.meta?.skipped || 0, templateUrl: payload.templateUrl, content: payload.result.body });
      } catch (error) {
        return json({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' }, 500);
      }
    }

    if (url.pathname.startsWith('/share/') && request.method === 'GET') {
      const id = url.pathname.slice('/share/'.length).trim();
      try {
        const shared = await getSharedResult(env, id);
        if (!shared) return json({ ok: false, message: 'Share link not found.' }, 404);
        if (shared.expired) return json({ ok: false, message: 'Share link expired.' }, 410);
        return new Response(shared.content, { status: 200, headers: { 'content-type': shared.content_type, 'cache-control': 'no-store', 'x-subconverter-target': shared.target, 'x-clash-config-url': shared.template_url || '', 'x-share-expires-at': shared.expires_at } });
      } catch (error) {
        return json({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' }, 500);
      }
    }

    if (url.pathname !== '/convert') return json({ ok: false, message: 'Use /convert, /share, /share/:id, or open / for the web UI.' }, 404);

    try {
      const inputData = await loadInput(request, url);
      const payload = await runConversion(inputData);
      return buildResponse(payload.result, payload.target, payload.templateUrl);
    } catch (error) {
      return json({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' }, 500);
    }
  }
};
