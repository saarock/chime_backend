// src/types/usersTypes/user.type.ts
// Improt all the necessary dependencies here

import type { Document } from "mongoose";

// User type
export interface User {
  _id: string;
  fullName: string;
  userName: string;
  email: string;
  phoneNumber: string;
  profilePicture?: string;
  age: string;
  gender: ["male", "female", "other"];
  relationShipStatus?: ["single", "mingle", "not-interest"];
  active: boolean;
  country: string;
  role: "admin" | "user";
  __v: number;
  createdAt: string;
  updatedAt: string;
  refreshToken: string;
}

// User LoginWithGoogleType for google login

export interface UserLoginWithGoogleDetils {
  clientId: string;
  credentials: string;
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
