import test from "node:test";
import assert from "node:assert/strict";

import { convertSubscription, parseSubscription, renderClash, renderSingbox, renderV2rayn } from "../src/converter.js";

const sampleSubscription = Buffer.from(
  [
    "vmess://eyJ2IjoiMiIsInBzIjoiVGVzdCBWTWVzcyIsImFkZCI6InZtZXNzLmV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiMTExMTExMTEtMTExMS0xMTExLTExMTEtMTExMTExMTExMTExIiwiYWlkIjoiMCIsInNjeSI6ImF1dG8iLCJuZXQiOiJ3cyIsImhvc3QiOiJjZG4uZXhhbXBsZS5jb20iLCJwYXRoIjoiL3dzIiwidGxzIjoidGxzIiwic25pIjoiY2RuLmV4YW1wbGUuY29tIn0=",
    "vless://22222222-2222-2222-2222-222222222222@vless.example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fvless&sni=cdn.example.com#Test%20VLESS",
    "trojan://secret@trojan.example.com:443?type=grpc&serviceName=grpc-service&sni=trojan.example.com#Test%20Trojan",
    "ss://YWVzLTI1Ni1nY206cGFzc3dvcmRAc3MuZXhhbXBsZS5jb206ODM4OA==#Test%20SS"
  ].join("\n"),
  "utf8"
).toString("base64");

test("parseSubscription parses common node types", () => {
  const result = parseSubscription(sampleSubscription);
  assert.equal(result.nodes.length, 4);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.nodes[0].type, "vmess");
  assert.equal(result.nodes[1].type, "vless");
  assert.equal(result.nodes[2].type, "trojan");
  assert.equal(result.nodes[3].type, "ss");
});

test("renderClash outputs clash yaml sections", () => {
  const { nodes } = parseSubscription(sampleSubscription);
  const clash = renderClash(nodes);
  assert.match(clash, /proxies:/);
  assert.match(clash, /proxy-groups:/);
  assert.match(clash, /type: "vmess"/);
});

test("renderSingbox outputs valid json", () => {
  const { nodes } = parseSubscription(sampleSubscription);
  const singbox = renderSingbox(nodes);
  const parsed = JSON.parse(singbox);
  assert.equal(parsed.outbounds[0].type, "selector");
  assert.ok(parsed.outbounds.length >= 5);
});

test("renderV2rayn returns a base64 encoded node list", () => {
  const { nodes } = parseSubscription(sampleSubscription);
  const encoded = renderV2rayn(nodes);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  assert.match(decoded, /^vmess:\/\//);
  assert.match(decoded, /vless:\/\//);
});

test("convertSubscription uses requested target", () => {
  const clash = convertSubscription(sampleSubscription, "clash");
  const singbox = convertSubscription(sampleSubscription, "singbox");
  const v2rayn = convertSubscription(sampleSubscription, "v2rayn");

  assert.equal(clash.contentType, "text/yaml; charset=utf-8");
  assert.equal(singbox.contentType, "application/json; charset=utf-8");
  assert.equal(v2rayn.contentType, "text/plain; charset=utf-8");
});
