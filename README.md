# Cloudflare Workers 订阅转换器

这是一个可以部署到 Cloudflare Workers 的轻量级订阅转换服务，用来把常见代理订阅转换成不同客户端可直接使用的格式，并提供一个在线转换页面。

目前已经支持：

- 输入协议：`vmess`、`vless`、`trojan`、`shadowsocks (ss)`、`socks5`、`http/https`、`tuic`、`hysteria2 (hy2)`
- 输出目标：`clash`、`v2rayn`、`singbox`

## 功能特性

- 支持通过远程订阅 URL 拉取并转换
- 支持直接粘贴原始订阅内容进行转换
- 支持在线网页操作
- 支持通过 HTTP API 调用
- 自动跳过暂不支持的节点协议

## 在线页面

部署完成后，直接访问 Worker 根路径：

```text
https://your-worker.example.workers.dev/
```

页面支持：

- 输入远程订阅地址
- 粘贴 Base64 订阅内容或逐行节点 URI
- 选择输出格式
- 一键复制转换结果

## API 用法

### 1. 通过 GET 转换远程订阅

```bash
curl "https://your-worker.example.workers.dev/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub"
```

### 2. 通过 POST 提交原始订阅内容

```bash
curl "https://your-worker.example.workers.dev/convert?target=singbox" ^
  -H "Content-Type: text/plain" ^
  --data-binary "@subscription.txt"
```

### 3. 通过 POST JSON 调用

```bash
curl "https://your-worker.example.workers.dev/convert" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"clash\",\"url\":\"https://example.com/sub\"}"
```

### 4. 健康检查

```bash
curl "https://your-worker.example.workers.dev/health"
```

## 本地开发与测试

### 1. 安装依赖

```bash
npm install
```

### 2. 启动本地开发环境

```bash
npm run dev
```

Wrangler 默认会输出一个本地访问地址，通常类似：

```text
http://127.0.0.1:8787
```

### 3. 在浏览器里测试在线页面

打开：

```text
http://127.0.0.1:8787/
```

### 4. 用 curl 测试转换接口

测试远程订阅：

```bash
curl "http://127.0.0.1:8787/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub"
```

测试本地原始订阅内容：

```bash
curl "http://127.0.0.1:8787/convert?target=v2rayn" ^
  -H "Content-Type: text/plain" ^
  --data-binary "@subscription.txt"
```

### 5. 运行测试

```bash
npm test
```

如果当前环境限制了 `node --test` 的子进程能力，可能会出现权限错误。这种情况下，可以先通过 `npm run dev` 启动本地服务，再结合浏览器和 `curl` 手动验证功能。

## 部署到 Cloudflare Workers

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 执行部署

```bash
npm run deploy
```

如果你想修改 Worker 名称，可以编辑 `wrangler.toml` 中的 `name` 字段。

## 项目结构

- `src/index.js`：Worker 入口、在线页面、路由处理
- `src/converter.js`：订阅解析与格式转换逻辑
- `test/converter.test.js`：基础测试
- `wrangler.toml`：Cloudflare Workers 配置

## 已支持的转换说明

### 输出为 Clash

返回 Clash 可用的 YAML 配置，包含：

- `proxies`
- `proxy-groups`
- 基础 `rules`

### 输出为 v2rayN

返回 Base64 编码后的节点订阅内容，适合直接作为 v2rayN 订阅结果使用。

### 输出为 sing-box

返回 sing-box 可用的 JSON 配置，包含基础的：

- `dns`
- `outbounds`
- `route`

## 已知限制

- 当前输入主要面向 URI 订阅，不包含完整的 Clash YAML 反向解析
- 某些特殊插件参数暂未对所有目标格式做完全一一映射
- 遇到不支持的协议时，服务会自动跳过，并在响应头中返回跳过数量

## 仓库地址

GitHub：

[`https://github.com/lvqopl/subconverter`](https://github.com/lvqopl/subconverter)
