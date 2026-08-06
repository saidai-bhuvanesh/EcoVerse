// CSP violation reporting endpoint
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/**
 * CSP violation reports are sent by browsers when a CSP policy is violated.
 * This endpoint receives and logs these reports for security monitoring.
 * In production, these should be sent to a SIEM or security monitoring service.
 */
export async function POST(req: Request) {
  try {
    const report = await req.json();

    // Log the violation for security monitoring
    // In production, send to your security monitoring service
    console.warn('[CSP Violation Report]', JSON.stringify(report));

    // Always return 204 No Content for CSP reports
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Even if parsing fails, return 204 to prevent browser from retrying
    console.error(
      '[CSP Report Error]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return new NextResponse(null, { status: 204 });
  }
}
