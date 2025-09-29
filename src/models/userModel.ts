import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser extends Document {
  name?: string;
  email?: string;
  password?: string;
  date_of_birth?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  role: "admin" | "user";
}

const userSchema: Schema = new Schema(
  {
    name: { type: String, required: true },

    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    date_of_birth: { type: Date },
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true }
);

userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error as Error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUser>("Users", userSchema);
export default User;