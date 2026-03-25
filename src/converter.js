const DEFAULT_CLASH_GROUPS = [
  { name: 'Proxy', type: 'select', proxies: ['Auto', 'DIRECT'] },
  { name: 'Auto', type: 'url-test', proxies: [], url: 'https://www.gstatic.com/generate_204', interval: 300 }
];

export function decodeBase64Loose(value) {
  if (!value) {
    return '';
  }

  let normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) {
    normalized += '='.repeat(4 - padding);
  }

  try {
    return atob(normalized);
  } catch {
    return '';
  }
}

function encodeBase64(value) {
  return btoa(value);
}

function ensureName(value, fallback) {
  return value && value.trim() ? value.trim() : fallback;
}

function parseQuery(queryString) {
  const params = new URLSearchParams(queryString || '');
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function safeDecode(value) {
  if (!value) {
    return '';
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
  return /^(vmess|vless|trojan|ss|socks|http|tuic|hy2|hysteria2):\/\//m.test(value);
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) ? port : 0;
}

function parseBool(value) {
  return value === '1' || value === 'true';
}

function baseNode(type, server, port, name) {
  return { type, name, server, port };
}

function parseVmess(uri, index) {
  const payload = uri.slice('vmess://'.length);
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

  return {
    ...baseNode('vmess', json.add, parsePort(json.port), ensureName(json.ps, `vmess-${index}`)),
    uuid: json.id,
    alterId: parsePort(json.aid || '0'),
    cipher: json.scy || 'auto',
    udp: true,
    tls: ['tls', 'xtls'].includes(String(json.tls || '').toLowerCase()),
    skipCertVerify: false,
    servername: json.sni || '',
    network: (json.net || 'tcp').toLowerCase(),
    wsPath: json.path || '',
    wsHost: json.host || '',
    httpHost: json.host || '',
    httpPath: json.path || '',
    grpcServiceName: json.path || '',
    clientFingerprint: json.fp || ''
  };
}

function parseVless(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);
  const security = (params.security || '').toLowerCase();

  return {
    ...baseNode('vless', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `vless-${index}`)),
    uuid: url.username,
    udp: true,
    tls: ['tls', 'reality'].includes(security),
    skipCertVerify: parseBool(params.allowInsecure),
    servername: params.sni || params.host || '',
    network: (params.type || 'tcp').toLowerCase(),
    flow: params.flow || '',
    wsPath: params.path ? safeDecode(params.path) : '',
    wsHost: params.host || '',
    grpcServiceName: params.serviceName || '',
    clientFingerprint: params.fp || '',
    reality: security === 'reality',
    publicKey: params.pbk || '',
    shortId: params.sid || '',
    spiderX: params.spx || ''
  };
}

function parseTrojan(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);

  return {
    ...baseNode('trojan', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `trojan-${index}`)),
    password: url.username,
    udp: true,
    tls: true,
    skipCertVerify: parseBool(params.allowInsecure),
    servername: params.sni || params.peer || '',
    network: (params.type || 'tcp').toLowerCase(),
    wsPath: params.path ? safeDecode(params.path) : '',
    wsHost: params.host || '',
    grpcServiceName: params.serviceName || '',
    clientFingerprint: params.fp || ''
  };
}

function parseSs(uri, index) {
  const raw = uri.slice('ss://'.length);
  const hashIndex = raw.indexOf('#');
  const suffix = hashIndex >= 0 ? raw.slice(hashIndex + 1) : '';
  const main = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = main.indexOf('?');
  const query = queryIndex >= 0 ? main.slice(queryIndex + 1) : '';
  const target = queryIndex >= 0 ? main.slice(0, queryIndex) : main;
  const params = parseQuery(query);

  let authAndServer = target;
  if (!target.includes('@')) {
    authAndServer = decodeBase64Loose(target);
  }

  const atIndex = authAndServer.lastIndexOf('@');
  if (atIndex < 0) {
    return null;
  }

  const credentials = authAndServer.slice(0, atIndex);
  const serverPort = authAndServer.slice(atIndex + 1);
  const [cipher, password] = credentials.split(':');
  const hostIndex = serverPort.lastIndexOf(':');
  if (hostIndex < 0) {
    return null;
  }

  return {
    ...baseNode('ss', serverPort.slice(0, hostIndex), parsePort(serverPort.slice(hostIndex + 1)), ensureName(safeDecode(suffix), `ss-${index}`)),
    cipher,
    password,
    udp: true,
    plugin: params.plugin || ''
  };
}

