const DEFAULT_CLASH_GROUPS = [
  { name: "Proxy", type: "select", proxies: ["Auto", "DIRECT"] },
  { name: "Auto", type: "url-test", proxies: [], url: "https://www.gstatic.com/generate_204", interval: 300 }
];

export function decodeBase64Loose(value) {
  if (!value) {
    return "";
  }

  let normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) {
    normalized += "=".repeat(4 - padding);
  }

  try {
    return atob(normalized);
  } catch {
    return "";
  }
}

function encodeBase64(value) {
  return btoa(value);
}

function ensureName(value, fallback) {
  return value && value.trim() ? value.trim() : fallback;
}

function parseQuery(queryString) {
  const params = new URLSearchParams(queryString || "");
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function safeDecode(value) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitNodeLines(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  const base64Decoded = decodeBase64Loose(trimmed);
  const text = isLikelyNodeList(base64Decoded) ? base64Decoded : trimmed;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isLikelyNodeList(value) {
  if (!value) {
    return false;
  }
  return /^(vmess|vless|trojan|ss|socks|http):\/\//m.test(value);
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) ? port : 0;
}

function parseBool(value) {
  return value === "1" || value === "true";
}

function baseNode(type, server, port, name) {
  return {
    type,
    name,
    server,
    port
  };
}

function parseVmess(uri, index) {
  const payload = uri.slice("vmess://".length);
  const decoded = decodeBase64Loose(payload);
  if (!decoded) {
    return null;
  }

  let json;
  try {
    json = JSON.parse(decoded);
  } catch {
    return null;
  }

  const tlsEnabled = ["tls", "xtls"].includes(String(json.tls || "").toLowerCase());
  const wsEnabled = String(json.net || "").toLowerCase() === "ws";
  const grpcEnabled = String(json.net || "").toLowerCase() === "grpc";
  const httpEnabled = ["http", "h2"].includes(String(json.net || "").toLowerCase());

  return {
    ...baseNode("vmess", json.add, parsePort(json.port), ensureName(json.ps, `vmess-${index}`)),
    uuid: json.id,
    alterId: parsePort(json.aid || "0"),
    cipher: json.scy || "auto",
    udp: true,
    tls: tlsEnabled,
    skipCertVerify: false,
    servername: json.sni || "",
    network: (json.net || "tcp").toLowerCase(),
    wsPath: json.path || "",
    wsHost: json.host || "",
    httpHost: json.host || "",
    httpPath: json.path || "",
    grpcServiceName: json.path || "",
    fingerprint: json.fp || "",
    clientFingerprint: json.fp || "",
    wsEnabled,
    grpcEnabled,
    httpEnabled
  };
}

function parseVless(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);
  const security = (params.security || "").toLowerCase();
  const type = (params.type || "tcp").toLowerCase();

  return {
    ...baseNode("vless", url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `vless-${index}`)),
    uuid: url.username,
    udp: true,
    tls: ["tls", "reality"].includes(security),
    skipCertVerify: parseBool(params.allowInsecure),
    servername: params.sni || params.host || "",
    network: type,
    flow: params.flow || "",
    wsPath: params.path ? safeDecode(params.path) : "",
    wsHost: params.host || "",
    grpcServiceName: params.serviceName || "",
    fingerprint: params.fp || "",
    clientFingerprint: params.fp || "",
    reality: security === "reality",
    publicKey: params.pbk || "",
    shortId: params.sid || "",
    spiderX: params.spx || ""
  };
}

function parseTrojan(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);
  const type = (params.type || "tcp").toLowerCase();

  return {
    ...baseNode("trojan", url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `trojan-${index}`)),
    password: url.username,
    udp: true,
    tls: true,
    skipCertVerify: parseBool(params.allowInsecure),
    servername: params.sni || params.peer || "",
    network: type,
    wsPath: params.path ? safeDecode(params.path) : "",
    wsHost: params.host || "",
    grpcServiceName: params.serviceName || "",
    fingerprint: params.fp || "",
    clientFingerprint: params.fp || ""
  };
}

