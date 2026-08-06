// Opt out of static generation - all handlers connect to MongoDB at request time.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { setAuthCookie } from '@/lib/auth';
import { normalizeEmail } from '@/lib/normalize-email';

export async function POST(req: Request) {
  try {
    await dbConnect();

    const { email, password } = await req.json();
    const normalizedEmail =
      typeof email === 'string' ? normalizeEmail(email) : '';

    // Generic error message to prevent user enumeration
    const genericError = { error: 'Invalid credentials' };

    const user = await User.findOne({ email: normalizedEmail });

    // Return generic error for any auth failure to prevent user enumeration
    if (!user || !user.password) {
      // Delay to mitigate timing attacks
      await new Promise((resolve) => setTimeout(resolve, 100));
      return NextResponse.json(genericError, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // Delay to mitigate timing attacks
      await new Promise((resolve) => setTimeout(resolve, 100));
      return NextResponse.json(genericError, { status: 401 });
    }

    const userData = {
      _id: user._id,
      email: user.email,
      name: user.name,
      monthlyCarbon: user.monthlyCarbon || 0,
      totalScanned: user.totalScanned || 0,
      joinedAt:
        user.createdAt?.toISOString().split('T')[0] ||
        new Date().toISOString().split('T')[0],
    };

    // Set the auth_token cookie so middleware can verify the session and
    // inject x-user-email on subsequent requests, matching the behavior
    // already implemented for Google Sign-In.
    await setAuthCookie(user.email, user._id.toString());

    return NextResponse.json({ user: userData }, { status: 200 });
  } catch (error) {
    console.error(
      'Signin error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