function parseSocks(uri, index) {
  const url = new URL(uri);
  return {
    ...baseNode('socks5', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `socks-${index}`)),
    username: safeDecode(url.username),
    password: safeDecode(url.password),
    udp: true
  };
}

function parseHttp(uri, index) {
  const url = new URL(uri);
  return {
    ...baseNode('http', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `http-${index}`)),
    username: safeDecode(url.username),
    password: safeDecode(url.password),
    tls: url.protocol === 'https:'
  };
}

function parseTuic(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);

  return {
    ...baseNode('tuic', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `tuic-${index}`)),
    uuid: safeDecode(url.username),
    password: safeDecode(url.password),
    udp: true,
    congestionController: params.congestion_control || params.congestionControl || 'bbr',
    alpn: params.alpn ? params.alpn.split(',').map((item) => item.trim()).filter(Boolean) : [],
    disableSni: parseBool(params.disable_sni || params.disableSni),
    sni: params.sni || '',
    skipCertVerify: parseBool(params.allow_insecure || params.allowInsecure),
    zeroRttHandshake: parseBool(params['0rtt'] || params.zero_rtt_handshake || params.zeroRttHandshake),
    heartbeat: params.heartbeat || '10s'
  };
}

function parseHysteria2(uri, index) {
  const url = new URL(uri);
  const params = parseQuery(url.search);

  return {
    ...baseNode('hysteria2', url.hostname, parsePort(url.port), ensureName(safeDecode(url.hash.slice(1)), `hysteria2-${index}`)),
    password: safeDecode(url.username),
    udp: true,
    sni: params.sni || params.peer || '',
    skipCertVerify: parseBool(params.insecure),
    alpn: params.alpn ? params.alpn.split(',').map((item) => item.trim()).filter(Boolean) : [],
    obfs: params.obfs || '',
    obfsPassword: params['obfs-password'] || params.obfsPassword || '',
    upMbps: parsePort(params.upmbps || params.up),
    downMbps: parsePort(params.downmbps || params.down)
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
      if (lower.startsWith('vmess://')) {
        parsed = parseVmess(line, index + 1);
      } else if (lower.startsWith('vless://')) {
        parsed = parseVless(line, index + 1);
      } else if (lower.startsWith('trojan://')) {
        parsed = parseTrojan(line, index + 1);
      } else if (lower.startsWith('ss://')) {
        parsed = parseSs(line, index + 1);
      } else if (lower.startsWith('socks://') || lower.startsWith('socks5://')) {
        parsed = parseSocks(line, index + 1);
      } else if (lower.startsWith('http://') || lower.startsWith('https://')) {
        parsed = parseHttp(line, index + 1);
      } else if (lower.startsWith('tuic://')) {
        parsed = parseTuic(line, index + 1);
      } else if (lower.startsWith('hy2://') || lower.startsWith('hysteria2://')) {
        parsed = parseHysteria2(line, index + 1);
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
  return encodeURIComponent(name || '');
}

function renderVmessUri(node) {
  const payload = {
    v: '2',
    ps: node.name,
    add: node.server,
    port: String(node.port),
    id: node.uuid,
    aid: String(node.alterId || 0),
    scy: node.cipher || 'auto',
    net: node.network || 'tcp',
    type: 'none',
    host: node.wsHost || node.httpHost || '',
    path: node.wsPath || node.grpcServiceName || node.httpPath || '',
    tls: node.tls ? 'tls' : '',
    sni: node.servername || '',
    fp: node.clientFingerprint || ''
  };
  return `vmess://${encodeBase64(JSON.stringify(payload))}`;
}

function renderVlessUri(node) {
  const params = new URLSearchParams();
  params.set('type', node.network || 'tcp');
  if (node.tls) {
    params.set('security', node.reality ? 'reality' : 'tls');
  }
  if (node.servername) {
    params.set('sni', node.servername);
  }
  if (node.wsHost) {
    params.set('host', node.wsHost);
  }
  if (node.wsPath) {
    params.set('path', node.wsPath);
  }
  if (node.grpcServiceName) {
    params.set('serviceName', node.grpcServiceName);
  }
  if (node.flow) {
    params.set('flow', node.flow);
  }
  if (node.clientFingerprint) {
    params.set('fp', node.clientFingerprint);
  }
  if (node.skipCertVerify) {
    params.set('allowInsecure', '1');
  }
  if (node.reality) {
    if (node.publicKey) {
      params.set('pbk', node.publicKey);
    }
    if (node.shortId) {
      params.set('sid', node.shortId);
    }
    if (node.spiderX) {
      params.set('spx', node.spiderX);
    }
  }
  return `vless://${node.uuid}@${node.server}:${node.port}?${params.toString()}#${encodeNodeName(node.name)}`;
}

function renderTrojanUri(node) {
  const params = new URLSearchParams();
  params.set('type', node.network || 'tcp');
  if (node.servername) {
    params.set('sni', node.servername);
  }
  if (node.wsHost) {
    params.set('host', node.wsHost);
  }
  if (node.wsPath) {
    params.set('path', node.wsPath);
  }
  if (node.grpcServiceName) {
    params.set('serviceName', node.grpcServiceName);
  }
  if (node.clientFingerprint) {
    params.set('fp', node.clientFingerprint);
  }
  if (node.skipCertVerify) {
    params.set('allowInsecure', '1');
  }
  return `trojan://${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeNodeName(node.name)}`;
}

function renderSsUri(node) {
  const auth = `${node.cipher}:${node.password}@${node.server}:${node.port}`;
  return `ss://${encodeBase64(auth)}#${encodeNodeName(node.name)}`;
}

function renderSocksUri(node) {
  const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@` : '';
  return `socks5://${auth}${node.server}:${node.port}#${encodeNodeName(node.name)}`;
}

function renderHttpUri(node) {
  const scheme = node.tls ? 'https' : 'http';
  const auth = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || '')}@` : '';
  return `${scheme}://${auth}${node.server}:${node.port}#${encodeNodeName(node.name)}`;
}

