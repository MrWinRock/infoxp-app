import mongoose, { Schema, Document } from "mongoose";
import { GAME_GENRES, type GameGenre } from "../constants/genres";

export interface IGame extends Document {
  title: string;
  steam_app_id?: number;
  genre: GameGenre[];
  developer?: string[];
  publisher?: string;
  technologies?: string[];
  release_date?: Date;
  description?: string;
  image_url?: string;
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
    developer: { type: [String], default: [] },
    publisher: { type: String },
    technologies: { type: [String], default: [] },
    release_date: { type: Date },
    description: { type: String },
    image_url: {
      type: String,
      validate: {
        validator: function (imageUrl: string) {
          if (!imageUrl) return true;
          return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/i.test(imageUrl);
        },
        message: 'Image URL must be a filename in format: game_name.jpg (supported: jpg, jpeg, png, gif, webp)'
      }
    }
  },
  { timestamps: true }
);

// Index for genre searches
gameSchema.index({ genre: 1 });
// Index for developer searches
gameSchema.index({ developer: 1 });

const Game = mongoose.model<IGame>("Games", gameSchema);

export default Game;