import mongoose, { Schema, type Types } from "mongoose";

export interface ParticipantDocument {
  _id: Types.ObjectId;
  roundId: Types.ObjectId;
  userId: Types.ObjectId | null;
  name: string;
  email?: string | null;
  tokenHash: string;
  claimedAt?: Date | null;
  joinedAt: Date;
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
