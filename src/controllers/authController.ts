import { Request, Response } from "express";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { setAuthCookie, signToken } from "../middleware/auth";
import { success } from "../utils/response";

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
    throw new AppError("User not found", 404);
  }

  success(res, {
    ...user,
    id: user._id,
  });
};
