import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Attempt } from "../models/Attempt";
import { Assessment } from "../models/Assessment";
import { Question } from "../models/Question";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

/**
 * GET /api/admin/assignments/:assignmentId/candidates/:candidateId/attempt
 * Returns the full detail of one candidate's attempt within a specific
 * assignment — question text, their selected answers, violation counts,
 * scoring state — enough for an admin to review or grade in one call.
 */
export const getCandidateAttempt = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { assignmentId } = req.params;
  if (!isValidObjectId(assignmentId)) {
    throw new AppError("Invalid assignmentId", 400);
  }

  let candidateId = req.params.candidateId;
  if (req.user.role === 'candidate') {
    candidateId = req.user.id;
  }

  const attempt = await Attempt.findOne({ assignmentId, candidateId })
  .populate("candidateId", "firstName lastName email")
  .populate("assessmentId", "title questionIds totalPoints")
  .lean();

  if (!attempt) {
    throw new AppError("No attempt found for this candidate on this assignment", 404);
  }

  const questionIds = (attempt.assessmentId as any )?.questionIds;
  const questions = await Question.find({ _id: { $in: questionIds } })
    .select("_id questionText type points additionalInfo")
    .lean();

  const candidate = attempt.candidateId as any;

  const result = {
    attemptId: attempt._id,
    assignmentId: attempt.assignmentId,
    candidate: {
      ...candidate,
      fullName: `${candidate.firstName} ${candidate.lastName}`,
    },
    assessment: attempt.assessmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    autoSubmittedReason: attempt.autoSubmittedReason,
    autoSubmittedViolationType: attempt.autoSubmittedViolationType,
    violationCounts: attempt.violationCounts,
    total: attempt.totalMarks,
    score: attempt.scoreObtained,
    isFullyScored: attempt.isFullyScored,
    scoredBy: attempt.scoredBy,
    scoredAt: attempt.scoredAt,
    questions: questions.map((question) => {
      const questionId = question._id.toString();
      const answer = attempt.answers.find(ele => ele.questionId.toString() === questionId);
      return {
        questionId,
        questionText: question?.questionText ?? null,
        type: question?.type ?? null,
        points: question?.points ?? null,
        additionalInfo: question?.additionalInfo ?? null,
        answer:  question?.type === 'short-answer' ? answer?.textAnswer : answer?.selectedOptionIds || [],
        isCorrect: answer?.isCorrect ?? null,
        score: answer?.marksObtained ?? null,
        needsManualReview: answer?.needsManualReview ?? null
      };
    })
  };

  success(res, result, "Candidate attempt fetched");
};

interface ScoreUpdateInput {
  questionId: string;
  marksObtained: number;
  isCorrect?: boolean;
}

/**
 * PATCH /api/admin/attempts/:attemptId/score
 * Manually grades one or more answers on a submitted attempt (typically
 * short-answer questions flagged needsManualReview), then recomputes the
 * attempt's total score and isFullyScored from ALL answers — not just the
 * ones being patched — so partial re-grades stay consistent.
 *
 * Body: { answers: [{ questionId: string, marksObtained: number, isCorrect?: boolean }] }
 */
export const updateAttemptScore = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { attemptId } = req.params;
  if (!isValidObjectId(attemptId)) {
    throw new AppError("Invalid attemptId", 400);
  }

  const { answers } = req.body as { answers?: unknown };
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new AppError("answers must be a non-empty array", 400);
  }

  const updates: ScoreUpdateInput[] = [];
  for (const entry of answers) {
    const { questionId, score, isCorrect } = (entry ?? {}) as Record<string, unknown>;
    if (typeof questionId !== "string" || !isValidObjectId(questionId)) {
      throw new AppError("Each answer update requires a valid questionId", 400);
    }
    if (typeof score !== "number" || score < 0) {
      throw new AppError("score must be a non-negative number", 400);
    }
    updates.push({
      questionId,
      marksObtained: score,
      isCorrect: typeof isCorrect === "boolean" ? isCorrect : undefined
    });
  }

  const attempt = await Attempt.findById(attemptId);
  if (!attempt) {
    throw new AppError("Attempt not found", 404);
  }
  if (attempt.status !== "submitted") {
    throw new AppError("Only submitted attempts can be scored", 400);
  }

  const updateByQuestionId = new Map(updates.map((u) => [u.questionId, u]));

  // Look up max points per question so an admin can't accidentally award
  // more marks than a question is worth.
  const questions = await Question.find({ _id: { $in: updates.map((u) => u.questionId) } })
    .select("_id points")
    .lean();
  const maxPointsByQuestionId = new Map(questions.map((q) => [q._id.toString(), q.points]));

  for (const update of updates) {
    const maxPoints = maxPointsByQuestionId.get(update.questionId);
    if (maxPoints === undefined) {
      throw new AppError(`Question ${update.questionId} was not found`, 400);
    }
    if (update.marksObtained > maxPoints) {
      throw new AppError(
        `marksObtained (${update.marksObtained}) exceeds this question's max points (${maxPoints})`,
        400
      );
    }
  }

  let matchedAny = false;

  for (const update of updates) {
    matchedAny = true;
    const existingAnswer = attempt.answers.find(
      (answer) => answer.questionId.toString() === update.questionId
    );

    if (existingAnswer) {
      existingAnswer.marksObtained = update.marksObtained;
      existingAnswer.needsManualReview = false;
      existingAnswer.isCorrect =
        update.isCorrect !== undefined ? update.isCorrect : update.marksObtained > 0;
    } else {
      // The candidate left this question completely blank (no answer was
      // ever saved), so there is nothing in attempt.answers to update —
      // without this branch, a skipped short-answer question could never
      // be manually graded at all.
      attempt.answers.push({
        questionId: update.questionId as any,
        textAnswer: "",
        marksObtained: update.marksObtained,
        needsManualReview: false,
        isCorrect: update.isCorrect !== undefined ? update.isCorrect : update.marksObtained > 0
      } as any);
    }
  }

  if (!matchedAny) {
    throw new AppError("No valid answer updates were provided", 400);
  }

  attempt.scoreObtained = attempt.answers.reduce((sum, a) => sum + a.marksObtained, 0);
  attempt.isFullyScored = attempt.answers.every((a) => !a.needsManualReview);
  attempt.scoredBy = req.user.id as any;
  attempt.scoredAt = new Date();

  await attempt.save();

  success(
    res,
    {
      attemptId: attempt._id,
      scoreObtained: attempt.scoreObtained,
      totalMarks: attempt.totalMarks,
      isFullyScored: attempt.isFullyScored,
      scoredBy: attempt.scoredBy,
      scoredAt: attempt.scoredAt,
      answers: attempt.answers.map((a) => ({
        questionId: a.questionId,
        marksObtained: a.marksObtained,
        isCorrect: a.isCorrect,
        needsManualReview: a.needsManualReview
      }))
    },
    "Attempt score updated"
  );
};