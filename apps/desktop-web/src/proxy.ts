import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "startica_session";

/**
 * Startica has no login: the app's server only listens on localhost, and every
 * request must carry the per-launch token the launcher generated. The desktop
 * window gets it as a cookie; a browser can open `/?token=…` once to get it.
 * This keeps other programs and websites on this machine out.
 */
function matches(candidate: string | undefined, token: string): boolean {
  if (!candidate || candidate.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
}

export function proxy(request: NextRequest) {
  const token = process.env.STARTICA_SESSION_TOKEN;
  if (!token) return new NextResponse("Startica must be started by its launcher (no session token).", { status: 503 });

  const offered = request.nextUrl.searchParams.get("token");
  if (matches(offered ?? undefined, token)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("token");
    const response = NextResponse.redirect(url);
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", path: "/" });
    return response;
  }
  if (matches(request.cookies.get(SESSION_COOKIE)?.value, token)) return NextResponse.next();
  return new NextResponse("Open Startica from the app.", { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
