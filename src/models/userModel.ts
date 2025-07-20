import mongoose, { Schema, Document } from "mongoose";

// Define the User interface
export interface IUser extends Document {
  name: string;
  email?: string;
  password?: string;
  profile_picture: string;
  date_of_birth: Date;
}

// Define the User schema
const userSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String },
    password: { type: String },
    profile_picture: { type: String, default: "" },
    date_of_birth: { type: Date },
  },
  { timestamps: true }
);

// Create the User model
const User = mongoose.model<IUser>("Users", userSchema);

export default User;
