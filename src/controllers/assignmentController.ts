import { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { Assessment } from "../models/Assessment";
import { Assignment } from "../models/Assignment";
import { Attempt } from "../models/Attempt";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

const defaultViolationLimits = {
  tab_switch: 3,
  window_blur: 3,
  fullscreen_exit: 2,
  copy: 2,
  paste: 2,
  right_click: 5
};

/**
 * POST /api/admin/assessments/:assessmentId/assign
 * Admin assigns an assessment to a batch of candidates.
 */
export const assignAssessment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assessmentId } = req.params;
  const { candidateIds, durationMinutes, violationLimits, expiresAt, description, assignmentId } = req.body as Record<
    string,
    unknown
  >;

  if (!isValidObjectId(assessmentId)) {
    throw new AppError("Invalid assessmentId", 400);
  }
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new AppError("candidateIds must be a non-empty array", 400);
  }

  const assessment = await Assessment.findById(assessmentId).select("_id status");
  if (!assessment) {
    throw new AppError("Assessment not found", 404);
  }
  if (assessment.status !== "published") {
    throw new AppError("Only published assessments can be assigned", 400);
  }

  let existingAssignment = null as any;
  if (assignmentId !== undefined && assignmentId !== null) {
    if (!isValidObjectId(String(assignmentId))) {
      throw new AppError("Invalid assignmentId", 400);
    }

    existingAssignment = await Assignment.findById(assignmentId);
    if (!existingAssignment) {
      throw new AppError("Assignment not found", 404);
    }
    if (existingAssignment.assessmentId.toString() !== assessmentId) {
      throw new AppError("Assignment does not belong to this assessment", 400);
    }
  }

  if (typeof durationMinutes !== "number" || durationMinutes < 1) {
    throw new AppError("durationMinutes must be a positive number", 400);
  }

  const validCandidates = await User.find({
    _id: { $in: candidateIds },
    role: "candidate"
  }).select("_id");

  const validCandidateIdSet = new Set(validCandidates.map((c) => c._id.toString()));
  const invalidCandidateIds = (candidateIds as string[]).filter((id) => !validCandidateIdSet.has(id));

  if (validCandidateIdSet.size === 0) {
    throw new AppError("None of the provided candidateIds are valid", 400);
  }

  const assignment = existingAssignment ?? (await Assignment.create({
    assessmentId,
    assignedBy: req.user.id,
    durationMinutes,
    violationLimits: { ...defaultViolationLimits, ...((violationLimits as object) ?? {}) },
    expiresAt: expiresAt ? new Date(expiresAt as string) : null,
    description
  }));

  if (!existingAssignment) {
    assignment.durationMinutes = durationMinutes;
    assignment.violationLimits = { ...defaultViolationLimits, ...((violationLimits as object) ?? {}) };
    assignment.expiresAt = expiresAt ? new Date(expiresAt as string) : null;
    assignment.description = description as string | undefined;
    await assignment.save();
  }

  const existingAttempts = await Attempt.find({
    assessmentId,
    candidateId: { $in: Array.from(validCandidateIdSet) }
  }).select("candidateId assignmentId").lean();

  const alreadyAssignedMap = new Map(
    existingAttempts.map((attempt: any) => [attempt.candidateId.toString(), attempt.assignmentId.toString()])
  );

  const attemptDocs = Array.from(validCandidateIdSet)
    .filter((candidateId) => !alreadyAssignedMap.has(candidateId))
    .map((candidateId) => ({
      assignmentId: assignment._id,
      assessmentId,
      candidateId,
      status: "assigned" as const
    }));

  const insertResult = await Attempt.insertMany(attemptDocs, { ordered: false }).catch((err) => {
    if (err.writeErrors || err.name === "MongoBulkWriteError") {
      return err.insertedDocs ?? [];
    }
    throw err;
  });

  const assignedIdSet = new Set(insertResult.map((a: any) => a.candidateId.toString()));
  const alreadyAssigned = Array.from(validCandidateIdSet).filter((id) => !assignedIdSet.has(id));

  assignment.studentCount = await Attempt.countDocuments({ assignmentId: assignment._id });
  await assignment.save();

  success(
    res,
    {
      assignment,
      assignmentId: assignment._id,
      studentsAssigned: insertResult.length,
      skipped: { invalidCandidateIds, alreadyAssigned }
    },
    "Assessment assigned",
    201
  );
};

/**
 * PATCH /api/admin/assignments/:assignmentId
 * Admin edits assignment config. Blocked once any candidate has started.
 */
