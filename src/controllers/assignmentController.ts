import { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { Assessment } from "../models/Assessment";
import { Assignment } from "../models/Assignment";
import { Attempt } from "../models/Attempt";
import { User } from "../models/User";
import { Question } from "../models/Question";
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
      .populate("assignedBy", "firstName lastName email")
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
    .populate("assessmentId", "title description totalPoints questionIds")
    .populate("assignedBy", "name email")
    .lean();
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }

  

  success(
    res,
    {
      ...assignment,
      questionCount: (assignment.assessmentId as any)?.questionIds?.length || 0
    },
    "Assignment detail fetched"
  );
};

/**
 * GET /api/admin/assignments/:assignmentId/candidates
 * Get all candidates assigned to an assignment with their attempt details.
 * Supports filtering by status and searching by candidate name or email using MongoDB aggregation.
 */
export const getAssignmentCandidates = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  const { status, page = "1", limit = "50", search } = req.query as Record<string, string>;

  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const assignment = await Assignment.findById(assignmentId)
    .populate("assessmentId", "title totalPoints description")
    .lean() as any;
  if (!assignment) {
    throw new AppError("Assignment not found", 404);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  // Build aggregation pipeline
  const pipeline: any[] = [];

  // Step 1: Match assignment
  pipeline.push({
    "$match": { assignmentId: new Types.ObjectId(String(assignmentId)) }
  });

  // Step 2: Add status filter if provided
  if (status) {
    if (!["assigned", "in_progress", "submitted", "graded"].includes(status)) {
      throw new AppError("Invalid status. Must be one of: assigned, in_progress, submitted", 400);
    }
    if (['submitted', 'graded'].includes(status)) {
      pipeline.push({ "$match": { status: 'submitted' } });
      pipeline.push({ "$match": { isFullyScored: status === 'graded' } });
    } else {
      pipeline.push({ "$match": { status } });
    }
  }

  // Step 3: Lookup candidate
  pipeline.push({
    "$lookup": {
      from: "users",
      localField: "candidateId",
      foreignField: "_id",
      as: "candidateData"
    }
  });
  pipeline.push({ "$unwind": "$candidateData" });

  // Step 4: Add search filter on name and email
  if (search && search.trim()) {
    const searchRegex = search.trim().split(/\s+/).join("|");
    pipeline.push({
      "$match": {
        $or: [
          { "candidateData.firstName": { $regex: searchRegex, $options: "i" } },
          { "candidateData.lastName": { $regex: searchRegex, $options: "i" } },
          { "candidateData.email": { $regex: searchRegex, $options: "i" } }
        ]
      }
    });
  }

  // Step 5: Lookup assessment
  pipeline.push({
    "$lookup": {
      from: "assessments",
      localField: "assessmentId",
      foreignField: "_id",
      as: "assessmentData"
    }
  });
  pipeline.push({ "$unwind": "$assessmentData" });

  // Step 6: Sort by creation time
  pipeline.push({ "$sort": { createdAt: 1 } });

  // Step 7: Use facet to get count and paginated data
  pipeline.push({
    "$facet": {
      metadata: [{ "$count": "total" }],
      data: [
        { "$skip": (pageNum - 1) * limitNum },
        { "$limit": limitNum },
        {
          "$project": {
            attemptId: "$_id",
            candidateId: "$candidateData._id",
            firstName: "$candidateData.firstName",
            lastName: "$candidateData.lastName",
            email: "$candidateData.email",
            attemptStatus: "$status",
            startedAt: 1,
            submittedAt: 1,
            scoreObtained: 1,
            isFullyScored: 1,
            violationCounts: 1,
            autoSubmittedReason: 1,
            totalMarks: "$assessmentData.totalPoints"
          }
        }
      ]
    }
  });

  const result = await Attempt.aggregate(pipeline);
  const facetResult = result[0] || {};
  const total = facetResult.metadata?.[0]?.total || 0;
  const data = facetResult.data || [];

  // Transform data to response format
  const candidatesList = data.map((item: any) => {
    const totalViolations = Object.values(item.violationCounts || {}).reduce(
      (sum: number, count: any) => sum + (typeof count === "number" ? count : 0),
      0
    );

    const needsReview =
      item.autoSubmittedReason !== null ||
      item.isFullyScored === false ||
      totalViolations > 0;

    return {
      attemptId: item.attemptId,
      id: item.candidateId,
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email,
      fullName: `${item.firstName} ${item.lastName}`,
      status: item.attemptStatus,
      startedAt: item.startedAt,
      submittedAt: item.submittedAt,
      score: item.scoreObtained,
      totalPoints: item.totalMarks,
      isFullyScored: item.isFullyScored,
      autoSubmitted: {
        reason: item.autoSubmittedReason,
        enabled: item.autoSubmittedReason !== null
      },
      violations: {
        total: totalViolations,
        details: item.violationCounts || {}
      },
      needsManualReview: needsReview,
      lastActivityAt: item.submittedAt || item.startedAt || null
    };
  });

  // Calculate summary by running a separate aggregation
  const summaryPipeline: any[] = [];
  summaryPipeline.push({
    "$match": { assignmentId: new Types.ObjectId(String(assignmentId)) }
  });
  if (status) {
    summaryPipeline.push({ "$match": { status } });
  }
  if (search && search.trim()) {
    summaryPipeline.push({
      "$lookup": {
        from: "users",
        localField: "candidateId",
        foreignField: "_id",
        as: "candidateData"
      }
    });
    summaryPipeline.push({ "$unwind": "$candidateData" });
    const searchRegex = search.trim().split(/\s+/).join("|");
    summaryPipeline.push({
      "$match": {
        $or: [
          { "candidateData.firstName": { $regex: searchRegex, $options: "i" } },
          { "candidateData.lastName": { $regex: searchRegex, $options: "i" } },
          { "candidateData.email": { $regex: searchRegex, $options: "i" } }
        ]
      }
    });
  }
  summaryPipeline.push({
    "$group": {
      _id: "$status",
      count: { $sum: 1 }
    }
  });

  const summaryResults = await Attempt.aggregate(summaryPipeline);
  const summary = {
    total,
    assigned: 0,
    in_progress: 0,
    submitted: 0,
    flagged: 0
  };

  summaryResults.forEach((result: any) => {
    const statusKey = result._id || "assigned";
    if (summary.hasOwnProperty(statusKey)) {
      (summary as any)[statusKey] = result.count;
    }
  });

  // Count flagged (violations or auto-submitted)
  summary.flagged = data.filter((item: any) => {
    const violations = Object.values(item.violationCounts || {}).reduce(
      (sum: number, count: any) => sum + (typeof count === "number" ? count : 0),
      0
    );
    return violations > 0 || item.autoSubmittedReason !== null;
  }).length;

  success(
    res,
    {
      assignment: {
        id: assignment._id,
        assessmentId: assignment.assessmentId,
        durationMinutes: assignment.durationMinutes,
        expiresAt: assignment.expiresAt,
        status: assignment.status,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      },
      summary,
      candidates: candidatesList,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    },
    "Assignment candidates fetched"
  );
};

