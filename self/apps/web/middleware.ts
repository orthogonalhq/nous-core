import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_ENV = process.env.NOUS_BASIC_AUTH;

export function middleware(request: NextRequest) {
  if (!AUTH_ENV) {
    return NextResponse.next();
  }

  const parts = AUTH_ENV.split(':');
  const expectedUser = parts[0];
  const expectedPass = parts[1] ?? '';

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Nous"',
      },
    });
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const [user, pass] = decoded.split(':');
    if (user === expectedUser && pass === expectedPass) {
      return NextResponse.next();
    }
  } catch {
    // ignore
  }

  return new NextResponse('Invalid credentials', { status: 401 });
}

export const config = {
  matcher: ['/api/trpc/:path*', '/chat', '/traces', '/memory', '/config'],
};