export const updateAssignment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  const { durationMinutes, violationLimits, expiresAt, description } = req.body as Record<string, unknown>;

  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }
  if (assignment.status === "cancelled") {
    throw new AppError("Cannot edit a cancelled assignment", 400);
  }

  const startedCount = await Attempt.countDocuments({
    assignmentId,
    status: { $in: ["in_progress", "submitted"] }
  });
  if (startedCount > 0) {
    throw new AppError("Cannot edit an assignment once a candidate has started", 400);
  }

  if (durationMinutes !== undefined) {
    if (typeof durationMinutes !== "number" || durationMinutes < 1) {
      throw new AppError("durationMinutes must be a positive number", 400);
    }
    assignment.durationMinutes = durationMinutes;
  }

  if (violationLimits !== undefined) {
    if (typeof violationLimits !== "object" || violationLimits === null) {
      throw new AppError("violationLimits must be an object", 400);
    }
    assignment.violationLimits = { ...assignment.violationLimits, ...(violationLimits as object) };
  }

  if (expiresAt !== undefined) {
    assignment.expiresAt = expiresAt ? new Date(expiresAt as string) : null;
  }

  if (description !== undefined) {
    assignment.description = description as string;
  }

  await assignment.save();

  success(res, assignment, "Assignment updated");
};

/**
 * DELETE /api/admin/assignments/:assignmentId
 * Admin permanently deletes an assignment and all its associated attempts.
 */
export const deleteAssignment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }

  const { deletedCount } = await Attempt.deleteMany({ assignmentId });
  await assignment.deleteOne();

  success(
    res,
    { assignmentId, attemptsDeleted: deletedCount },
    "Assignment and associated attempts deleted"
  );
};

/**
 * POST /api/admin/assignments/:assignmentId/cancel
 * Admin cancels an assignment.
 */
export const cancelAssignment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }
  if (assignment.status === "cancelled") {
    throw new AppError("Assignment is already cancelled", 400);
  }

  assignment.status = "cancelled";
  await assignment.save();

  success(res, assignment, "Assignment cancelled");
};

/**
 * GET /api/admin/assignments
 * Admin's global assignments list, filterable + paginated.
 */
export const getAssignments = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assessmentId, status, page = "1", limit = "20" } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};
  if (assessmentId) {
    if (!isValidObjectId(assessmentId)) throw new AppError("Invalid assessmentId", 400);
    filter.assessmentId = assessmentId;
  }
  if (status) {
    if (!["active", "cancelled"].includes(status)) throw new AppError("Invalid status", 400);
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [assignments, total] = await Promise.all([
    Assignment.find(filter)
      .populate("assessmentId", "title totalPoints description")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Assignment.countDocuments(filter)
  ]);

  success(
    res,
    {
      assignments,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    },
    "Assignments fetched"
  );
};

/**
 * GET /api/admin/assignments/:assignmentId
 * Admin's assignment detail — config + per-student status list.
 */
export const getAssignmentDetail = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const assignment = await Assignment.findById(assignmentId)
    .populate("assessmentId", "title description totalPoints")
    .populate("assignedBy", "name email")
    .lean();
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }

  const attempts = await Attempt.find({ assignmentId })
    .populate("candidateId", "name email")
    .select("candidateId status startedAt submittedAt scoreObtained")
    .sort({ createdAt: -1 })
    .lean();

  const summary = attempts.reduce(
    (acc, a) => {
      acc.total++;
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, assigned: 0, in_progress: 0, submitted: 0 } as Record<string, number>
  );

  success(
    res,
    {
      assignment,
      summary,
      students: attempts.map((a) => ({
        attemptId: a._id,
        candidate: a.candidateId,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        score: a.scoreObtained
      }))
    },
    "Assignment detail fetched"
  );
};

/**
 * GET /api/candidate/assessments
 * Candidate's own assigned assessments, with derived accessibility.
 */
export const getMyAssessments = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const attempts = await Attempt.find({ candidateId: req.user.id })
    .select("status scoreObtained assignmentId assessmentId")
    .populate({ path: "assignmentId", select: "expiresAt status durationMinutes description" })
    .populate({ path: "assessmentId", select: "title description" })
    .sort({ createdAt: -1 })
    .lean();

  const now = new Date();

  const assessments = attempts.map((attempt) => {
    const assignment = attempt.assignmentId as any;
    const assessment = attempt.assessmentId as any;

    const isExpired = assignment.expiresAt ? new Date(assignment.expiresAt) < now : false;
    const isCancelled = assignment.status === "cancelled";

    let accessible = true;
    let reason: string | null = null;
    if (isCancelled) {
      accessible = false;
      reason = "cancelled";
    } else if (isExpired && attempt.status !== "submitted") {
      accessible = false;
      reason = "expired";
    }

    return {
      attemptId: attempt._id,
      assessmentId: assessment._id,
      title: assessment.title,
      description: assessment.description,
      durationMinutes: assignment.durationMinutes,
      expiresAt: assignment.expiresAt,
      status: attempt.status,
      score: attempt.status === "submitted" ? attempt.scoreObtained : null,
      accessible,
      reason
    };
  });

  success(res, assessments, "Assessments fetched");
};

/**
 * GET /api/admin/candidates
 * Admin/Creator gets candidates list with optional search and pagination.
 */
export const getCandidates = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { role: "candidate" };

  if (search) {
    const trimmed = search.trim();
    if (trimmed) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = { $regex: escaped, $options: "i" };
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex }
      ];
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  const [candidates, total] = await Promise.all([
    User.find(filter)
      .select("firstName lastName email createdAt")
      .sort({ firstName: 1, lastName: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    User.countDocuments(filter)
  ]);

  success(
    res,
    {
      candidates,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    },
    "Candidates fetched"
  );
};
