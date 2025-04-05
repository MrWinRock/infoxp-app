import mongoose, { Schema, Document } from "mongoose";

export interface IGameContent extends Document {
  game_id: mongoose.Types.ObjectId;
  content_type: string;
  content_data: string;
  createdAt: Date;
  updatedAt: Date;
}

const gameContentSchema: Schema = new Schema(
  {
    game_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    content_type: { type: String, required: true },
    content_data: { type: String, required: true },
  },
  { timestamps: true }
);

const GameContent = mongoose.model<IGameContent>(
  "GameContent",
  gameContentSchema
);

export default GameContent;
