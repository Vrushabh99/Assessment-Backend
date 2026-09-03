import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../models/User";
import { AppError } from "./errorHandler";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

type TokenPayload = JwtPayload & { id: string; role: UserRole };

export const signToken = (id: string, role: UserRole): string =>
  jwt.sign({ id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
};

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    next(new AppError("Invalid or expired authentication token", 401));
  }
};
