import mongoose, { Schema, Document } from "mongoose";

export interface IChatMessage extends Document {
  chat_session_id: mongoose.Types.ObjectId;
  sender: string;
  message: string;
  timestamp: Date;
}

const chatMessageSchema: Schema = new Schema(
  {
    chat_session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatSession",
      required: true,
    },
    sender: { type: String, enum: ["user", "chatbot"], required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model<IChatMessage>(
  "ChatMessage",
  chatMessageSchema
);

export default ChatMessage;
