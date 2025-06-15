// src/types/usersTypes/user.type.ts
// Improt all the necessary dependencies here
import type { Document } from "mongoose";

// user.type.ts
export type Gender = "male" | "female" | "other";

// User type
export interface User {
  _id: string; // User id
  fullName: string; // User FullName
  userName?: string; // User UserName [optional]
  email: string; // User email
  phoneNumber?: string;
  profilePicture?: string;
  age?: string;
  gender?: Gender;
  relationShipStatus?: ["single", "mingle", "not-interest"];
  active: boolean;
  country?: string;
  role: "admin" | "user";
  __v: number;
  createdAt: string;
  updatedAt: string;
  refreshToken: string;
}

// User LoginWithGoogleType for google login
export interface UserLoginWithGoogleDetails {
  clientId: string; // Google client id
  credential: string; // user secure hashed crendential
}

// User document type
export interface UserDocument extends Document {
  _id: string;
  email: string;
  userName: string;
  // plus any other fields
}

// User access token payload types
export interface TokenPayloadTypes {
  _id: string;
  email: string;
  iat: number;
  exp: number;
}

// User refresh token payload types
export interface RefreshTokenPayloadTypes {
  _id: string;
  iat: number;
  exp: number;
}

export interface UserImpDetails {
  age: number;
  country: string;
  gender: string;
  userId: string;
}

// User call logs
export interface UserCallLogs {
  callerId: string;
  calleeId: string;
  callTime: string; // duration in seconds (or you can use milliseconds if preferred)
}
