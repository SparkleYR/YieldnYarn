import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, DJANGO_API_URL, FASTAPI_URL, djangoApi, fastApi } from "./api";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({}),
    ...response,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("djangoApi/fastApi request wrapper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET builds the full URL against the Django base and defaults to no auth header", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ ok: true }) });

    const result = await djangoApi.get("/catalog/listings/");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DJANGO_API_URL}/catalog/listings/`);
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBeUndefined();
    expect(result).toEqual({ ok: true });
  });

  it("GET against the FastAPI base uses FASTAPI_URL, not DJANGO_API_URL", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ ok: true }) });

    await fastApi.get("/pricing/estimate?vertical=agriculture");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${FASTAPI_URL}/pricing/estimate?vertical=agriculture`);
  });

  it("includes a Bearer Authorization header when a token is passed", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({}) });

    await djangoApi.get("/auth/me/", { token: "abc123" });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer abc123");
  });

  it("POST serializes the body as JSON", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ id: 1 }) });

    await djangoApi.post("/orders/bids/", { listing: 5, offered_price: 100 });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ listing: 5, offered_price: 100 });
  });

  it("throws ApiError with the response status on a non-ok response", async () => {
    mockFetchOnce({ ok: false, status: 404, text: async () => "Not found." });

    await expect(djangoApi.get("/catalog/listings/999/")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Not found.",
    });
    await expect(djangoApi.get("/catalog/listings/999/")).rejects.toBeInstanceOf(ApiError);
  });

  it("falls back to a generic message when the error body is empty", async () => {
    mockFetchOnce({ ok: false, status: 503, text: async () => "" });

    await expect(djangoApi.get("/catalog/listings/")).rejects.toMatchObject({
      message: "Request failed with status 503",
    });
  });

  it("falls back to statusText when reading the error body itself throws", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => {
        throw new Error("stream already consumed");
      },
    });

    await expect(djangoApi.get("/catalog/listings/")).rejects.toMatchObject({
      message: "Internal Server Error",
    });
  });

  it("returns undefined for a 204 No Content response instead of parsing a body", async () => {
    const jsonSpy = vi.fn();
    mockFetchOnce({ status: 204, json: jsonSpy });

    const result = await djangoApi.delete("/disputes/1/");

    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});