function renderTuicUri(node) {
  const params = new URLSearchParams();
  if (node.congestionController) {
    params.set('congestion_control', node.congestionController);
  }
  if (node.alpn?.length) {
    params.set('alpn', node.alpn.join(','));
  }
  if (node.disableSni) {
    params.set('disable_sni', '1');
  }
  if (node.sni) {
    params.set('sni', node.sni);
  }
  if (node.skipCertVerify) {
    params.set('allow_insecure', '1');
  }
  if (node.zeroRttHandshake) {
    params.set('0rtt', '1');
  }
  if (node.heartbeat) {
    params.set('heartbeat', node.heartbeat);
  }
  return `tuic://${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@${node.server}:${node.port}?${params.toString()}#${encodeNodeName(node.name)}`;
}

function renderHysteria2Uri(node) {
  const params = new URLSearchParams();
  if (node.sni) {
    params.set('sni', node.sni);
  }
  if (node.skipCertVerify) {
    params.set('insecure', '1');
  }
  if (node.alpn?.length) {
    params.set('alpn', node.alpn.join(','));
  }
  if (node.obfs) {
    params.set('obfs', node.obfs);
  }
  if (node.obfsPassword) {
    params.set('obfs-password', node.obfsPassword);
  }
  if (node.upMbps) {
    params.set('upmbps', String(node.upMbps));
  }
  if (node.downMbps) {
    params.set('downmbps', String(node.downMbps));
  }
  return `hy2://${encodeURIComponent(node.password)}@${node.server}:${node.port}?${params.toString()}#${encodeNodeName(node.name)}`;
}

export function renderV2rayn(nodes) {
  const lines = nodes
    .map((node) => {
      if (node.type === 'vmess') return renderVmessUri(node);
      if (node.type === 'vless') return renderVlessUri(node);
      if (node.type === 'trojan') return renderTrojanUri(node);
      if (node.type === 'ss') return renderSsUri(node);
      if (node.type === 'socks5') return renderSocksUri(node);
      if (node.type === 'http') return renderHttpUri(node);
      if (node.type === 'tuic') return renderTuicUri(node);
      if (node.type === 'hysteria2') return renderHysteria2Uri(node);
      return '';
    })
    .filter(Boolean)
    .join('\n');

  return encodeBase64(lines);
}

