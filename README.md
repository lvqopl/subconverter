# Cloudflare Workers 订阅转换器

这是一个可以部署到 Cloudflare Workers 的订阅转换服务，用来把常见代理订阅转换成不同客户端可直接使用的格式，并提供在线转换页面、可过期分享链接、ACL4SSR 这类 ini 模板规则合并能力。

## 当前支持

- 输入协议：`vmess`、`vless`、`trojan`、`shadowsocks (ss)`、`socks5`、`http/https`、`tuic`、`hysteria2 (hy2)`
- 输出目标：`clash`、`v2rayn`、`singbox`、`loon`、`qx (Quantumult X)`
- 通过 D1 存储分享链接并设置过期时间
- Clash 可选择 ACL4SSR 模板预设或自定义 ini 模板 URL

## 在线页面

部署后访问：

```text
https://your-worker.example.workers.dev/
```

页面支持：

- 输入远程订阅地址
- 粘贴原始订阅内容
- 选择目标输出格式
- 选择 Clash 模板预设或自定义模板 URL
- 生成带过期时间的分享链接
- 一键复制转换结果或分享链接

## ACL4SSR ini 规则合并

当目标格式是 `clash` 且提供 ini 模板 URL 时，Worker 会真正抓取并解析 ini 模板，而不是只保存一个链接。

当前已经实现：

- 解析 `ruleset=`
- 解析 `custom_proxy_group=`
- 抓取模板引用的规则列表 URL
- 生成 Clash 的 `proxy-groups` 和 `rules`
- 将节点按 ACL4SSR 风格的正则和分组规则合并进结果

内置模板预设包含：

- `ACL4SSR Online Full`

对应地址：

[`https://raw.githubusercontent.com/cmliu/ACL4SSR/refs/heads/main/Clash/config/ACL4SSR_Online_Full.ini`](https://raw.githubusercontent.com/cmliu/ACL4SSR/refs/heads/main/Clash/config/ACL4SSR_Online_Full.ini)

## API

### 1. 转换订阅

```bash
curl "https://your-worker.example.workers.dev/convert?target=clash&url=https%3A%2F%2Fexample.com%2Fsub&templatePreset=acl4ssr-full"
```

使用自定义模板：

```bash
curl "https://your-worker.example.workers.dev/convert" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"clash\",\"url\":\"https://example.com/sub\",\"customTemplateUrl\":\"https://example.com/custom.ini\",\"templatePreset\":\"custom\"}"
```

### 2. 生成分享链接

```bash
curl "https://your-worker.example.workers.dev/share" ^
  -H "Content-Type: application/json" ^
  -d "{\"target\":\"clash\",\"url\":\"https://example.com/sub\",\"ttlSeconds\":3600,\"templatePreset\":\"acl4ssr-full\"}"
```

返回示例：

```json
{
  "ok": true,
  "id": "abcd1234efgh5678",
  "url": "https://your-worker.example.workers.dev/share/abcd1234efgh5678",
  "expiresAt": "2026-03-25T08:00:00.000Z"
}
```

### 3. 访问分享链接

```bash
curl "https://your-worker.example.workers.dev/share/abcd1234efgh5678"
```

如果链接已过期，会返回 `410`。

### 4. 健康检查

```bash
curl "https://your-worker.example.workers.dev/health"
```

## D1 数据库初始化

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create subconverter-db
```

创建后，把返回的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "subconverter-db"
database_id = "replace-with-your-d1-database-id"
```

### 2. 执行建表 SQL

本地：

```bash
npx wrangler d1 execute subconverter-db --local --file=./migrations/0001_shared_results.sql
```

远程：

```bash
npx wrangler d1 execute subconverter-db --remote --file=./migrations/0001_shared_results.sql
```

## 本地开发与测试

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化本地 D1

```bash
npx wrangler d1 execute subconverter-db --local --file=./migrations/0001_shared_results.sql
```

### 3. 启动本地开发环境

```bash
npm run dev
```

通常会得到本地地址：

```text
http://127.0.0.1:8787
```

### 4. 在浏览器中测试页面

打开：

```text
http://127.0.0.1:8787/
```

### 5. 测试分享链接

先通过页面点击 `Create share link`，或者调用 `/share` 接口，然后访问返回的 `/share/:id` 地址。

### 6. 运行测试

```bash
npm test
```

如果当前环境限制了 `node --test` 的子进程能力，可能会出现权限错误。这种情况下，可以先通过 `npm run dev` 启动本地服务，再结合浏览器和 `curl` 手动验证功能。

## 项目结构

- `src/index.js`：Worker 路由、在线页面、分享链接接口
- `src/converter.js`：订阅解析、格式转换、ACL4SSR ini 合并
- `src/storage.js`：D1 存储逻辑
- `migrations/0001_shared_results.sql`：D1 建表 SQL
- `test/converter.test.js`：基础测试
- `wrangler.toml`：Workers 与 D1 绑定配置

## 已知限制

- ACL4SSR ini 合并当前重点支持 `ruleset` 和 `custom_proxy_group` 这类常见规则生成逻辑
- 未完整解析所有第三方 ini 扩展语法
- 输入主要面向 URI 订阅，不包含完整的 Clash YAML 反向解析
- 某些特殊插件参数暂未对所有目标格式做完全一一映射

## 仓库地址

[`https://github.com/lvqopl/subconverter`](https://github.com/lvqopl/subconverter)
