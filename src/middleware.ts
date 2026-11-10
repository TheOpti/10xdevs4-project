import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_API_ROUTES = ["/api/flashcards/cards/", "/api/flashcards/sets/"];
const PROTECTED_ROUTES = ["/dashboard", ...PROTECTED_API_ROUTES];

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
      if (PROTECTED_API_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
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
