import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

export function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return ip;
}

export function checkRateLimit(request: Request): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const key = getRateLimitKey(request);
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + WINDOW_MS,
    };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const resetIn = Math.max(0, entry.resetTime - now);

  return {
    allowed: entry.count <= MAX_REQUESTS,
    remaining,
    resetIn,
  };
}

export function rateLimitResponse(request: Request) {
  const { allowed, remaining, resetIn } = checkRateLimit(request);

  const response = NextResponse.json(
    { error: 'Too many requests, please try again later.' },
    { status: 429 }
  );

  response.headers.set('X-RateLimit-Limit', String(MAX_REQUESTS));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
  response.headers.set('Retry-After', String(Math.ceil(resetIn / 1000)));

  return response;
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime + WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}, WINDOW_MS);
