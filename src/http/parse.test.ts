import { describe, expect, it } from "vitest";
import { fromCurl, jsonPath, mergeEnvFiles, parseHttpFile, shellWords, substitute, toCurl, toHttpText, unresolved } from "./parse";

const FILE = `@host = https://api.example.com
@token = abc

### Ambil user
# @name getUser
GET {{host}}/users/1
  ?expand=true
  &x=1
Accept: application/json
Authorization: Bearer {{token}}

###
POST {{host}}/users HTTP/1.1
Content-Type: application/json
// komentar header

{
  "name": "Nozi"
}

> {% client.global.set("id", response.body.id) %}

###
PUT https://x.test/upload
Content-Type: application/json

< ./data.json

###
https://example.com/plain
`;

describe(".http", () => {
  it("mengurai variabel, nama, header, body, berkas body", () => {
    const { vars, requests } = parseHttpFile(FILE);
    expect(vars).toEqual({ host: "https://api.example.com", token: "abc" });
    expect(requests).toHaveLength(4);
    expect(requests[0]).toMatchObject({ name: "getUser", method: "GET", url: "{{host}}/users/1?expand=true&x=1", headers: [["Accept", "application/json"], ["Authorization", "Bearer {{token}}"]], body: null, line: 6 });
    expect(requests[1]).toMatchObject({ method: "POST", url: "{{host}}/users", headers: [["Content-Type", "application/json"]], body: '{\n  "name": "Nozi"\n}' });
    expect(requests[2]).toMatchObject({ bodyFile: "./data.json", body: null });
    expect(requests[3]).toMatchObject({ method: "GET", url: "https://example.com/plain" });
    expect(FILE.slice(requests[1].from, requests[1].to)).toContain("POST {{host}}/users");
  });
  it("substitusi variabel, env, respons bernama, dan dinamis", () => {
    const ctx = { vars: { host: "{{base}}/v1", token: "t" }, env: { base: "https://e.test" }, responses: { login: { status: 200, headers: [["X-Id", "7"]] as [string, string][], text: '{"data":{"token":"jwt","list":[{"id":3}]}}' } }, now: new Date("2025-01-02T03:04:05Z") };
    expect(substitute("{{host}}/x?t={{token}}", ctx)).toBe("https://e.test/v1/x?t=t");
    expect(substitute("{{login.response.body.$.data.token}} {{login.response.body.data.list[0].id}} {{login.response.headers.x-id}}", ctx)).toBe("jwt 3 7");
    expect(substitute("{{$timestamp}} {{$isoTimestamp}}", ctx)).toBe("1735787045 2025-01-02T03:04:05.000Z");
    expect(substitute("{{$secret API}} {{$dotenv X}} {{nope}}", ctx)).toBe("{{$secret API}} {{$dotenv X}} {{nope}}");
    expect(unresolved("{{$secret API}} {{nope}}")).toEqual(["nope"]);
    expect(substitute("{{$guid}}", ctx)).toMatch(/^[0-9a-f-]{36}$/);
    expect(jsonPath({ a: [{ b: 1 }] }, "$.a[0].b")).toBe(1);
  });
  it("environment dari berkas JetBrains & VS Code", () => {
    const envs = mergeEnvFiles('{"dev":{"host":"http://localhost:3000"},"prod":{"host":"https://api"}}', '{"dev":{"token":"secret"}}', '{\n // c\n "rest-client.environmentVariables": {"dev": {"host": "old", "v": 1}}}');
    expect(envs.dev).toEqual({ host: "http://localhost:3000", v: "1", token: "secret" });
    expect(Object.keys(envs)).toEqual(["dev", "prod"]);
  });
});

describe("cURL", () => {
  it("memecah kata shell", () => {
    expect(shellWords(`curl -H 'A: b c' "x\\"y" a\\ b \\\n -d '{"a":1}'`)).toEqual(["curl", "-H", "A: b c", 'x"y', "a b", "-d", '{"a":1}']);
  });
  it("import dari cURL (salinan DevTools)", () => {
    const r = fromCurl(`curl 'https://api.test/v1/items?x=1' \\\n  -H 'accept: application/json' \\\n  -H 'authorization: Bearer t' \\\n  --data-raw '{"name":"Nozi"}' \\\n  --compressed`);
    expect(r).toEqual({ method: "POST", url: "https://api.test/v1/items?x=1", headers: [["accept", "application/json"], ["authorization", "Bearer t"], ["Content-Type", "application/x-www-form-urlencoded"]], body: '{"name":"Nozi"}' });
    expect(fromCurl("curl -u user:pw -X DELETE https://a.test/1")).toMatchObject({ method: "DELETE", headers: [["Authorization", "Basic dXNlcjpwdw=="]] });
    expect(fromCurl("curl -G https://a.test -d q=1 -d n=2")).toMatchObject({ method: "GET", url: "https://a.test?q=1&n=2", body: null });
    expect(fromCurl(`curl --json '{"a":1}' https://a.test`).headers).toEqual([["Content-Type", "application/json"], ["Accept", "application/json"]]);
    expect(() => fromCurl("wget x")).toThrow();
  });
  it("export ke cURL dan .http", () => {
    const r = { method: "POST", url: "https://a.test/x", headers: [["Content-Type", "application/json"]] as [string, string][], body: `{"it's":1}` };
    expect(toCurl(r)).toBe(`curl -X POST 'https://a.test/x' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"it'\\''s":1}'`);
    expect(fromCurl(toCurl(r))).toEqual(r);
    expect(toHttpText(r, "buat")).toBe(`# @name buat\nPOST https://a.test/x\nContent-Type: application/json\n\n{"it's":1}\n`);
  });
});
