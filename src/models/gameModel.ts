import mongoose, { Schema, Document } from "mongoose";

export interface IGame extends Document {
  title: string;
  steam_app_id?: number;
  genre: string[];
  developer?: string;
  publisher?: string;
  technologies?: string[];
  release_date?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    steam_app_id: { type: Number, unique: true, sparse: true, index: true },
    genre: { type: [String], default: [] },
    developer: { type: String },
    publisher: { type: String },
    technologies: { type: [String], default: [] },
    release_date: { type: Date },
    description: { type: String },
  },
  { timestamps: true }
);

const Game = mongoose.model<IGame>("Game", gameSchema);

export default Game;
