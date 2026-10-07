import mongoose, { Schema, type Types } from "mongoose";
import type { EmbeddedParticipant } from "../rounds/rounds.model";

export interface ParticipantDocument extends EmbeddedParticipant {
  roundId: Types.ObjectId;
  email?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ParticipantSchema = new Schema<ParticipantDocument>(
  {
    roundId: { type: Schema.Types.ObjectId, ref: "Round", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: null },
    tokenHash: { type: String, required: true },
    claimedAt: { type: Date, default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { collection: "participants", timestamps: true, versionKey: false },
);

export const Participant = mongoose.models.Participant ?? mongoose.model("Participant", ParticipantSchema);
export default Participant;
