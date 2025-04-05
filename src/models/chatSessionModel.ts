import mongoose, { Schema, Document } from "mongoose";

export interface IChatSession extends Document {
  user_id: mongoose.Types.ObjectId;
  game_id: mongoose.Types.ObjectId;
  session_started: Date;
  session_ended: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema: Schema = new Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    game_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    session_started: { type: Date, required: true },
    session_ended: { type: Date },
  },
  { timestamps: true }
);

const ChatSession = mongoose.model<IChatSession>(
  "ChatSession",
  chatSessionSchema
);

export default ChatSession;