/**
 * GET /api/candidate/assessments
 * Candidate's own assigned assessments, with derived accessibility.
 */
export const getMyAssessments = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { status } = req.query;
  const filter: Record<string, unknown> = {
    candidateId: req.user.id,
  };
  if (status) {
    if (status === 'graded') {
      filter.status = 'submitted';
      filter.isFullyScored = true;
    }
    else if (status === 'submitted') {
      filter.status = status;
      filter.isFullyScored = false;
    } else {
      filter.status = status;
    }
  }

  const attempts = await Attempt.find(filter)
    .select("status scoreObtained assignmentId assessmentId isFullyScored")
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
      isFullyScored: attempt.isFullyScored,
      assessmentId: assessment._id,
      assignmentId: assignment._id,
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
 * GET /api/candidate/assessments/:assessmentId
 * Candidate launch payload for an assigned assessment.
 */
export const getCandidateAssessment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assessmentId, assignmentId } = req.params;
  if (!isValidObjectId(assessmentId) || !isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assessmentId or assignmentId", 400);
  }

  const attempt = await Attempt.findOne({
    assessmentId,
    assignmentId,
    candidateId: req.user.id
  })
    .select("_id assessmentId assignmentId candidateId status startedAt submittedAt answers")
    .lean();

  if (!attempt) {
    throw new AppError("Assessment is not assigned to this candidate", 404);
  }

  const assignment = await Assignment.findOne({
    _id: assignmentId,
    assessmentId
  })
    .select("_id assessmentId expiresAt durationMinutes violationLimits status description")
    .lean();
  if (!assignment) throw new AppError("Assignment is invalid for this assessment", 400);

  const assessment = await Assessment.findOne({
    _id: assessmentId,
    status: "published"
  })
    .select("_id title questionIds totalPoints")
    .lean();

  if (!assessment) {
    throw new AppError("Published assessment not found", 404);
  }

  const questions = await Question.find({
    _id: { $in: assessment.questionIds }
  })
    .select("_id questionText type difficulty points qp_number additionalInfo.options")
    .lean();

  const questionById = new Map(questions.map((question) => [question._id.toString(), question]));
  const orderedQuestions = assessment.questionIds
    .map((questionId) => questionById.get(questionId.toString()))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));

  success(res, {
    attempt: {
      id: attempt._id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt
    },
    assignment: {
      id: assignment._id,
      durationMinutes: assignment.durationMinutes,
      expiresAt: assignment.expiresAt,
      violationLimits: assignment.violationLimits,
      description: assignment.description,
      status: assignment.status
    },
    assessment: {
      id: assessment._id,
      title: assessment.title,
      totalPoints: assessment.totalPoints,
      questions: orderedQuestions
    }
  }, "Assessment fetched");
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
