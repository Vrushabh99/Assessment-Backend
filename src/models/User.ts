import { Document, Model, Schema, model } from "mongoose";

export type UserRole = "candidate" | "creator" | "admin";

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true, minlength: 2 },
    lastName: { type: String, required: true, trim: true, minlength: 2 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ["candidate", "creator", "admin"], default: "candidate" }
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const bcrypt = await import("bcryptjs");
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(candidatePassword, this.password);
};

export const User: Model<IUser> = model<IUser>("User", userSchema);
