import { Document, Model, Schema, Types, model } from "mongoose";

export type AssessmentStatus = "draft" | "published" | "archived";

export interface IAssessment extends Document {
  title: string;
  questionIds: Types.ObjectId[];
  totalPoints: number;
  status: AssessmentStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const assessmentSchema = new Schema<IAssessment>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200
    },
    questionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      required: true,
      validate: {
        validator: (questionIds: Types.ObjectId[]) => questionIds.length > 0,
        message: "An assessment must contain at least one question"
      }
    },
    totalPoints: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft"
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

assessmentSchema.index({ createdBy: 1, createdAt: -1 });

export const Assessment: Model<IAssessment> = model<IAssessment>("Assessment", assessmentSchema);
