import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Attempt, ViolationType } from "../models/Attempt";
import { Assignment } from "../models/Assignment";
import { Assessment } from "../models/Assessment";
import { Question } from "../models/Question";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

const violationTypes: ViolationType[] = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "copy",
  "paste",
  "right_click"
];

const getOwnedAttempt = async (req: Request) => {
  if (!req.user) throw new AppError("Authentication required", 401);
  const { assignmentId } = req.params;
  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  const attempt = await Attempt.findOne({ assignmentId, candidateId: req.user.id });
  if (!attempt) throw new AppError("Assessment is not assigned to this candidate", 404);
  return attempt;
};

const getAssignmentOrThrow = async (assignmentId: string) => {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError("Assignment not found", 404);
  return assignment;
};

const assertAssignmentUsable = (assignment: InstanceType<typeof Assignment>) => {
  if (assignment.status === "cancelled") throw new AppError("This assignment has been cancelled", 400);
  if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
    throw new AppError("This assignment has expired", 400);
  }
};

const getRemainingMs = (startedAt: Date, durationMinutes: number): number => {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
  return deadline - Date.now();
};

const enforceTimer = async (
  attempt: InstanceType<typeof Attempt>,
  assignment: InstanceType<typeof Assignment>
): Promise<void> => {
  if (attempt.status !== "in_progress" || !attempt.startedAt) return;
  const remainingMs = getRemainingMs(attempt.startedAt, assignment.durationMinutes);
  if (remainingMs <= 0) {
    await finalizeSubmission(attempt, "timer_expired");
  }
};

const scoreObjectiveAnswer = (
  question: { additionalInfo: { correctAnswers?: number[] }; points: number },
  selectedOptionIds?: number[]
): { isCorrect: boolean; marksObtained: number } => {
  const correct = [...(question.additionalInfo.correctAnswers ?? [])].sort();
  const selected = [...(selectedOptionIds ?? [])].sort();
  const isCorrect = correct.length > 0 && JSON.stringify(correct) === JSON.stringify(selected);
  return { isCorrect, marksObtained: isCorrect ? question.points : 0 };
};

const finalizeSubmission = async (
  attempt: InstanceType<typeof Attempt>,
  autoSubmittedReason: "timer_expired" | "violation_limit_exceeded" | null = null,
  autoSubmittedViolationType: ViolationType | null = null
) => {
  const assessment = await Assessment.findById(attempt.assessmentId).select("questionIds").lean();
  if (!assessment) throw new AppError("Assessment not found", 404);

  const questions = await Question.find({ _id: { $in: assessment.questionIds } });
  const questionMap = new Map(questions.map((question) => [question._id.toString(), question]));
  const answerByQuestionId = new Map(
    attempt.answers.map((answer) => [answer.questionId.toString(), answer])
  );

  let totalMarks = 0;
  let scoreObtained = 0;
  let isFullyScored = true;

  // Iterate the assessment's FULL question list — not just what the
  // candidate happened to answer — so skipped questions still count
  // toward totalMarks (as 0 marks) instead of shrinking the denominator.
  for (const questionId of assessment.questionIds) {
    const question = questionMap.get(questionId.toString());
    if (!question) continue; // question deleted after being assigned — excluded from scoring
    totalMarks += question.points;

    const answer = answerByQuestionId.get(questionId.toString());

    if (question.type === "short-answer") {
      if (answer) {
        answer.isCorrect = null;
        answer.marksObtained = 0;
        answer.needsManualReview = true;
        isFullyScored = false;
      }
      // Left blank entirely — nothing to manually review, stays at 0 marks.
      continue;
    }

    if (!answer) continue; // objective question skipped — 0 marks, no answer doc to score

    const result = scoreObjectiveAnswer(question, answer.selectedOptionIds as unknown as number[]);
    answer.isCorrect = result.isCorrect;
    answer.marksObtained = result.marksObtained;
    answer.needsManualReview = false;
    scoreObtained += result.marksObtained;
  }

  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.totalMarks = totalMarks;
  attempt.scoreObtained = scoreObtained;
  attempt.isFullyScored = isFullyScored;
  attempt.autoSubmittedReason = autoSubmittedReason;
  attempt.autoSubmittedViolationType = autoSubmittedViolationType;

  await attempt.save();
};

