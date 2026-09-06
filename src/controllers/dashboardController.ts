import { Request, Response } from "express";
import { Assessment } from "../models/Assessment";
import { Assignment } from "../models/Assignment";
import { Attempt } from "../models/Attempt";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";
import { Question } from "../models/Question";

/**
 * GET /api/admin/dashboard/stats
 * Summary counts for the admin dashboard.
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const [
    totalAssessments,
    totalAssignments,
    totalActiveAssignments,
    totalQuestions,
    totalCandidates,
    candidatesAssignedIds,
    totalSubmissions
  ] = await Promise.all([
    Assessment.countDocuments({}),
    Assignment.countDocuments({}),
    Assignment.countDocuments({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }),
    Question.countDocuments({}),
    User.countDocuments({ role: "candidate" }),
    Attempt.distinct("candidateId"),
    Attempt.countDocuments({ status: "submitted" })
  ]);

  success(res, {
    totalAssessments,
    totalAssignments,
    totalActiveAssignments,
    totalQuestions,
    totalCandidates,
    candidatesAssigned: candidatesAssignedIds.length,
    totalSubmissions
  });
};

