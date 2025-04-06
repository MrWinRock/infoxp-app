import mongoose, { Schema, Document } from "mongoose";

export interface IGame extends Document {
  title: string;
  genre: string[];
  description: string;
  release_date: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gameSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    genre: { type: [String], required: true },
    description: { type: String, required: true },
    release_date: { type: Date, required: true },
  },
  { timestamps: true }
);

const Game = mongoose.model<IGame>("Game", gameSchema);

export default Game;
