import mongoose, { Schema, Document } from "mongoose";

// Define the User interface
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  profile_picture: string;
  date_of_birth: Date;
}

// Define the User schema
const userSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profile_picture: { type: String, default: "" },
    date_of_birth: { type: Date },
  },
  { timestamps: true }
);

// Create the User model
const User = mongoose.model<IUser>("User", userSchema);

export default User;