function parseSs(uri, index) {
  const raw = uri.slice("ss://".length);
  const hashIndex = raw.indexOf("#");
  const suffix = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
  const main = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = main.indexOf("?");
  const query = queryIndex >= 0 ? main.slice(queryIndex + 1) : "";
  const target = queryIndex >= 0 ? main.slice(0, queryIndex) : main;
  const params = parseQuery(query);

  let authAndServer = target;
  if (!target.includes("@")) {
    authAndServer = decodeBase64Loose(target);
  }
  const atIndex = authAndServer.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }

  const credentials = authAndServer.slice(0, atIndex);
  const serverPort = authAndServer.slice(atIndex + 1);
  const [cipher, password] = credentials.split(":");
  const hostIndex = serverPort.lastIndexOf(":");
  if (hostIndex < 0) {
    return null;
  }

  return {
    ...baseNode("ss", serverPort.slice(0, hostIndex), parsePort(serverPort.slice(hostIndex + 1)), ensureName(safeDecode(suffix), `ss-${index}`)),
    cipher,
    password,
    udp: true,
    plugin: params.plugin || ""
  };
}

function parseSocks(uri, index) {
  const url = new URL(uri);
  return {
    ...baseNode("socks5", url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `socks-${index}`)),
    username: safeDecode(url.username),
    password: safeDecode(url.password),
    udp: true
  };
}

function parseHttp(uri, index) {
  const url = new URL(uri);
  return {
    ...baseNode("http", url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `http-${index}`)),
    username: safeDecode(url.username),
    password: safeDecode(url.password),
    tls: url.protocol === "https:"
  };
}

export function parseSubscription(input) {
  const lines = splitNodeLines(input);
  const nodes = [];
  const skipped = [];

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    let parsed = null;

    try {
      if (lower.startsWith("vmess://")) {
        parsed = parseVmess(line, index + 1);
      } else if (lower.startsWith("vless://")) {
        parsed = parseVless(line, index + 1);
      } else if (lower.startsWith("trojan://")) {
        parsed = parseTrojan(line, index + 1);
      } else if (lower.startsWith("ss://")) {
        parsed = parseSs(line, index + 1);
      } else if (lower.startsWith("socks://") || lower.startsWith("socks5://")) {
        parsed = parseSocks(line, index + 1);
      } else if (lower.startsWith("http://") || lower.startsWith("https://")) {
        parsed = parseHttp(line, index + 1);
      }
    } catch {
      parsed = null;
    }

    if (parsed) {
      nodes.push(parsed);
    } else {
      skipped.push(line);
    }
  });

  return { nodes, skipped };
}

function encodeNodeName(name) {
  return encodeURIComponent(name || "");
}

function renderVmessUri(node) {
  const payload = {
    v: "2",
    ps: node.name,
    add: node.server,
    port: String(node.port),
    id: node.uuid,
    aid: String(node.alterId || 0),
    scy: node.cipher || "auto",
    net: node.network || "tcp",
    type: "none",
    host: node.wsHost || node.httpHost || "",
    path: node.wsPath || node.grpcServiceName || node.httpPath || "",
    tls: node.tls ? "tls" : "",
    sni: node.servername || "",
    fp: node.clientFingerprint || ""
  };
  return `vmess://${encodeBase64(JSON.stringify(payload))}`;
}

function renderVlessUri(node) {
  const params = new URLSearchParams();
  params.set("type", node.network || "tcp");
  if (node.tls) {
    params.set("security", node.reality ? "reality" : "tls");
  }
  if (node.servername) {
    params.set("sni", node.servername);
  }
  if (node.wsHost) {
    params.set("host", node.wsHost);
  }
  if (node.wsPath) {
    params.set("path", node.wsPath);
  }
  if (node.grpcServiceName) {
    params.set("serviceName", node.grpcServiceName);
  }
  if (node.flow) {
    params.set("flow", node.flow);
  }
  if (node.clientFingerprint) {
    params.set("fp", node.clientFingerprint);
  }
  if (node.skipCertVerify) {
    params.set("allowInsecure", "1");
  }
  if (node.reality) {
    if (node.publicKey) {
      params.set("pbk", node.publicKey);
    }
    if (node.shortId) {
      params.set("sid", node.shortId);
    }
    if (node.spiderX) {
      params.set("spx", node.spiderX);
    }
  }
  const suffix = encodeNodeName(node.name);
  return `vless://${node.uuid}@${node.server}:${node.port}?${params.toString()}#${suffix}`;
}

