export interface GoogleOAuthPayload {
  iss: string; // Issuer (the URL of the provider, i.e., Google)
  azp: string; // Authorized party (your client ID)
  aud: string; // Audience (should match the client ID)
  sub: string; // Subject (unique user ID)
  email: string; // User's email address
  email_verified: boolean; // Whether the email is verified
  nbf: number; // Not Before (timestamp)
  name: string; // Full name of the user
  picture: string; // URL of the user's profile picture
  given_name: string; // First name of the user
  family_name: string; // Last name of the user
  iat: number; // Issued At (timestamp)
  exp: number; // Expiry (timestamp)
  jti: string; // JWT ID (unique identifier for this token)
}