function quoteYamlString(value) {
  const safe = String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${safe}"`;
}

function renderYamlValue(value, indentLevel) {
  const indent = ' '.repeat(indentLevel);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `\n${value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return `${indent}- ${renderYamlObject(item, indentLevel + 2).trimStart()}`;
        }
        return `${indent}- ${renderScalar(item)}`;
      })
      .join('\n')}`;
  }
  if (typeof value === 'object' && value !== null) {
    return `\n${renderYamlObject(value, indentLevel)}`;
  }
  return renderScalar(value);
}

function renderScalar(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return quoteYamlString(value ?? '');
}

function renderYamlObject(object, indentLevel = 0) {
  const indent = ' '.repeat(indentLevel);
  return Object.entries(object)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .map(([key, value]) => `${indent}${key}: ${renderYamlValue(value, indentLevel + 2)}`)
    .join('\n');
}

function clashProxyFromNode(node) {
  if (node.type === 'vmess') {
    const proxy = {
      name: node.name,
      type: 'vmess',
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      alterId: node.alterId || 0,
      cipher: node.cipher || 'auto',
      udp: true,
      tls: node.tls,
      skipCertVerify: node.skipCertVerify
    };
    if (node.servername) proxy.servername = node.servername;
    if (node.network === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = {
        path: node.wsPath || '/',
        headers: { Host: node.wsHost || node.servername || node.server }
      };
    }
    if (node.network === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = { 'grpc-service-name': node.grpcServiceName || '' };
    }
    if (node.clientFingerprint) proxy['client-fingerprint'] = node.clientFingerprint;
    return proxy;
  }

  if (node.type === 'vless') {
    const proxy = {
      name: node.name,
      type: 'vless',
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      udp: true,
      tls: node.tls,
      skipCertVerify: node.skipCertVerify,
      network: node.network || 'tcp'
    };
    if (node.servername) proxy.servername = node.servername;
    if (node.flow) proxy.flow = node.flow;
    if (node.network === 'ws') {
      proxy['ws-opts'] = {
        path: node.wsPath || '/',
        headers: { Host: node.wsHost || node.servername || node.server }
      };
    }
    if (node.network === 'grpc') {
      proxy['grpc-opts'] = { 'grpc-service-name': node.grpcServiceName || '' };
    }
    if (node.clientFingerprint) proxy['client-fingerprint'] = node.clientFingerprint;
    if (node.reality) {
      proxy['reality-opts'] = {
        'public-key': node.publicKey || '',
        'short-id': node.shortId || ''
      };
    }
    return proxy;
  }

  if (node.type === 'trojan') {
    const proxy = {
      name: node.name,
      type: 'trojan',
      server: node.server,
      port: node.port,
      password: node.password,
      udp: true,
      sni: node.servername || '',
      skipCertVerify: node.skipCertVerify
    };
    if (node.network === 'ws') {
      proxy.network = 'ws';
      proxy['ws-opts'] = {
        path: node.wsPath || '/',
        headers: { Host: node.wsHost || node.servername || node.server }
      };
    }
    if (node.network === 'grpc') {
      proxy.network = 'grpc';
      proxy['grpc-opts'] = { 'grpc-service-name': node.grpcServiceName || '' };
    }
    if (node.clientFingerprint) proxy['client-fingerprint'] = node.clientFingerprint;
    return proxy;
  }

  if (node.type === 'ss') {
    const proxy = {
      name: node.name,
      type: 'ss',
      server: node.server,
      port: node.port,
      cipher: node.cipher,
      password: node.password,
      udp: true
    };
    if (node.plugin) proxy.plugin = node.plugin;
    return proxy;
  }

  if (node.type === 'socks5') {
    return {
      name: node.name,
      type: 'socks5',
      server: node.server,
      port: node.port,
      username: node.username || '',
      password: node.password || '',
      udp: true
    };
  }

  if (node.type === 'tuic') {
    const proxy = {
      name: node.name,
      type: 'tuic',
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      password: node.password,
      udp: true,
      'congestion-controller': node.congestionController || 'bbr',
      'disable-sni': node.disableSni || false,
      'skip-cert-verify': node.skipCertVerify || false,
      heartbeat: node.heartbeat || '10s'
    };
    if (node.sni) proxy.sni = node.sni;
    if (node.alpn?.length) proxy.alpn = node.alpn;
    if (node.zeroRttHandshake) proxy['reduce-rtt'] = true;
    return proxy;
  }

  if (node.type === 'hysteria2') {
    const proxy = {
      name: node.name,
      type: 'hysteria2',
      server: node.server,
      port: node.port,
      password: node.password,
      udp: true,
      'skip-cert-verify': node.skipCertVerify || false
    };
    if (node.sni) proxy.sni = node.sni;
    if (node.alpn?.length) proxy.alpn = node.alpn;
    if (node.obfs) proxy.obfs = node.obfs;
    if (node.obfsPassword) proxy['obfs-password'] = node.obfsPassword;
    if (node.upMbps) proxy.up = `${node.upMbps} Mbps`;
    if (node.downMbps) proxy.down = `${node.downMbps} Mbps`;
    return proxy;
  }

  return {
    name: node.name,
    type: 'http',
    server: node.server,
    port: node.port,
    username: node.username || '',
    password: node.password || '',
    tls: !!node.tls
  };
}

