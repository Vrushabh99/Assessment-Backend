// models/Assignment.ts
import { Schema, model, Types, Document } from "mongoose";

export interface IViolationLimits {
  tab_switch: number;
  window_blur: number;
  fullscreen_exit: number;
  copy: number;
  paste: number;
  right_click: number;
}

export interface IAssignment extends Document {
  assessmentId: Types.ObjectId;
  assignedBy: Types.ObjectId;
  assignedAt: Date;
  expiresAt: Date | null;
  durationMinutes: number;
  violationLimits: IViolationLimits;
  description?: string;
  status: "active" | "cancelled";
  studentCount: number;
}

const violationLimitsSchema = new Schema<IViolationLimits>(
  {
    tab_switch: { type: Number, required: true, default: 3 },
    window_blur: { type: Number, required: true, default: 3 },
    fullscreen_exit: { type: Number, required: true, default: 2 },
    copy: { type: Number, required: true, default: 2 },
    paste: { type: Number, required: true, default: 2 },
    right_click: { type: Number, required: true, default: 5 },
  },
  { _id: false }
);

const assignmentSchema = new Schema<IAssignment>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    durationMinutes: { type: Number, required: true, min: 1 },
    violationLimits: { type: violationLimitsSchema, required: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["active", "cancelled"], default: "active" },
    studentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assignmentSchema.index({ assessmentId: 1, status: 1 });

export const Assignment = model<IAssignment>("Assignment", assignmentSchema);