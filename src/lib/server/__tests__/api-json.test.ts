import { describe, it, expect } from "vitest";
import { apiOk, apiFail } from "@/lib/server/api-json";

describe("apiOk", () => {
  it("returns 200 with ok:true and data", async () => {
    const res = apiOk({ userId: "abc" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { userId: "abc" } });
  });

  it("accepts custom init options", async () => {
    const res = apiOk(
      { ok: true },
      { status: 201, headers: { "X-Custom": "val" } },
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Custom")).toBe("val");
  });

  it("handles null data", async () => {
    const res = apiOk(null);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: null });
  });

  it("handles array data", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const res = apiOk(items);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: items });
  });
});

describe("apiFail", () => {
  it("returns 400 with error by default", async () => {
    const res = apiFail("Something went wrong");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: "error", message: "Something went wrong" },
    });
  });

  it("accepts custom status code", async () => {
    const res = apiFail("Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("accepts custom error code", async () => {
    const res = apiFail("Invalid input", 422, "VALIDATION_ERROR");
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts extra fields", async () => {
    const res = apiFail("Validation failed", 422, "VALIDATION_ERROR", {
      field: "email",
    });
    const body = await res.json();
    expect(body.error.field).toBe("email");
  });

  it("handles 500 errors", async () => {
    const res = apiFail("Internal error", 500, "SERVER_ERROR");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("SERVER_ERROR");
  });
});