export function renderClash(nodes) {
  const proxies = nodes.map(clashProxyFromNode);
  const groups = DEFAULT_CLASH_GROUPS.map((group) => ({
    ...group,
    proxies: group.name === 'Auto' ? proxies.map((proxy) => proxy.name) : ['Auto', ...proxies.map((proxy) => proxy.name), 'DIRECT']
  }));

  return renderYamlObject({
    port: 7890,
    'socks-port': 7891,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'external-controller': '127.0.0.1:9090',
    proxies,
    'proxy-groups': groups,
    rules: ['MATCH,Proxy']
  });
}

function singboxOutboundFromNode(node, index) {
  const tag = node.name || `${node.type}-${index + 1}`;

  if (node.type === 'vmess') {
    const outbound = {
      type: 'vmess',
      tag,
      server: node.server,
      server_port: node.port,
      uuid: node.uuid,
      security: node.cipher || 'auto',
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
    if (node.network === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || ''
      };
    }
    return outbound;
  }

  if (node.type === 'vless') {
    const outbound = {
      type: 'vless',
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
              public_key: node.publicKey || '',
              short_id: node.shortId || ''
            }
          : undefined
      };
    }
    if (node.network === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || ''
      };
    }
    return outbound;
  }

  if (node.type === 'trojan') {
    const outbound = {
      type: 'trojan',
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
    if (node.network === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: node.wsPath || '/',
        headers: node.wsHost ? { Host: node.wsHost } : undefined
      };
    } else if (node.network === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: node.grpcServiceName || ''
      };
    }
    return outbound;
  }

  if (node.type === 'ss') {
    return {
      type: 'shadowsocks',
      tag,
      server: node.server,
      server_port: node.port,
      method: node.cipher,
      password: node.password
    };
  }

  if (node.type === 'socks5') {
    return {
      type: 'socks',
      tag,
      server: node.server,
      server_port: node.port,
      username: node.username || undefined,
      password: node.password || undefined
    };
  }

  if (node.type === 'tuic') {
    return {
      type: 'tuic',
      tag,
      server: node.server,
      server_port: node.port,
      uuid: node.uuid,
      password: node.password,
      congestion_control: node.congestionController || 'bbr',
      udp_relay_mode: 'native',
      zero_rtt_handshake: node.zeroRttHandshake || false,
      heartbeat: node.heartbeat || '10s',
      tls: {
        enabled: true,
        server_name: node.sni || undefined,
        insecure: node.skipCertVerify || false,
        alpn: node.alpn?.length ? node.alpn : undefined,
        disable_sni: node.disableSni || false
      }
    };
  }

  if (node.type === 'hysteria2') {
    return {
      type: 'hysteria2',
      tag,
      server: node.server,
      server_port: node.port,
      password: node.password,
      up_mbps: node.upMbps || undefined,
      down_mbps: node.downMbps || undefined,
      obfs: node.obfs
        ? {
            type: node.obfs,
            password: node.obfsPassword || undefined
          }
        : undefined,
      tls: {
        enabled: true,
        server_name: node.sni || undefined,
        insecure: node.skipCertVerify || false,
        alpn: node.alpn?.length ? node.alpn : undefined
      }
    };
  }

  return {
    type: 'http',
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
  return JSON.stringify(
    {
      log: { level: 'info' },
      dns: {
        servers: [
          { tag: 'google', address: '8.8.8.8' },
          { tag: 'cloudflare', address: '1.1.1.1' }
        ]
      },
      outbounds: [
        { type: 'selector', tag: 'select', outbounds: ['auto', ...outboundTags] },
        {
          type: 'urltest',
          tag: 'auto',
          outbounds: outboundTags,
          url: 'https://www.gstatic.com/generate_204',
          interval: '5m'
        },
        ...nodes.map(singboxOutboundFromNode),
        { type: 'direct', tag: 'direct' }
      ],
      route: {
        auto_detect_interface: true,
        final: 'select'
      }
    },
    null,
    2
  );
}

