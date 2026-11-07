import { NextResponse, type NextRequest } from "next/server";

// The live session cookie is better-auth.session_token. On HTTPS it carries
// the __Secure- prefix, so match the token name as a substring instead of
// requiring the better-auth prefix at the start. Matching session_data here
// would treat a stale cache cookie as a live session and loop with
// /login. Require session_token so anonymous requests still bounce to
// /login and the server guards stay authoritative.
const hasSessionCookie = (request: NextRequest): boolean =>
  request.cookies
    .getAll()
    .some(
      ({ name }) =>
        name.includes("better-auth") && name.includes("session_token"),
    );

export const proxy = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  const isAuthedCookie = hasSessionCookie(request);

  // Cheap hint layer only. Real authorization happens in the server guards.
  if (!isAuthedCookie && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // /reset-password intentionally stays reachable with a session cookie so
  // reset links work even with a stale cookie or while signed in.
  const isAuthPage = pathname === "/login" || pathname === "/forgot-password";

  if (isAuthedCookie && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/login", "/forgot-password", "/dashboard", "/dashboard/:path*"],
};
