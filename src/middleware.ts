import { NextResponse, type NextRequest } from 'next/server';
import { PREVIEW_COOKIE, previewToken, safeEqual } from '@/lib/prelaunch-shared';

// Prelaunch lock. With PRELAUNCH_MODE=on every PAGE redirects to /prelaunch unless the visitor holds the
// preview cookie, issued by visiting /prelaunch/unlock?key=<PRELAUNCH_KEY>. /api is deliberately NOT
// gated (see matcher): Stripe/shipping webhooks and crons must keep landing, and routes carry their own auth.

const PUBLIC_PREFIXES = ['/prelaunch', '/legal'];

export async function middleware(req: NextRequest) {
  if (process.env.PRELAUNCH_MODE !== 'on') return NextResponse.next();

  const key = process.env.PRELAUNCH_KEY;
  const { pathname, searchParams } = req.nextUrl;

  if (pathname === '/prelaunch/unlock') {
    const given = searchParams.get('key') ?? '';
    if (key && given && safeEqual(given, key)) {
      const res = NextResponse.redirect(new URL('/', req.url));
      res.cookies.set(PREVIEW_COOKIE, await previewToken(key), {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
      });
      return res;
    }
    return NextResponse.redirect(new URL('/prelaunch', req.url));
  }

  const cookie = req.cookies.get(PREVIEW_COOKIE)?.value;
  const unlocked = !!key && !!cookie && safeEqual(cookie, await previewToken(key));

  if (unlocked || PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    const res = NextResponse.next();
    if (!pathname.startsWith('/prelaunch')) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  const to = new URL('/prelaunch', req.url);
  const ref = searchParams.get('ref');
  if (ref) to.searchParams.set('ref', ref);
  return NextResponse.redirect(to, 307);
}

export const config = {
  matcher: ['/((?!api/|_next/|sdk/v1/|.*\\.[a-zA-Z0-9]+$).*)'],
};