function renderTrojanUri(node) {
  const params = new URLSearchParams();
  params.set("type", node.network || "tcp");
  if (node.servername) {
    params.set("sni", node.servername);
  }
  if (node.wsHost) {
    params.set("host", node.wsHost);
  }
  if (node.wsPath) {
    params.set("path", node.wsPath);
  }
  if (node.grpcServiceName) {
    params.set("serviceName", node.grpcServiceName);
  }
  if (node.clientFingerprint) {
    params.set("fp", node.clientFingerprint);
  }
  if (node.skipCertVerify) {
    params.set("allowInsecure", "1");
  }
  const suffix = encodeNodeName(node.name);
  return `trojan://${node.password}@${node.server}:${node.port}?${params.toString()}#${suffix}`;
}

function renderSsUri(node) {
  const auth = `${node.cipher}:${node.password}@${node.server}:${node.port}`;
  return `ss://${encodeBase64(auth)}#${encodeNodeName(node.name)}`;
}

function renderSocksUri(node) {
  const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || "")}@` : "";
  return `socks5://${auth}${node.server}:${node.port}#${encodeNodeName(node.name)}`;
}

function renderHttpUri(node) {
  const scheme = node.tls ? "https" : "http";
  const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || "")}@` : "";
  return `${scheme}://${auth}${node.server}:${node.port}#${encodeNodeName(node.name)}`;
}

