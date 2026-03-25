# Cloudflare Workers Subscription Converter

A lightweight subscription conversion service for Cloudflare Workers. It can convert common proxy subscriptions into formats that Clash, v2rayN, and sing-box can consume, and it includes a built-in web UI.

## Supported input protocols

- `vmess`
- `vless`
- `trojan`
- `shadowsocks (ss)`
- `socks5`
- `http/https`
- `tuic`
- `hysteria2 (hy2)`

## Supported output targets

- `clash`
- `v2rayn`
- `singbox`

## Web UI

After deployment, open the Worker root path:

```text
https://your-worker.example.workers.dev/
```

The page supports:

- converting a remote subscription URL
- pasting raw subscription content
- choosing Clash, v2rayN, or sing-box output
- copying the converted result with one click

## API

### GET remote subscription

```bash
curl "https://your-worker.example.workers.dev/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub"
```

### POST raw subscription content

```bash
curl "https://your-worker.example.workers.dev/convert?target=singbox" ^
  -H "Content-Type: text/plain" ^
  --data-binary "@subscription.txt"
```

### POST JSON

```bash
curl "https://your-worker.example.workers.dev/convert" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"clash\",\"url\":\"https://example.com/sub\"}"
```

### Health check

```bash
curl "https://your-worker.example.workers.dev/health"
```

## Local testing

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local Worker

```bash
npm run dev
```

Wrangler usually prints a local address similar to:

```text
http://127.0.0.1:8787
```

### 3. Test the web page

Open:

```text
http://127.0.0.1:8787/
```

### 4. Test the API with curl

```bash
curl "http://127.0.0.1:8787/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub"
```

Or post local subscription content:

```bash
curl "http://127.0.0.1:8787/convert?target=v2rayn" ^
  -H "Content-Type: text/plain" ^
  --data-binary "@subscription.txt"
```

### 5. Run tests

```bash
npm test
```

If your environment restricts `node --test` child process execution, you may see a permission error. In that case, run the local Worker and validate the page plus the API manually with a browser and curl.

## Deploy to Cloudflare Workers

1. Login to Cloudflare:

```bash
npx wrangler login
```

2. Deploy:

```bash
npm run deploy
```

If you want a different Worker name, edit `name` in `wrangler.toml`.

## Project structure

- `src/index.js`: Worker entry, web UI, and routes
- `src/converter.js`: subscription parsing and conversion logic
- `test/converter.test.js`: basic tests

## Known limitations

- Input currently focuses on URI subscriptions and does not implement full Clash YAML reverse parsing.
- Some advanced plugin-specific parameters are not mapped one-to-one across every target format.
- Unsupported protocols are skipped automatically, and the response headers include the skipped count.
