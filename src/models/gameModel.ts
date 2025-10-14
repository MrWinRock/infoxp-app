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
  required_age?: number;
  platforms?: { windows: boolean; mac: boolean; linux: boolean };
  categories?: string[];
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
          return /^https?:\/\/[^\s]+$/i.test(imageUrl);
        },
        message: 'Image URL must be a valid http(s) URL'
      }
    },
    required_age: { type: Number, min: 0 },
    platforms: {
      windows: { type: Boolean, default: false },
      mac: { type: Boolean, default: false },
      linux: { type: Boolean, default: false }
    },
    categories: { type: [String], default: [] }
  },
  { timestamps: true }
);

gameSchema.index({ genre: 1 });
gameSchema.index({ developer: 1 });
gameSchema.index({ categories: 1 });

const Game = mongoose.model<IGame>("Games", gameSchema);

export default Game;