function parseIniDirectives(templateText) {
  const normalized = String(templateText || '').replace(/\r/g, '\n').replace(/\n+/g, '\n');
  const injected = normalized.replace(/\s+(?=(ruleset=|custom_proxy_group=|enable_rule_generator=|overwrite_original_rules=|clash_rule_base=))/g, '\n');
  const lines = injected.split('\n').map((line) => line.trim()).filter(Boolean);
  const rulesets = [];
  const groups = [];
  let ruleBase = '';
  for (const line of lines) {
    if (line.startsWith(';') || line.startsWith('#')) continue;
    if (line.startsWith('ruleset=')) rulesets.push(line.slice('ruleset='.length).trim());
    else if (line.startsWith('custom_proxy_group=')) groups.push(line.slice('custom_proxy_group='.length).trim());
    else if (line.startsWith('clash_rule_base=')) ruleBase = line.slice('clash_rule_base='.length).trim();
  }
  return { rulesets, groups, ruleBase };
}

function splitRuleListContent(content) {
  const normalized = String(content || '')
    .replace(/\r/g, '\n')
    .replace(/\s+(?=(DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|IP-CIDR6?|GEOIP|MATCH|PROCESS-NAME|DST-PORT|SRC-IP-CIDR|IP-ASN|USER-AGENT|URL-REGEX),)/g, '\n');
  return normalized.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith(';'));
}

function injectPolicy(rule, policy) {
  if (/^MATCH,/i.test(rule)) return rule;
  if (/\bno-resolve$/i.test(rule)) return `${rule.replace(/,\s*no-resolve$/i, '')},${policy},no-resolve`;
  return `${rule},${policy}`;
}

function specialRulesetToRule(special, policy) {
  const value = special.slice(2).trim();
  if (!value) return '';
  if (value.toUpperCase() === 'FINAL' || value.toUpperCase() === 'MATCH') return `MATCH,${policy}`;
  return `${value},${policy}`;
}

function expandGroupEntries(entries, nodes) {
  const names = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.startsWith('[]')) {
      const literal = entry.slice(2).trim();
      if (literal && !seen.has(literal)) {
        seen.add(literal);
        names.push(literal);
      }
      continue;
    }
    try {
      const regex = new RegExp(entry);
      for (const node of nodes) {
        if (regex.test(node.name) && !seen.has(node.name)) {
          seen.add(node.name);
          names.push(node.name);
        }
      }
    } catch {
      if (!seen.has(entry)) {
        seen.add(entry);
        names.push(entry);
      }
    }
  }
  return names;
}

