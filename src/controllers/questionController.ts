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

export const listQuestions = async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  const { questionText, qp_number, status, type } = req.query;

  if (questionText !== undefined) {
    if (typeof questionText !== "string" || !questionText.trim()) throw new AppError("questionText filter must be non-empty", 400);
    filter.questionText = { $regex: questionText.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  if (qp_number !== undefined) {
    const number = Number(qp_number);
    if (!Number.isInteger(number) || number < 1) throw new AppError("qp_number must be a positive integer", 400);
    filter.qp_number = number;
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !statuses.includes(status as QuestionStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = status;
  }
  if (type !== undefined) {
    if (typeof type !== "string" || !questionTypes.includes(type as QuestionType)) throw new AppError("Invalid type filter", 400);
    filter.type = type;
  }

  const questions = await Question.find(filter).sort({ qp_number: 1 });
  success(res, questions);
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
