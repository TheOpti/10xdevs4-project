import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/api/flashcards/cards/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      if (context.url.pathname.startsWith("/api/flashcards/cards/")) {
        return Response.json(
          { error: supabase ? "Authentication required" : "Service unavailable" },
          { status: supabase ? 401 : 503 },
        );
      }
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