function buildProxyGroupsFromTemplate(groupLines, nodes) {
  return groupLines.map((line) => {
    const parts = line.split('`').map((part) => part.trim());
    const name = parts[0] || 'Proxy';
    const type = parts[1] || 'select';
    const rest = parts.slice(2);
    let url = 'https://www.gstatic.com/generate_204';
    let interval = 300;
    let tolerance;
    let optionsParsed = false;
    const entries = [];

    for (const part of rest) {
      if (!optionsParsed && /^https?:\/\//i.test(part)) {
        url = part;
        optionsParsed = true;
        continue;
      }
      if (optionsParsed) {
        const numbers = part.split(',').map((item) => item.trim()).filter(Boolean);
        if (numbers[0]) interval = parsePort(numbers[0]) || 300;
        if (numbers[1]) tolerance = parsePort(numbers[1]) || undefined;
        continue;
      }
      entries.push(part);
    }

    const group = { name, type, proxies: expandGroupEntries(entries, nodes) };
    if (['url-test', 'load-balance', 'fallback'].includes(type)) {
      group.url = url;
      group.interval = interval;
      if (tolerance) group.tolerance = tolerance;
    }
    return group;
  });
}

async function buildRulesFromTemplate(rulesets, fetchText) {
  const rules = [];
  for (const item of rulesets) {
    const commaIndex = item.indexOf(',');
    if (commaIndex < 0) continue;
    const policy = item.slice(0, commaIndex).trim();
    const source = item.slice(commaIndex + 1).trim();
    if (source.startsWith('[]')) {
      const specialRule = specialRulesetToRule(source, policy);
      if (specialRule) rules.push(specialRule);
      continue;
    }
    const content = await fetchText(source);
    const lines = splitRuleListContent(content);
    for (const line of lines) rules.push(injectPolicy(line, policy));
  }
  return rules;
}

export async function renderClashWithTemplate(nodes, templateText, fetchText) {
  const directives = parseIniDirectives(templateText);
  const proxies = nodes.map(clashProxyFromNode);
  const proxyGroups = directives.groups.length
    ? buildProxyGroupsFromTemplate(directives.groups, nodes)
    : DEFAULT_CLASH_GROUPS.map((group) => ({
        ...group,
        proxies: group.name === 'Auto' ? proxies.map((proxy) => proxy.name) : ['Auto', ...proxies.map((proxy) => proxy.name), 'DIRECT']
      }));
  const rules = directives.rulesets.length ? await buildRulesFromTemplate(directives.rulesets, fetchText) : ['MATCH,Proxy'];

  return renderYamlObject({
    port: 7890,
    'socks-port': 7891,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'external-controller': '127.0.0.1:9090',
    proxies,
    'proxy-groups': proxyGroups,
    rules
  });
}

function renderLoonLine(node) {
  if (node.type === 'vmess') {
    const parts = [`${node.name} = vmess, ${node.server}, ${node.port}, username=${node.uuid}`];
    if (node.network === 'ws') parts.push(`transport=ws, ws-path=${node.wsPath || '/'}, ws-headers=Host:${node.wsHost || node.server}`);
    if (node.tls) parts.push(`tls=true, tls-name=${node.servername || node.server}`);
    return parts.join(', ');
  }
  if (node.type === 'vless') {
    const parts = [`${node.name} = vless, ${node.server}, ${node.port}, username=${node.uuid}`];
    if (node.network === 'ws') parts.push(`transport=ws, ws-path=${node.wsPath || '/'}, ws-headers=Host:${node.wsHost || node.server}`);
    if (node.network === 'grpc') parts.push(`transport=grpc, grpc-service-name=${node.grpcServiceName || ''}`);
    if (node.tls) parts.push(`tls=true, tls-name=${node.servername || node.server}`);
    return parts.join(', ');
  }
  if (node.type === 'trojan') return `${node.name} = trojan, ${node.server}, ${node.port}, password=${node.password}, sni=${node.servername || node.server}`;
  if (node.type === 'ss') return `${node.name} = shadowsocks, ${node.server}, ${node.port}, encrypt-method=${node.cipher}, password=${node.password}`;
  if (node.type === 'socks5') return `${node.name} = socks5, ${node.server}, ${node.port}, username=${node.username || ''}, password=${node.password || ''}`;
  if (node.type === 'http') return `${node.name} = http, ${node.server}, ${node.port}, username=${node.username || ''}, password=${node.password || ''}`;
  if (node.type === 'tuic') return `${node.name} = tuic, ${node.server}, ${node.port}, username=${node.uuid}, password=${node.password}, sni=${node.sni || node.server}`;
  if (node.type === 'hysteria2') return `${node.name} = hysteria2, ${node.server}, ${node.port}, password=${node.password}, sni=${node.sni || node.server}`;
  return `# unsupported loon node: ${node.name}`;
}

