import { NextResponse, type NextRequest } from "next/server";

// A Content Security Policy with a fresh nonce per request (Next's own pattern:
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
//
// Why it matters here more than on most sites: the unlocked data key sits in
// localStorage, so one injected script reads the whole ledger. Only scripts
// carrying the nonce run — Next stamps it on its own, app/layout.tsx on the
// theme script — and `connect-src` limits where a script could send anything
// to Supabase and Nominatim. Styles stay 'unsafe-inline': server-rendered SVG
// carries style attributes, and a nonce in style-src would switch that off.
//
// A nonce needs every page rendered per request (the root layout reads it with
// headers()), which costs the static HTML these client-rendered pages had.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' only in dev, where React uses eval for error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // ws: for the dev server's hot reload.
    `connect-src 'self' ${supabase} https://nominatim.openstreetmap.org${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: static files and prefetches need no policy of their own.
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|cursors|diver.svg|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
