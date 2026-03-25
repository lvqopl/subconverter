# Cloudflare Workers 订阅转换器

一个可以部署到 Cloudflare Workers 的轻量级订阅转换服务，用来把常见代理订阅转换成不同客户端可用的格式。

目前支持的输入节点协议：

- `vmess`
- `vless`
- `trojan`
- `ss`
- `socks5`
- `http/https`

目前支持的输出目标：

- `clash`
- `v2rayn`
- `singbox`

## 接口说明

### 1. GET 远程订阅转换

```bash
curl "https://your-worker.example.workers.dev/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub"
```

### 2. POST 原始订阅内容

```bash
curl "https://your-worker.example.workers.dev/convert?target=singbox" \
  -H "Content-Type: text/plain" \
  --data-binary @subscription.txt
```

### 3. POST JSON

```bash
curl "https://your-worker.example.workers.dev/convert" \
  -H "Content-Type: application/json" \
  -d "{\"target\":\"clash\",\"url\":\"https://example.com/sub\"}"
```

### 4. 健康检查

```bash
curl "https://your-worker.example.workers.dev/health"
```

## 本地开发

```bash
npm install
npm test
npm run dev
```

## 部署到 Cloudflare Workers

1. 登录 Cloudflare:

```bash
npx wrangler login
```

2. 部署:

```bash
npm run deploy
```

如果需要修改 Worker 名称，可以编辑 `wrangler.toml` 里的 `name`。

## 代码结构

- `src/index.js`: Worker 入口和 HTTP 路由
- `src/converter.js`: 订阅解析与转换逻辑
- `test/converter.test.js`: 基础测试

## 已知限制

- 目前没有实现完整的 Clash YAML 反向解析，输入侧主要面向 v2ray/vless/trojan/ss 这类 URI 订阅。
- 少数特殊插件参数不会完整映射到所有目标格式。
- 如果订阅里含有不支持的协议，服务会自动跳过，并在响应头里给出跳过数量。
