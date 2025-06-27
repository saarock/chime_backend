// src/types/usersTypes/user.type.ts
// Define all user-related TypeScript types and interfaces used across the application
import type { Document } from "mongoose";

/**
 * Gender type enum to ensure gender values are restricted to allowed options.
 */
export type Gender = "male" | "female" | "other";

/**
 * Represents the full User model as returned from the database.
 * Includes both required and optional fields, and MongoDB metadata.
 */
export interface User {
  _id: string;                     // MongoDB user ID
  fullName: string;               // Full name of the user
  userName?: string;              // Optional username for profile display
  email: string;                  // Email address (unique)
  phoneNumber?: string;           // Optional phone number
  profilePicture?: string;        // URL or path to user's profile picture
  age?: string;                   // Optional age, stored as a string for flexibility
  gender?: Gender;                // Optional gender (male, female, other)
  relationShipStatus?: string;   // Optional relationship status (e.g., single, mingle)
  active: boolean;                // Whether the account is active
  country?: string;               // Optional country name or code
  role: "admin" | "user";         // User role to manage access levels
  __v: number;                    // Mongoose version key
  createdAt: string;             // ISO string representing creation time
  updatedAt: string;             // ISO string representing last update time
  refreshToken: string;          // Secure token used for generating access tokens
}

/**
 * Type for handling Google login authentication payloads.
 */
export interface UserLoginWithGoogleDetails {
  clientId: string;     // Google's OAuth client ID
  credential: string;   // Encoded JWT credential from Google
}

/**
 * Mongoose document interface for strongly typed access to database documents.
 */
export interface UserDocument extends Document {
  _id: string;
  email: string;
  userName: string;
  // Extend with additional fields as needed
}

/**
 * Payload for the access token used in authentication.
 * Sent to clients to validate user identity.
 */
export interface TokenPayloadTypes {
  _id: string;    // User ID
  email: string;  // User email
  iat: number;    // Issued at (timestamp)
  exp: number;    // Expiration time (timestamp)
}

/**
 * Payload for the refresh token used to reissue access tokens.
 */
export interface RefreshTokenPayloadTypes {
  _id: string;    // User ID
  iat: number;    // Issued at
  exp: number;    // Expires at
}

/**
 * Represents the subset of user fields collected after registration
 * to complete the user profile (e.g., from a modal).
 */
export interface UserImpDetails {
  age: number;                 // Age (must be >=13 and <=120)
  country: string;            // Country name
  gender: string;             // Gender as string (validated against enum on backend)
  userId?: string;             // Associated user ID
  relationshipStatus?: string; // Optional relationship status
  phoneNumber?: string;       // Optional phone number
  userName: string;
}

/**
 * Represents a user's call log, useful for history or analytics.
 */
export interface UserCallLogs {
  callerId: string;   // ID of the user who initiated the call
  calleeId: string;   // ID of the user who received the call
  callTime: string;   // Call duration or timestamp, depending on usage
}
