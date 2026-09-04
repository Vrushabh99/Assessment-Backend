import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Assessment, AssessmentStatus } from "../models/Assessment";
import { Question } from "../models/Question";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

const assessmentStatuses: AssessmentStatus[] = ["draft", "published", "archived"];

const parsePositiveInt = (value: unknown, fallback: number, fieldName: string): number => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new AppError(`${fieldName} must be a positive integer`, 400);
  return number;
};

const validateQuestionIds = async (questionIds: unknown): Promise<string[]> => {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new AppError("questionIds must be a non-empty array", 400);
  }

  for (const id of questionIds) {
    if (typeof id !== "string" || !isValidObjectId(id)) {
      throw new AppError("questionIds must contain valid question ObjectIds", 400);
    }
  }

  const uniqueIds = [...new Set(questionIds)] as string[];
  const count = await Question.countDocuments({ _id: { $in: uniqueIds } });

  if (count !== uniqueIds.length) {
    throw new AppError("One or more questionIds do not exist", 400);
  }

  return uniqueIds;
};

const getTotalPoints = async (questionIds: string[]): Promise<number> => {
  const questions = await Question.find({ _id: { $in: questionIds } }).select("points");
  return questions.reduce((total, question) => total + question.points, 0);
};

const getOwnedAssessment = async (req: Request) => {
  if (!req.user || !isValidObjectId(req.params.id)) throw new AppError("Assessment not found", 404);
  const assessment = await Assessment.findOne({ _id: req.params.id, createdBy: req.user.id });
  if (!assessment) throw new AppError("Assessment not found", 404);
  return assessment;
};

export const createAssessment = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);
  const { title, questionIds, status } = req.body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length < 3) {
    throw new AppError("title is required and must be at least 3 characters", 400);
  }
  if (status !== undefined && (typeof status !== "string" || !assessmentStatuses.includes(status as AssessmentStatus))) {
    throw new AppError("status must be draft, published or archived", 400);
  }

  const validQuestionIds = await validateQuestionIds(questionIds);
  const totalPoints = await getTotalPoints(validQuestionIds);

  const assessment = await Assessment.create({
    title: title.trim(),
    questionIds: validQuestionIds,
    totalPoints,
    status,
    createdBy: req.user.id
  });

  success(res, assessment, "Assessment created", 201);
};

export const listAssessments = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);
  const filter: Record<string, unknown> = { createdBy: req.user.id };
  const { search, status, page, limit } = req.query;

  if (search !== undefined) {
    if (typeof search !== "string" || !search.trim()) throw new AppError("search filter must be non-empty", 400);
    filter.title = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !assessmentStatuses.includes(status as AssessmentStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = status;
  }

  const pageNumber = parsePositiveInt(page, 1, "page");
  const limitNumber = Math.min(parsePositiveInt(limit, 20, "limit"), 100);
  const skip = (pageNumber - 1) * limitNumber;

  const [assessments, total] = await Promise.all([
    Assessment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNumber),
    Assessment.countDocuments(filter)
  ]);

  success(res, {
    assessments,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber)
    }
  });
};

export const getAssessment = async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new AppError("Assessment not found", 404);

  const assessment = await Assessment.findById(req.params.id).populate("questionIds");
  if (!assessment) throw new AppError("Assessment not found", 404);

  success(res, assessment);
};

export const updateAssessment = async (req: Request, res: Response) => {
  const { title, questionIds, status } = req.body as Record<string, unknown>;
  const assessment = await getOwnedAssessment(req);

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length < 3) {
      throw new AppError("title must be at least 3 characters", 400);
    }
    assessment.title = title.trim();
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !assessmentStatuses.includes(status as AssessmentStatus)) {
      throw new AppError("status must be draft, published or archived", 400);
    }
    assessment.status = status as AssessmentStatus;
  }
  if (questionIds !== undefined) {
    const validQuestionIds = await validateQuestionIds(questionIds);
    assessment.questionIds = validQuestionIds as unknown as typeof assessment.questionIds;
    assessment.totalPoints = await getTotalPoints(validQuestionIds);
  }

  await assessment.save();
  success(res, assessment, "Assessment updated");
};

export const deleteAssessment = async (req: Request, res: Response) => {
  const assessment = await getOwnedAssessment(req);
  await assessment.deleteOne();
  success(res, null, "Assessment deleted");
};
