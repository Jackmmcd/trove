import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isAppAllowed } from "@/lib/access/allowlist";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any redirect logic
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Machine-called endpoints carry no user session, so redirecting them to /login
  // would silently break the scheduled sync. They enforce CRON_SECRET themselves.
  const isMachineRoute =
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/advisor/corpus');

  // The Analyst demo on the landing page runs before login. It gates itself on the
  // email allowlist in lib/advisor/access.ts rather than a Supabase session.
  // The company page is reachable because the public Analyst links tickers to
  // it; it renders its own "sign in to view" state rather than bouncing a
  // visitor who was mid-conversation straight to a login form. Its data still
  // comes from /api/advisor/stock, which stays behind auth.
  const isPublicDemo =
    pathname.startsWith('/api/advisor/access') ||
    pathname.startsWith('/api/advisor/public-chat') ||
    pathname.startsWith('/api/advisor/tickers') ||
    pathname.startsWith('/api/advisor/stock') ||
    pathname.startsWith('/company/');

  // The installable-app shell. iOS fetches the manifest and the home-screen
  // icon while adding to the home screen, and the browser fetches /sw.js with
  // no page session at all — a redirect to /login hands back HTML where a
  // manifest or a script was expected, and the install silently does nothing.
  // None of these carry user data.
  const isAppShell =
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/apple-icon') ||
    pathname.startsWith('/icon');

  const isPublic =
    isMachineRoute ||
    isPublicDemo ||
    isAppShell ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/';

  // The front door. Supabase signups are open at the project level and the
  // publishable key ships in the client bundle, so a session can exist for
  // somebody who was never meant to have one — having no sign-up button in
  // the UI is not an access control. Anyone outside the allowlist is signed
  // out here rather than merely redirected: leaving the cookie in place would
  // bounce them between /login and /dashboard forever, because the login page
  // forwards any signed-in visitor to the app.
  if (user && !isAppAllowed(user.email) && !isAppShell) {
    await supabase.auth.signOut();

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('error', 'restricted');

    const redirect = NextResponse.redirect(url);
    // signOut() wrote the cleared auth cookies onto supabaseResponse; they
    // have to ride along on the redirect or the browser keeps the session.
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
