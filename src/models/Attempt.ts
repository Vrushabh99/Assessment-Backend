// models/Attempt.ts
import { Schema, model, Types, Document } from "mongoose";

export type AttemptStatus = "assigned" | "in_progress" | "submitted";
export type ViolationType =
  | "tab_switch" | "window_blur" | "fullscreen_exit" | "copy" | "paste" | "right_click";
export type AssignmentEventType = 
  | "attempt_start" | "attempt_submit" | "attempt_flag" | "attempt_autosave" | "attempt_reset" | "attempt_graded";


  interface IAnswer {
  questionId: Types.ObjectId;
  selectedOptionIds?: number[];
  textAnswer?: string;
  isCorrect: boolean | null;
  marksObtained: number;
  needsManualReview: boolean;
}

interface IViolationCounts {
  tab_switch: number;
  window_blur: number;
  fullscreen_exit: number;
  copy: number;
  paste: number;
  right_click: number;
}

interface IProctoringEvent {
  type: ViolationType | AssignmentEventType;
  timestamp?: Date ;
  message?: String | null;
}

export interface IAttempt extends Document {
  assignmentId: Types.ObjectId;
  assessmentId: Types.ObjectId;
  candidateId: Types.ObjectId;
  status: AttemptStatus;
  startedAt: Date | null;
  submittedAt: Date | null;
  answers: IAnswer[];
  proctoringEvents: IProctoringEvent[];
  violationCounts: IViolationCounts;
  autoSubmittedReason: "timer_expired" | "violation_limit_exceeded" | null;
  autoSubmittedViolationType: ViolationType | null;
  totalMarks: number;
  scoreObtained: number | null;
  isFullyScored: boolean;
  scoredBy: Types.ObjectId | null;
  scoredAt: Date | null;
}

const answerSchema = new Schema<IAnswer>(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    selectedOptionIds: [{ type: Number }],
    textAnswer: { type: String },
    isCorrect: { type: Boolean, default: null },
    marksObtained: { type: Number, default: 0 },
    needsManualReview: { type: Boolean, default: false },
  },
  { _id: false }
);

export const violationTypeEnum = ["tab_switch", "window_blur", "fullscreen_exit", "copy", "paste", "right_click"];
export const AssignmentEventTypeEnum = ["attempt_start", "attempt_submit", "attempt_flag", "attempt_autosave", "attempt_reset", "attempt_graded"];

const violationCountsSchema = new Schema<IViolationCounts>(
  {
    tab_switch: { type: Number, default: 0 },
    window_blur: { type: Number, default: 0 },
    fullscreen_exit: { type: Number, default: 0 },
    copy: { type: Number, default: 0 },
    paste: { type: Number, default: 0 },
    right_click: { type: Number, default: 0 },
  },
  { _id: false }
);

const proctoringEventSchema = new Schema<IProctoringEvent>(
  {
    type: { type: String, enum: [...violationTypeEnum, ...AssignmentEventTypeEnum], required: true },
    timestamp: { type: Date, default: Date.now },
    message: { type: String, default: null },
  },
  { _id: false }
);

const attemptSchema = new Schema<IAttempt>(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["assigned", "in_progress", "submitted"], default: "assigned" },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    answers: [answerSchema],
    proctoringEvents: [proctoringEventSchema],
    violationCounts: { type: violationCountsSchema, default: () => ({}) },
    autoSubmittedReason: { type: String, enum: ["timer_expired", "violation_limit_exceeded", null], default: null },
    autoSubmittedViolationType: { type: String, enum: [...violationTypeEnum, null], default: null },
    totalMarks: { type: Number, default: 0 },
    scoreObtained: { type: Number, default: null },
    isFullyScored: { type: Boolean, default: false },
    scoredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    scoredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

attemptSchema.index({ assessmentId: 1, candidateId: 1 }, { unique: true });
attemptSchema.index({ candidateId: 1, status: 1 });
attemptSchema.index({ assignmentId: 1, status: 1 });

export const Attempt = model<IAttempt>("Attempt", attemptSchema);