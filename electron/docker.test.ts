import { describe, expect, it } from "vitest";
import { dbKindOfImage, parsePorts } from "./docker";

describe("docker", () => {
  it("mengurai port yang dipublikasikan", () => {
    expect(parsePorts("0.0.0.0:56432->5432/tcp, [::]:56432->5432/tcp")).toEqual([{ host: 56432, container: 5432 }]);
    expect(parsePorts("0.0.0.0:80->80/tcp, 443/tcp, 127.0.0.1:9000->9000/udp")).toEqual([{ host: 80, container: 80 }]);
    expect(parsePorts("")).toEqual([]);
  });
  it("mengenali image database", () => {
    expect(dbKindOfImage("postgres:16-alpine")).toBe("postgres");
    expect(dbKindOfImage("bitnami/mariadb:11")).toBe("mysql");
    expect(dbKindOfImage("mongo")).toBe("mongodb");
    expect(dbKindOfImage("redis/redis-stack-server:latest")).toBe("redis");
    expect(dbKindOfImage("node:22")).toBeNull();
    expect(dbKindOfImage("myredis-app")).toBeNull();
  });
});
