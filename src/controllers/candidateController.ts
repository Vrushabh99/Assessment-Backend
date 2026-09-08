import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

const candidateFields = "firstName lastName email createdAt updatedAt";

export const getCandidates = async (req: Request, res: Response) => {
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { role: "candidate" };

  if (search?.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = { $regex: escaped, $options: "i" };
    filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const [candidates, total] = await Promise.all([
    User.find(filter)
      .select(candidateFields)
      .sort({ firstName: 1, lastName: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    User.countDocuments(filter)
  ]);

  success(res, {
    candidates,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
  }, "Candidates fetched");
};

export const getCandidate = async (req: Request, res: Response) => {
  const { candidateId } = req.params;
  if (!isValidObjectId(candidateId)) throw new AppError("Invalid candidateId", 400);

  const candidate = await User.findOne({ _id: candidateId, role: "candidate" }).select(candidateFields);
  if (!candidate) throw new AppError("Candidate not found", 404);

  success(res, candidate, "Candidate fetched");
};

export const createCandidate = async (req: Request, res: Response) => {
  const { firstName, lastName, email, password } = req.body as Record<string, unknown>;

  if (typeof firstName !== "string" || typeof lastName !== "string" || typeof email !== "string" || typeof password !== "string") {
    throw new AppError("firstName, lastName, email and password are required", 400);
  }
  if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw new AppError("Email is already registered", 409);

  const candidate = await User.create({ firstName, lastName, email: normalizedEmail, password, role: "candidate" });
  const candidateObj = candidate.toObject();
  success(res, {
    _id: candidateObj._id,
    firstName: candidateObj.firstName,
    lastName: candidateObj.lastName,
    email: candidateObj.email,
    createdAt: candidateObj.createdAt,
    updatedAt: candidateObj.updatedAt
  }, "Candidate created", 201);
};

export const updateCandidate = async (req: Request, res: Response) => {
  const { candidateId } = req.params;
  if (!isValidObjectId(candidateId)) throw new AppError("Invalid candidateId", 400);

  const { firstName, lastName, email, password } = req.body as Record<string, unknown>;
  const candidate = await User.findOne({ _id: candidateId, role: "candidate" }).select("+password");
  if (!candidate) throw new AppError("Candidate not found", 404);

  if (firstName !== undefined) {
    if (typeof firstName !== "string" || !firstName.trim()) throw new AppError("firstName must be a non-empty string", 400);
    candidate.firstName = firstName;
  }
  if (lastName !== undefined) {
    if (typeof lastName !== "string" || !lastName.trim()) throw new AppError("lastName must be a non-empty string", 400);
    candidate.lastName = lastName;
  }
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) throw new AppError("email must be a non-empty string", 400);
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== candidate.email && await User.exists({ email: normalizedEmail })) {
      throw new AppError("Email is already registered", 409);
    }
    candidate.email = normalizedEmail;
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) throw new AppError("Password must be at least 8 characters", 400);
    candidate.password = password;
  }

  await candidate.save();
  const candidateObj = candidate.toObject();
  success(res, {
    _id: candidateObj._id,
    firstName: candidateObj.firstName,
    lastName: candidateObj.lastName,
    email: candidateObj.email,
    createdAt: candidateObj.createdAt,
    updatedAt: candidateObj.updatedAt
  }, "Candidate updated");
};

export const deleteCandidate = async (req: Request, res: Response) => {
  const { candidateId } = req.params as Record<string, string>;
  if (!isValidObjectId(candidateId)) throw new AppError("Invalid candidateId", 400);

  const candidate = await User.findOneAndDelete({ _id: candidateId, role: "candidate" });
  if (!candidate) throw new AppError("Candidate not found", 404);
  await deleteAllAttemptsForCandidate(candidateId)
  success(res, { _id: candidate._id }, "Candidate deleted");
};

import { Attempt, AttemptStatus } from "../models/Attempt";
import { deleteAllAttemptsForCandidate } from "./assignmentController";

const ATTEMPT_STATUSES: AttemptStatus[] = ["assigned", "in_progress", "submitted"];

/**
 * GET /api/admin/candidates/:candidateId/attempts
 * All attempts for a single candidate, across every assignment/assessment, paginated.
 */
export const getCandidateAttempts = async (req: Request, res: Response) => {
  const { candidateId } = req.params;
  if (!isValidObjectId(candidateId)) throw new AppError("Invalid candidateId", 400);

  const candidate = await User.findOne({ _id: candidateId, role: "candidate" }).select("_id firstName lastName email");
  if (!candidate) throw new AppError("Candidate not found", 404);

  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { candidateId };
  if (status) {
    if (!ATTEMPT_STATUSES.includes(status as AttemptStatus)) {
      throw new AppError(`Invalid status. Must be one of: ${ATTEMPT_STATUSES.join(", ")}`, 400);
    }
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [attempts, total] = await Promise.all([
    Attempt.find(filter)
      .populate("assessmentId", "title totalPoints questionIds")
      .populate("assignmentId", "durationMinutes expiresAt status")
      .select("assessmentId assignmentId status startedAt submittedAt scoreObtained totalMarks isFullyScored createdAt")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Attempt.countDocuments(filter)
  ]);

  const results = attempts.map((attempt: any) => ({
    attemptId: attempt._id,
    assessment: attempt.assessmentId,
    assignment: attempt.assignmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    score: attempt.status === "submitted" ? attempt.scoreObtained : null,
    totalMarks: attempt.status === "submitted" ? attempt.totalMarks : null,
    isFullyScored: attempt.isFullyScored,
    createdAt: attempt.createdAt
  }));

  success(res, {
    candidate,
    attempts: results,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
  }, "Candidate attempts fetched");
};