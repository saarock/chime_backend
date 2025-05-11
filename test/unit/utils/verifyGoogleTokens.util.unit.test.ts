import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import verifyGoogleToken from "../../../src/utils/verifyGoogleToken";
import { TokenPayload } from "google-auth-library";

// Initialize the mock function first

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => {
  return {
    OAuth2Client: vi.fn().mockImplementation((clientId) => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    __esModule: true,
  };
});

describe("verifyGoogleToken", () => {
  beforeEach(() => {
    // Clear all mocks and set up environment before each test
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "env-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return payload when getPayload returns payload", async () => {
    const fakePayload: TokenPayload = {
      iss: "test-issuer",
      aud: "test-audience",
      iat: 12345,
      exp: 67890,
      email: "test@example.com",
      name: "Test User",
      sub: "1234567890",
    };

    const mockTicket = {
      getPayload: vi.fn().mockReturnValue(fakePayload),
    };

    mockVerifyIdToken.mockResolvedValue(mockTicket);

    const result = await verifyGoogleToken({
      credentials: "fake-token",
      clientId: "env-client-id",
    });

    expect(result).toEqual(fakePayload);
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: "fake-token",
      audience: "env-client-id", // Should use the env var
    });
  });

  it("should use provided clientId when env var is not set", async () => {
    vi.unstubAllEnvs();
    const mockTicket = {
      getPayload: vi.fn().mockReturnValue(null),
    };
    mockVerifyIdToken.mockResolvedValue(mockTicket);

    await verifyGoogleToken({
      credentials: "fake-token",
      clientId: "test-client-id",
    });

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: "fake-token",
      audience: "test-client-id", // Should fall back to provided clientId
    });
  });

  it("should return undefined when getPayload returns null", async () => {
    const mockTicket = {
      getPayload: vi.fn().mockReturnValue(undefined),
    };

    mockVerifyIdToken.mockResolvedValue(mockTicket);

    const result = await verifyGoogleToken({
      credentials: "fake-token",
      clientId: "test-client-id",
    });

    expect(result).toBeUndefined();
  });

  it("should throw error if verifyIdToken rejects", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    await expect(
      verifyGoogleToken({
        credentials: "fake-token",
        clientId: "test-client-id",
      }),
    ).rejects.toThrow("Invalid token");
  });
});
