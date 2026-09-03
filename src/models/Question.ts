import { Document, Model, Schema, model } from "mongoose";

export type QuestionType = "single-choice" | "multiple-choice" | "short-answer";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionStatus = "draft" | "published";

export interface IQuestion extends Document {
  questionText: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  points: number;
  additionalInfo: {
    options?: string[];
    correctAnswers?: number[];
    expectedAnswer?: string;
  };
  createdBy: Schema.Types.ObjectId;
  qp_number: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ICounter extends Document {
  name: string;
  value: number;
}

const counterSchema = new Schema<ICounter>({
  name: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 1000 }
});

const Counter: Model<ICounter> = model<ICounter>("QuestionCounter", counterSchema);

const questionSchema = new Schema<IQuestion>(
  {
    questionText: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ["single-choice", "multiple-choice", "short-answer"]
    },
    difficulty: { type: String, required: true, enum: ["easy", "medium", "hard"] },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    points: { type: Number, required: true, min: 0 },
    additionalInfo: {
      options: [{ type: String, trim: true }],
      correctAnswers: [{ type: Number, min: 0 }],
      expectedAnswer: { type: String, trim: true }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    qp_number: { type: Number, required: true, unique: true, immutable: true }
  },
  { timestamps: true }
);

questionSchema.pre("validate", function (next) {
  const info = this.additionalInfo ?? {};

  if (this.type === "short-answer") {
    if (!info.expectedAnswer?.trim()) {
      this.invalidate("additionalInfo.expectedAnswer", "expectedAnswer is required for short-answer questions");
    }
    return next();
  }

  if (!info.options || info.options.length < 2) {
    this.invalidate("additionalInfo.options", "At least two options are required for choice questions");
  }

  if (!info.correctAnswers || info.correctAnswers.length === 0) {
    this.invalidate("additionalInfo.correctAnswers", "At least one correct answer is required for choice questions");
  } else if (this.type === "single-choice" && info.correctAnswers.length !== 1) {
    this.invalidate("additionalInfo.correctAnswers", "single-choice questions require exactly one correct answer");
  }

  const options = info.options;
  if (options && info.correctAnswers?.some((answer) => answer < 0 || answer >= options.length)) {
    this.invalidate("additionalInfo.correctAnswers", "correctAnswers must reference option indexes");
  }

  next();
});

questionSchema.pre("validate", async function () {
  if (!this.isNew || this.qp_number) return;

  const counter = await Counter.findOneAndUpdate(
    { name: "question" },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  this.qp_number = counter.value;
});

questionSchema.index({ qp_number: 1, status: 1, type: 1 });
questionSchema.index({ createdBy: 1 });
questionSchema.index({ questionText: "text" });

export const Question: Model<IQuestion> = model<IQuestion>("Question", questionSchema);
