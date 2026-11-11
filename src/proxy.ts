import { NextResponse, type NextRequest } from "next/server";

// The live session cookie is better-auth.session_token. On HTTPS it carries
// the __Secure- prefix, so match the token name as a substring instead of
// requiring the better-auth prefix at the start. Matching session_data here
// would treat a stale cache cookie as a live session. Require session_token
// so anonymous requests still bounce to /login and the server guards stay
// authoritative. The auth pages (/login, /forgot-password) validate the
// session themselves instead of trusting this cookie hint.
const hasSessionCookie = (request: NextRequest): boolean =>
  request.cookies
    .getAll()
    .some(
      ({ name }) =>
        name.includes("better-auth") && name.includes("session_token"),
    );

export const proxy = (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Cheap hint layer only. Real authorization happens in the server guards,
  // and the auth pages decide for themselves whether to show a form or
  // redirect. A stale cookie therefore cannot bounce visitors away from the
  // login page or loop with /dashboard.
  if (!hasSessionCookie(request) && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
