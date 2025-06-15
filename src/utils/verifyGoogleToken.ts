// Import all the necessary dependencies here
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { UserLoginWithGoogleDetails } from "../types/index.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (
  googleTokens: UserLoginWithGoogleDetails,
): Promise<TokenPayload | undefined> => {
  const ticket = await client.verifyIdToken({
    idToken: googleTokens.credential,
    audience: googleTokens.clientId,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    return undefined;
  }

  // if every things all-right return the payload
  return payload;
};

export default verifyGoogleToken;