/**
 * POST /api/candidate/assignments/:assignmentId/start
 * Starts (first call) or resumes (subsequent calls) a candidate's attempt.
 */
export const startAttempt = async (req: Request, res: Response) => {
  const attempt = await getOwnedAttempt(req);
  if (attempt.status === "submitted") throw new AppError("This attempt has already been submitted", 400);

  const assignment = await getAssignmentOrThrow(String(attempt.assignmentId));
  assertAssignmentUsable(assignment);

  if (!attempt.startedAt) {
    attempt.startedAt = new Date();
    attempt.status = "in_progress";
    await attempt.save();
  }

  await enforceTimer(attempt, assignment);
  // Return full attempt state like getAttemptState does
  const assessment = await Assessment.findById(attempt.assessmentId)
    .select("title questionIds totalPoints")
    .lean();

  if (!assessment) throw new AppError("Assessment not found", 404);

  const questionDocs = await Question.find({ _id: { $in: assessment.questionIds } })
    .select("_id questionText type points additionalInfo.options")
    .lean();
  const questionById = new Map(questionDocs.map((question) => [question._id.toString(), question]));
  const orderedQuestions = assessment.questionIds
    .map((questionId) => questionById.get(questionId.toString()))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));

  const expiresAt = new Date(new Date(attempt.startedAt).getTime() + assignment.durationMinutes * 60 * 1000);

  success(res, {
    attemptId: attempt._id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    expiresAt,
    serverTime: new Date(),
    durationMinutes: assignment.durationMinutes,
    violationLimits: assignment.violationLimits,
    violationCounts: attempt.violationCounts,
    assessment: {
      title: assessment.title,
      totalPoints: assessment.totalPoints,
      questions: orderedQuestions
    },
    answers: attempt.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds,
      textAnswer: answer.textAnswer
    })),
    score: null,
    totalMarks: null,
    isFullyScored: null
  }, "Attempt started");
};

/**
 * GET /api/candidate/assignments/:assignmentId/attempt
 * Returns full attempt state (questions without answer keys, saved answers, remaining time) for resuming.
 */
export const getAttemptState = async (req: Request, res: Response) => {
  const attempt = await getOwnedAttempt(req);
  const assignment = await getAssignmentOrThrow(String(attempt.assignmentId));

  if (attempt.status !== "submitted") {
    assertAssignmentUsable(assignment);
    await enforceTimer(attempt, assignment);
  }

  const assessment = await Assessment.findById(attempt.assessmentId)
    .select("title questionIds totalPoints")
    .lean();
  if (!assessment) throw new AppError("Assessment not found", 404);

  const questionDocs = await Question.find({ _id: { $in: assessment.questionIds } })
    .select("_id questionText type points additionalInfo.options")
    .lean();
  const questionById = new Map(questionDocs.map((question) => [question._id.toString(), question]));
  const orderedQuestions = assessment.questionIds
    .map((questionId) => questionById.get(questionId.toString()))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));

  const expiresAt = attempt.startedAt
    ? new Date(new Date(attempt.startedAt).getTime() + assignment.durationMinutes * 60 * 1000)
    : null;

  success(res, {
    attemptId: attempt._id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    expiresAt,
    serverTime: new Date(),
    durationMinutes: assignment.durationMinutes,
    violationLimits: assignment.violationLimits,
    violationCounts: attempt.violationCounts,
    assessment: {
      title: assessment.title,
      totalPoints: assessment.totalPoints,
      questions: orderedQuestions
    },
    answers: attempt.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds,
      textAnswer: answer.textAnswer
    })),
    score: attempt.status === "submitted" ? attempt.scoreObtained : null,
    totalMarks: attempt.status === "submitted" ? attempt.totalMarks : null,
    isFullyScored: attempt.status === "submitted" ? attempt.isFullyScored : null
  }, "Attempt fetched");
};

