import mongoose, { Schema } from "mongoose";

export interface UserDocument {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  passwordHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      maxlength: 254,
      lowercase: true,
      trim: true,
      unique: true,
    },
    name: { type: String, required: true, maxlength: 100, trim: true },
    passwordHash: { type: String, maxlength: 200, default: null },
  },
  { collection: "users", timestamps: true, versionKey: false },
);

UserSchema.index({ createdAt: -1 });

export const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

export default User;
