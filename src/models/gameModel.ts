import mongoose, { Schema, Document } from "mongoose";
import { GAME_GENRES, type GameGenre } from "../constants/genres";

export interface IGame extends Document {
  title: string;
  steam_app_id?: number;
  genre: GameGenre[];
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
    genre: {
      type: [String],
      default: [],
      validate: {
        validator: function (genres: string[]) {
          return genres.every(genre => GAME_GENRES.includes(genre as GameGenre));
        },
        message: 'Invalid genre provided. Must be one of the predefined genres.'
      }
    },
    developer: { type: String },
    publisher: { type: String },
    technologies: { type: [String], default: [] },
    release_date: { type: Date },
    description: { type: String },
  },
  { timestamps: true }
);

// Index for genre searches
gameSchema.index({ genre: 1 });

const Game = mongoose.model<IGame>("Games", gameSchema);

export default Game;