export function renderLoon(nodes) {
  return nodes.map(renderLoonLine).join('\n');
}

function renderQxLine(node) {
  const tag = `tag=${node.name}`;
  if (node.type === 'vmess') {
    const parts = [`vmess=${node.server}:${node.port}`, `password=${node.uuid}`, 'method=aes-128-gcm', tag];
    if (node.tls) parts.push(`tls-verification=${node.skipCertVerify ? 'false' : 'true'}`);
    if (node.servername) parts.push(`tls-host=${node.servername}`);
    if (node.network === 'ws') {
      parts.push('obfs=wss');
      if (node.wsHost) parts.push(`obfs-host=${node.wsHost}`);
      if (node.wsPath) parts.push(`obfs-uri=${node.wsPath}`);
    }
    return parts.join(', ');
  }
  if (node.type === 'vless') {
    const parts = [`vless=${node.server}:${node.port}`, `password=${node.uuid}`, tag];
    if (node.tls) parts.push(`tls-verification=${node.skipCertVerify ? 'false' : 'true'}`);
    if (node.servername) parts.push(`tls-host=${node.servername}`);
    if (node.network === 'ws') {
      parts.push('obfs=wss');
      if (node.wsHost) parts.push(`obfs-host=${node.wsHost}`);
      if (node.wsPath) parts.push(`obfs-uri=${node.wsPath}`);
    }
    return parts.join(', ');
  }
  if (node.type === 'trojan') return `trojan=${node.server}:${node.port}, password=${node.password}, over-tls=true, tls-host=${node.servername || node.server}, ${tag}`;
  if (node.type === 'ss') return `shadowsocks=${node.server}:${node.port}, method=${node.cipher}, password=${node.password}, ${tag}`;
  if (node.type === 'socks5') return `socks5=${node.server}:${node.port}, username=${node.username || ''}, password=${node.password || ''}, ${tag}`;
  if (node.type === 'http') return `http=${node.server}:${node.port}, username=${node.username || ''}, password=${node.password || ''}, ${tag}`;
  if (node.type === 'tuic') return `tuic=${node.server}:${node.port}, username=${node.uuid}, password=${node.password}, sni=${node.sni || node.server}, ${tag}`;
  if (node.type === 'hysteria2') return `hysteria2=${node.server}:${node.port}, password=${node.password}, sni=${node.sni || node.server}, ${tag}`;
  return `# unsupported quantumult x node: ${node.name}`;
}

export function renderQuantumultX(nodes) {
  return nodes.map(renderQxLine).join('\n');
}

export async function convertSubscription(input, target, options = {}) {
  const { nodes, skipped } = parseSubscription(input);
  if (!nodes.length) {
    return {
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: false, message: 'No supported nodes found in the subscription.', skipped }, null, 2)
    };
  }

  if (target === 'clash') {
    const body = options.templateText ? await renderClashWithTemplate(nodes, options.templateText, options.fetchText) : renderClash(nodes);
    return {
      contentType: 'text/yaml; charset=utf-8',
      body,
      meta: { count: nodes.length, skipped: skipped.length, templateUrl: options.templateUrl || '', templateMerged: Boolean(options.templateText) }
    };
  }

  if (target === 'singbox' || target === 'sing-box') {
    return {
      contentType: 'application/json; charset=utf-8',
      body: renderSingbox(nodes),
      meta: { count: nodes.length, skipped: skipped.length }
    };
  }

  if (target === 'loon') {
    return {
      contentType: 'text/plain; charset=utf-8',
      body: renderLoon(nodes),
      meta: { count: nodes.length, skipped: skipped.length }
    };
  }

  if (target === 'qx' || target === 'quantumultx' || target === 'quantumult-x') {
    return {
      contentType: 'text/plain; charset=utf-8',
      body: renderQuantumultX(nodes),
      meta: { count: nodes.length, skipped: skipped.length }
    };
  }

  return {
    contentType: 'text/plain; charset=utf-8',
    body: renderV2rayn(nodes),
    meta: { count: nodes.length, skipped: skipped.length }
  };
}