export function renderV2rayn(nodes) {
  const lines = nodes
    .map((node) => {
      if (node.type === "vmess") {
        return renderVmessUri(node);
      }
      if (node.type === "vless") {
        return renderVlessUri(node);
      }
      if (node.type === "trojan") {
        return renderTrojanUri(node);
      }
      if (node.type === "ss") {
        return renderSsUri(node);
      }
      if (node.type === "socks5") {
        return renderSocksUri(node);
      }
      if (node.type === "http") {
        return renderHttpUri(node);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return encodeBase64(lines);
}

function quoteYamlString(value) {
  const safe = String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${safe}"`;
}

function renderYamlValue(value, indentLevel) {
  const indent = " ".repeat(indentLevel);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `\n${value
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return `${indent}- ${renderYamlObject(item, indentLevel + 2).trimStart()}`;
        }
        return `${indent}- ${renderScalar(item)}`;
      })
      .join("\n")}`;
  }
  if (typeof value === "object" && value !== null) {
    return `\n${renderYamlObject(value, indentLevel)}`;
  }
  return renderScalar(value);
}

function renderScalar(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return quoteYamlString(value ?? "");
}

function renderYamlObject(object, indentLevel = 0) {
  const indent = " ".repeat(indentLevel);
  return Object.entries(object)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .map(([key, value]) => `${indent}${key}: ${renderYamlValue(value, indentLevel + 2)}`)
    .join("\n");
}

function clashProxyFromNode(node) {
  if (node.type === "vmess") {
    const proxy = {
      name: node.name,
      type: "vmess",
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      alterId: node.alterId || 0,
      cipher: node.cipher || "auto",
      udp: true,
      tls: node.tls,
      skipCertVerify: node.skipCertVerify
    };
    if (node.servername) {
      proxy.servername = node.servername;
    }
    if (node.network === "ws") {
      proxy.network = "ws";
      proxy["ws-opts"] = {
        path: node.wsPath || "/",
        headers: {
          Host: node.wsHost || node.servername || node.server
        }
      };
    }
    if (node.network === "grpc") {
      proxy.network = "grpc";
      proxy["grpc-opts"] = {
        "grpc-service-name": node.grpcServiceName || ""
      };
    }
    if (node.clientFingerprint) {
      proxy["client-fingerprint"] = node.clientFingerprint;
    }
    return proxy;
  }

  if (node.type === "vless") {
    const proxy = {
      name: node.name,
      type: "vless",
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      udp: true,
      tls: node.tls,
      skipCertVerify: node.skipCertVerify,
      network: node.network || "tcp"
    };
    if (node.servername) {
      proxy.servername = node.servername;
    }
    if (node.flow) {
      proxy.flow = node.flow;
    }
    if (node.network === "ws") {
      proxy["ws-opts"] = {
        path: node.wsPath || "/",
        headers: {
          Host: node.wsHost || node.servername || node.server
        }
      };
    }
    if (node.network === "grpc") {
      proxy["grpc-opts"] = {
        "grpc-service-name": node.grpcServiceName || ""
      };
    }
    if (node.clientFingerprint) {
      proxy["client-fingerprint"] = node.clientFingerprint;
    }
    if (node.reality) {
      proxy["reality-opts"] = {
        "public-key": node.publicKey || "",
        "short-id": node.shortId || ""
      };
    }
    return proxy;
  }

  if (node.type === "trojan") {
    const proxy = {
      name: node.name,
      type: "trojan",
      server: node.server,
      port: node.port,
      password: node.password,
      udp: true,
      sni: node.servername || "",
      skipCertVerify: node.skipCertVerify
    };
    if (node.network === "ws") {
      proxy.network = "ws";
      proxy["ws-opts"] = {
        path: node.wsPath || "/",
        headers: {
          Host: node.wsHost || node.servername || node.server
        }
      };
    }
    if (node.network === "grpc") {
      proxy.network = "grpc";
      proxy["grpc-opts"] = {
        "grpc-service-name": node.grpcServiceName || ""
      };
    }
    if (node.clientFingerprint) {
      proxy["client-fingerprint"] = node.clientFingerprint;
    }
    return proxy;
  }

  if (node.type === "ss") {
    const proxy = {
      name: node.name,
      type: "ss",
      server: node.server,
      port: node.port,
      cipher: node.cipher,
      password: node.password,
      udp: true
    };
    if (node.plugin) {
      proxy.plugin = node.plugin;
    }
    return proxy;
  }

  if (node.type === "socks5") {
    return {
      name: node.name,
      type: "socks5",
      server: node.server,
      port: node.port,
      username: node.username || "",
      password: node.password || "",
      udp: true
    };
  }

  return {
    name: node.name,
    type: "http",
    server: node.server,
    port: node.port,
    username: node.username || "",
    password: node.password || "",
    tls: !!node.tls
  };
}

export function renderClash(nodes) {
  const proxies = nodes.map(clashProxyFromNode);
  const groups = DEFAULT_CLASH_GROUPS.map((group) => ({
    ...group,
    proxies: group.name === "Auto" ? proxies.map((proxy) => proxy.name) : ["Auto", ...proxies.map((proxy) => proxy.name), "DIRECT"]
  }));

  const config = {
    port: 7890,
    "socks-port": 7891,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    "unified-delay": true,
    "external-controller": "127.0.0.1:9090",
    proxies,
    "proxy-groups": groups,
    rules: [
      "MATCH,Proxy"
    ]
  };

  return renderYamlObject(config);
}

function singboxOutboundFromNode(node, index) {
  const tag = node.name || `${node.type}-${index + 1}`;

  if (node.type === "vmess") {
    const outbound = {
      type: "vmess",
      tag,
      server: node.server,
      server_port: node.port,
      uuid: node.uuid,
      security: node.cipher || "auto",
      alter_id: node.alterId || 0
    };
    if (node.tls) {
      outbound.tls = {
        enabled: true,
        server_name: node.servername || undefined,
        insecure: node.skipCertVerify || false,
        utls: node.clientFingerprint ? { enabled: true, fingerprint: node.clientFingerprint } : undefined
      };
    }
    if (node.network === "ws") {
      outbound.transport = {
        type: "ws",
        path: node.wsPath || "/",
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === "grpc") {
      outbound.transport = {
        type: "grpc",
        service_name: node.grpcServiceName || ""
      };
    }
    return outbound;
  }

  if (node.type === "vless") {
    const outbound = {
      type: "vless",
      tag,
      server: node.server,
      server_port: node.port,
      uuid: node.uuid,
      flow: node.flow || undefined
    };
    if (node.tls) {
      outbound.tls = {
        enabled: true,
        server_name: node.servername || undefined,
        insecure: node.skipCertVerify || false,
        utls: node.clientFingerprint ? { enabled: true, fingerprint: node.clientFingerprint } : undefined,
        reality: node.reality
          ? {
              enabled: true,
              public_key: node.publicKey || "",
              short_id: node.shortId || ""
            }
          : undefined
      };
    }
    if (node.network === "ws") {
      outbound.transport = {
        type: "ws",
        path: node.wsPath || "/",
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === "grpc") {
      outbound.transport = {
        type: "grpc",
        service_name: node.grpcServiceName || ""
      };
    }
    return outbound;
  }

  if (node.type === "trojan") {
    const outbound = {
      type: "trojan",
      tag,
      server: node.server,
      server_port: node.port,
      password: node.password,
      tls: {
        enabled: true,
        server_name: node.servername || undefined,
        insecure: node.skipCertVerify || false,
        utls: node.clientFingerprint ? { enabled: true, fingerprint: node.clientFingerprint } : undefined
      }
    };
    if (node.network === "ws") {
      outbound.transport = {
        type: "ws",
        path: node.wsPath || "/",
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === "grpc") {
      outbound.transport = {
        type: "grpc",
        service_name: node.grpcServiceName || ""
      };
    }
    return outbound;
  }

  if (node.type === "ss") {
    return {
      type: "shadowsocks",
      tag,
      server: node.server,
      server_port: node.port,
      method: node.cipher,
      password: node.password
    };
  }

  if (node.type === "socks5") {
    return {
      type: "socks",
      tag,
      server: node.server,
      server_port: node.port,
      username: node.username || undefined,
      password: node.password || undefined
    };
  }

  return {
    type: "http",
    tag,
    server: node.server,
    server_port: node.port,
    username: node.username || undefined,
    password: node.password || undefined,
    tls: node.tls ? { enabled: true } : undefined
  };
}

export function renderSingbox(nodes) {
  const outboundTags = nodes.map((node) => node.name);
  const config = {
    log: {
      level: "info"
    },
    dns: {
      servers: [
        { tag: "google", address: "8.8.8.8" },
        { tag: "cloudflare", address: "1.1.1.1" }
      ]
    },
    outbounds: [
      {
        type: "selector",
        tag: "select",
        outbounds: ["auto", ...outboundTags]
      },
      {
        type: "urltest",
        tag: "auto",
        outbounds: outboundTags,
        url: "https://www.gstatic.com/generate_204",
        interval: "5m"
      },
      ...nodes.map(singboxOutboundFromNode),
      {
        type: "direct",
        tag: "direct"
      }
    ],
    route: {
      auto_detect_interface: true,
      final: "select"
    }
  };

  return JSON.stringify(config, null, 2);
}

export function convertSubscription(input, target) {
  const { nodes, skipped } = parseSubscription(input);
  if (!nodes.length) {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(
        {
          ok: false,
          message: "No supported nodes found in the subscription.",
          skipped
        },
        null,
        2
      )
    };
  }

  if (target === "clash") {
    return {
      contentType: "text/yaml; charset=utf-8",
      body: renderClash(nodes),
      meta: { count: nodes.length, skipped: skipped.length }
    };
  }

  if (target === "singbox" || target === "sing-box") {
    return {
      contentType: "application/json; charset=utf-8",
      body: renderSingbox(nodes),
      meta: { count: nodes.length, skipped: skipped.length }
    };
  }

  return {
    contentType: "text/plain; charset=utf-8",
    body: renderV2rayn(nodes),
    meta: { count: nodes.length, skipped: skipped.length }
  };
}
