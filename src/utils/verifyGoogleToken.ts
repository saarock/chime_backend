import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { UserLoginWithGoogleDetils } from "../types/index.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const verifyGoogleToken = async (
  googleTokens: UserLoginWithGoogleDetils,
): Promise<TokenPayload | undefined> => {
  const ticket = await client.verifyIdToken({
    idToken: googleTokens.credentials,
    audience: googleTokens.clientId,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    return undefined;
  }

  return payload;
};

export default verifyGoogleToken;
