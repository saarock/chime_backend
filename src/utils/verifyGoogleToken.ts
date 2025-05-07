import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { UserLoginWithGoogleDetils } from '../types/index.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const verifyGoogleToken = async (googleTokens: UserLoginWithGoogleDetils): Promise<TokenPayload> => {
    const ticket = await client.verifyIdToken({
        idToken: googleTokens.credentials,
        audience: process.env.GOOGLE_CLIENT_ID || googleTokens.clientId,  // must match your frontend's client ID
    });

    const payload = ticket.getPayload();

    if (!payload) {
        throw new Error("Invalid Google token");
    }

    return payload;
};


export default verifyGoogleToken;