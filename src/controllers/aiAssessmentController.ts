import { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import { Assessment } from "../models/Assessment";
import { Question } from "../models/Question";
import { aiQuestionService } from "../services/aiQuestionService";
import { success } from "../utils/response";
import { validateQuestionInput } from "./questionController";


export const generateAIQuestions = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError("Authentication required", 401);

    const { topic, count, difficulty } = req.body;

    // Validate input
    if (!topic?.trim()) {
        throw new AppError("Topic is required", 400);
    }
    if (!count || count < 1 || count > 20) {
        throw new AppError("Count must be between 1 and 20", 400);
    }
    if (!["easy", "medium", "hard"].includes(difficulty)) {
        throw new AppError("Invalid difficulty level", 400);
    }

    // Generate via Gemini (no questionType specified)
    const questions = await aiQuestionService.generateQuestions(
      topic,
      count,
      difficulty
    );

    success(
        res,
        {
            questions
        }
    );
};

export const createAIAssessment = async (req: Request, res: Response) => {
    if (!req.user) throw new AppError("Authentication required", 401);

    const { questions, title, status } = req.body as Record<string, any>;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        throw new AppError("At least one question is required", 400);
    }

    const validatedQuestions = questions.map((question) => {
        validateQuestionInput(question);
        return {
            ...question,
            createdBy: req?.user?.id,
            tags: ['AI'],
        };
    });

    const createdQuestions = await Question.insertMany(validatedQuestions,{ ordered: true }).catch((err) => {
        if (err.writeErrors || err.name === "MongoBulkWriteError") {
          return err.insertedDocs ?? [];
        }
        throw err;
    });

    const totalPoints = createdQuestions.reduce((sum: number, q: any) => sum + (q.points ?? 0), 0);

    const assessment = await Assessment.create({
        title: title.trim(),
        questionIds: createdQuestions.map((q: any) => q._id),
        totalPoints,
        status,
        createdBy: req.user.id,
        tags: ['AI'],
      });

    success(res, assessment, "Assessment created", 201);
};