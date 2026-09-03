import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Question, QuestionDifficulty, QuestionStatus, QuestionType } from "../models/Question";
import { AppError } from "../middleware/errorHandler";
import { success } from "../utils/response";

const questionTypes: QuestionType[] = ["single-choice", "multiple-choice", "short-answer"];
const difficulties: QuestionDifficulty[] = ["easy", "medium", "hard"];
const statuses: QuestionStatus[] = ["draft", "published"];

const validateQuestionInput = (body: Record<string, unknown>, partial = false): void => {
  const required = ["questionText", "type", "difficulty", "points"];
  if (!partial && required.some((field) => body[field] === undefined)) {
    throw new AppError("questionText, type, difficulty and points are required", 400);
  }

  if (body.questionText !== undefined && (typeof body.questionText !== "string" || !body.questionText.trim())) {
    throw new AppError("questionText must be a non-empty string", 400);
  }
  if (body.type !== undefined && !questionTypes.includes(body.type as QuestionType)) {
    throw new AppError("type must be single-choice, multiple-choice or short-answer", 400);
  }
  if (body.difficulty !== undefined && !difficulties.includes(body.difficulty as QuestionDifficulty)) {
    throw new AppError("difficulty must be easy, medium or hard", 400);
  }
  if (body.status !== undefined && !statuses.includes(body.status as QuestionStatus)) {
    throw new AppError("status must be draft or published", 400);
  }
  if (body.points !== undefined && (typeof body.points !== "number" || !Number.isFinite(body.points) || body.points < 0)) {
    throw new AppError("points must be a non-negative number", 400);
  }
  if (body.additionalInfo !== undefined && (!body.additionalInfo || typeof body.additionalInfo !== "object")) {
    throw new AppError("additionalInfo must be an object", 400);
  }
};

const getOwnedQuestion = async (req: Request) => {
  if (!req.user || !isValidObjectId(req.params.id)) throw new AppError("Question not found", 404);
  const question = await Question.findOne({ _id: req.params.id, createdBy: req.user.id });
  if (!question) throw new AppError("Question not found", 404);
  return question;
};

export const createQuestion = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication required", 401);
  const body = req.body as Record<string, unknown>;
  validateQuestionInput(body);
  const question = await Question.create({ ...body, createdBy: req.user.id });
  success(res, question, "Question created", 201);
};

const parsePositiveInt = (value: unknown, fallback: number, fieldName: string): number => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new AppError(`${fieldName} must be a positive integer`, 400);
  return number;
};

export const listQuestions = async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  const { search, status, type, page, limit } = req.query;

  if (search !== undefined) {
    if (typeof search !== "string" || !search.trim()) throw new AppError("search filter must be non-empty", 400);
    const trimmed = search.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const orConditions: Record<string, unknown>[] = [{ questionText: { $regex: escaped, $options: "i" } }];

    const qpNumber = Number(trimmed);
    if (Number.isInteger(qpNumber) && qpNumber > 0) {
      orConditions.push({ qp_number: qpNumber });
    }

    filter.$or = orConditions;
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !statuses.includes(status as QuestionStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = status;
  }
  if (type !== undefined) {
    if (typeof type !== "string" || !questionTypes.includes(type as QuestionType)) throw new AppError("Invalid type filter", 400);
    filter.type = type;
  }

  const pageNumber = parsePositiveInt(page, 1, "page");
  const limitNumber = Math.min(parsePositiveInt(limit, 20, "limit"), 100);
  const skip = (pageNumber - 1) * limitNumber;

  const [questions, total] = await Promise.all([
    Question.find(filter).sort({ qp_number: 1 }).skip(skip).limit(limitNumber),
    Question.countDocuments(filter)
  ]);

  success(res, {
    questions,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber)
    }
  });
};

export const getQuestion = async (req: Request, res: Response) => {
  if (!isValidObjectId(req.params.id)) throw new AppError("Question not found", 404);

  const question = await Question.findById(req.params.id);
  if (!question) throw new AppError("Question not found", 404);

  success(res, question);
};

export const updateQuestion = async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  validateQuestionInput(body, true);
  const question = await getOwnedQuestion(req);
  Object.assign(question, body);
  await question.save();
  success(res, question, "Question updated");
};

export const deleteQuestion = async (req: Request, res: Response) => {
  const question = await getOwnedQuestion(req);
  await question.deleteOne();
  success(res, null, "Question deleted");
};
