import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from "express";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { setAuthCookie, signToken } from "../middleware/auth";
import { success } from "../utils/response";
import { env } from '../config/env';
import { assignDefaultAssessments } from './assignmentController';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
interface GoogleAuthRequestBody {
  credential: string;
}

interface ExtractedGoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  googleId: string;
}

export const register = async (req: Request, res: Response) => {
  const { firstName, lastName, email, password } = req.body as Record<string, string>;

  if (!firstName || !lastName || !email || !password) {
    throw new AppError("firstName, lastName, email and password are required", 400);
  }

  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError("Email is already registered", 409);
  }

  const user = await User.create({
    firstName,
    lastName,
    email: normalizedEmail,
    password,
    role: "candidate"
  });

  const token = signToken(user.id, user.role);
  setAuthCookie(res, token);

  success(
    res,
    {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    },
    "Registered",
    201
  );
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as Record<string, string>;

  if (!email || !password) {
    throw new AppError("email and password are required", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signToken(user.id, user.role);
  setAuthCookie(res, token);

  success(res, {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    }
  }, "Logged in");
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie("token");
  success(res, null, "Logged out");
};

export const me = async (req: Request, res: Response) => {
  const user = await User.findById(req.user?.id).select("-password").lean();

  if (!user) {
    throw new AppError("User not found", 400);
  }

  success(res, {
    ...user,
    id: user._id,
  });
};

function extractProfile(payload: TokenPayload): ExtractedGoogleProfile {
  const { email, given_name, family_name, name, picture, sub } = payload;

  if (!email) {
    throw new AppError('Google payload missing email', 401);
  }

  let firstName = given_name ?? '';
  let lastName = family_name ?? '';

  if (!firstName && !lastName && name) {
    const parts = name.trim().split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ') || '';
  }

  return {
    email,
    firstName,
    lastName,
    picture,
    googleId: sub,
  };
}

export const googleAuthHandler = async (
  req: Request<{}, {}, GoogleAuthRequestBody>,
  res: Response
): Promise<void> => {
    const { credential } = req.body;

    if (!credential) {
      throw new AppError("Credential Missing", 400);
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new AppError("Invalid Token", 400);
    }

    const profile = extractProfile(payload);

    let user = await User.findOne({ email: profile.email });
    if (!user) {
      user = await User.create({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        picture: profile.picture,
        googleId: profile.googleId,
        authProvider: 'google',
      });
      await assignDefaultAssessments(user)
    }

    const token = signToken(user.id, user.role);
    setAuthCookie(res, token);

    success(res, {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    }, "Logged in with google");
};