/**
 * PATCH /api/candidate/assignments/:assignmentId/answers
 * Autosaves a single question's answer.
 */
export const saveAnswer = async (req: Request, res: Response) => {
  const attempt = await getOwnedAttempt(req);
  if (attempt.status === "submitted") throw new AppError("Cannot edit a submitted attempt", 400);
  if (attempt.status !== "in_progress") throw new AppError("Attempt has not been started", 400);

  const assignment = await getAssignmentOrThrow(String(attempt.assignmentId));
  await enforceTimer(attempt, assignment);

  if ((attempt.status as string) === "submitted") {
    throw new AppError("Time is up for this attempt; it has been auto-submitted", 400);
  }

  const { questionId, selectedOptionIds, textAnswer } = req.body as Record<string, unknown>;
  if (typeof questionId !== "string" || !isValidObjectId(questionId)) {
    throw new AppError("questionId must be a valid id", 400);
  }

  const existing = attempt.answers.find((answer) => answer.questionId.toString() === questionId);
  const parsedOptionIds = Array.isArray(selectedOptionIds)
    ? selectedOptionIds.filter((id): id is number => typeof id === "number")
    : undefined;

  if (existing) {
    if (parsedOptionIds !== undefined) existing.selectedOptionIds = parsedOptionIds as any;
    if (typeof textAnswer === "string") existing.textAnswer = textAnswer;
  } else {
    attempt.answers.push({
      questionId: questionId as any,
      selectedOptionIds: parsedOptionIds as any,
      textAnswer: typeof textAnswer === "string" ? textAnswer : undefined,
      isCorrect: null,
      marksObtained: 0,
      needsManualReview: false
    } as any);
  }

  await attempt.save();
  success(res, { saved: true }, "Answer saved");
};

/**
 * POST /api/candidate/assignments/:assignmentId/violations
 * Logs a proctoring event and auto-submits when the configured violation limit is exceeded.
 */
export const logViolation = async (req: Request, res: Response) => {
  const attempt = await getOwnedAttempt(req);
  if (attempt.status === "submitted") throw new AppError("Attempt already submitted", 400);

  const { type } = req.body as Record<string, unknown>;
  if (typeof type !== "string" || !violationTypes.includes(type as ViolationType)) {
    throw new AppError("type must be a valid violation type", 400);
  }

  attempt.proctoringEvents.push({ type: type as ViolationType, timestamp: new Date() });
  attempt.violationCounts[type as ViolationType] += 1;
  await attempt.save();

  const assignment = await Assignment.findById(attempt.assignmentId);
  const limit = assignment?.violationLimits[type as ViolationType];
  let autoSubmitted = false;

  if (limit !== undefined && attempt.violationCounts[type as ViolationType] > limit) {
    await finalizeSubmission(attempt, "violation_limit_exceeded", type as ViolationType);
    autoSubmitted = true;
  }

  success(res, {
    violationCounts: attempt.violationCounts,
    autoSubmitted,
    status: attempt.status
  }, "Violation logged");
};

/**
 * POST /api/candidate/assignments/:assignmentId/submit
 * Finalizes the attempt, scoring objective questions immediately.
 */
export const submitAttempt = async (req: Request, res: Response) => {
  const attempt = await getOwnedAttempt(req);
  if (attempt.status === "submitted") throw new AppError("Attempt already submitted", 400);

  await finalizeSubmission(attempt);

  success(res, {
    attemptId: attempt._id,
    status: attempt.status,
    score: attempt.scoreObtained,
    totalMarks: attempt.totalMarks,
    isFullyScored: attempt.isFullyScored
  }, "Attempt submitted");
};
