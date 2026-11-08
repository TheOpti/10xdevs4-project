import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { onRequest } from "./middleware";

vi.mock("astro:middleware", () => ({ defineMiddleware: (handler: unknown) => handler }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

function context(path: string) {
  const url = new URL(path, "http://localhost");
  return {
    url,
    request: new Request(url),
    cookies: {},
    locals: {},
    redirect: vi.fn(() => new Response(null, { status: 302 })),
  } as unknown as Parameters<typeof onRequest>[0];
}

describe("route protection", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([false, true])("blocks card requests with JSON (configured: %s)", async (configured) => {
    vi.mocked(createClient).mockReturnValue(
      configured ? ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } } as never) : null,
    );
    const next = vi.fn();
    const response = (await onRequest(context("/api/flashcards/cards/card-id"), next)) as Response;
    expect(response.status).toBe(configured ? 401 : 503);
    await expect(response.json()).resolves.toEqual({
      error: configured ? "Authentication required" : "Service unavailable",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated card requests and supplies the user", async () => {
    const user = { id: "owner" };
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never);
    const ctx = context("/api/flashcards/cards/card-id");
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    await onRequest(ctx, next);
    expect(ctx.locals.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
  });

  it("preserves page redirects", async () => {
    vi.mocked(createClient).mockReturnValue(null);
    const ctx = context("/dashboard/sets/set-id");
    await onRequest(ctx, vi.fn());
    expect(ctx.redirect).toHaveBeenCalledWith("/auth/signin");
  });

  it.each(["/", "/api/flashcards/save", "/api/flashcards/generate", "/api/auth/signin"])(
    "leaves %s behavior to its handler",
    async (path) => {
      vi.mocked(createClient).mockReturnValue(null);
      const next = vi.fn().mockResolvedValue(new Response("ok"));
      await onRequest(context(path), next);
      expect(next).toHaveBeenCalledOnce();
    },
  );
});
