// Opt out of static generation - all handlers connect to MongoDB at request time.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import mongoose from 'mongoose';
import User, { type IUser } from '@/models/User';
import { setAuthCookie } from '@/lib/auth';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { normalizeEmail } from '@/lib/normalize-email';

type LeanUser = mongoose.FlattenMaps<IUser> & { _id: mongoose.Types.ObjectId };

interface GoogleAuthRequestBody {
  idToken?: string;
}

export async function POST(req: Request) {
  // FIX: Guard body parsing inside a try...catch to intercept malformed request payloads gracefully
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  const { idToken } = body as GoogleAuthRequestBody;

  if (typeof idToken !== 'string' || !idToken.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // SECURITY: Verify the Firebase ID token server-side. The client can no
  // longer supply a trusted email/firebaseUid pair — identity is derived
  // from the verified token only.
  const verified = await verifyFirebaseIdToken(idToken.trim());

  if (!verified) {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token' },
      { status: 401 }
    );
  }

  const normalizedEmail = normalizeEmail(verified.email);

  let userDoc: LeanUser | null = null;
  try {
    await dbConnect();

    // First, try to find existing user by email
    let existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // User exists - link Firebase UID if not already linked
      // or update the Firebase UID if the user is linking a new Google account
      existingUser = await User.findOneAndUpdate(
        { email: normalizedEmail },
        {
          $set: {
            firebaseUid: verified.uid,
            authProvider: 'google',
          },
        },
        {
          new: true,
          lean: true,
        }
      );
      userDoc = existingUser;
    } else {
      // No existing user - create new user
      userDoc = await User.create({
        email: normalizedEmail,
        firebaseUid: verified.uid,
        authProvider: 'google',
        name: verified.name || '',
        avatarId: 'avatar-1',
        monthlyCarbon: 0,
        totalScanned: 0,
        joinedAt: new Date().toISOString(),
      });
      // Convert to lean document for consistent handling
      userDoc = userDoc.toObject();
    }
  } catch (err: any) {
    if (
      err?.code === 11000 ||
      (err?.name === 'MongoServerError' && err?.code === 11000)
    ) {
      // Handle race condition where user was created between our check and insert
      // Try to update the existing user with firebaseUid
      try {
        const updatedUser = await User.findOneAndUpdate(
          { email: normalizedEmail },
          {
            $set: {
              firebaseUid: verified.uid,
              authProvider: 'google',
            },
          },
          { new: true, lean: true }
        );
        if (updatedUser) {
          userDoc = updatedUser;
        }
      } catch (updateErr) {
        console.error(
          'Failed to link Firebase UID:',
          updateErr instanceof Error ? updateErr.message : 'Unknown error'
        );
        return NextResponse.json(
          { error: 'Failed to link account' },
          { status: 500 }
        );
      }
    } else {
      console.error(
        'Failed to upsert user in google route:',
        err instanceof Error ? err.message : 'Unknown error'
      );
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  if (!userDoc) {
    return NextResponse.json(
      { error: 'User processing failed' },
      { status: 500 }
    );
  }

  // Set the auth_token cookie so middleware can verify the session and
  // inject x-user-email on subsequent requests.
  await setAuthCookie(userDoc.email, userDoc._id.toString());

  // Map the MongoDB document back to the required frontend shape using safe fallbacks
  const user = {
    _id: userDoc._id,
    name: userDoc.name || '',
    email: userDoc.email || '',
    joinedAt: userDoc.createdAt
      ? new Date(userDoc.createdAt).toISOString().split('T')[0]
      : userDoc.joinedAt || '',
    monthlyCarbon: userDoc.monthlyCarbon || 0,
    totalScanned: userDoc.totalScanned || 0,
    avatarId: userDoc.avatarId || 'avatar-1',
    avatarCustomization: userDoc.avatarCustomization || {},
  };

  return NextResponse.json({ user }, { status: 200 });
}
