import mongoose, { Schema, Types } from "mongoose";

export interface UserLocation {
  lat: number;
  lon: number;
  radiusKm?: number;
}

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  name: string;
  favoriteStore?: string[];
  passwordHash?: string | null;
  location?: UserLocation | null;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    favoriteStore: { type: [String], default: [] },
    passwordHash: { type: String, default: null },
    location: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "users", timestamps: true, versionKey: false },
);

export const User = mongoose.models.User ?? mongoose.model<UserDocument>("User", UserSchema);
export default User;
