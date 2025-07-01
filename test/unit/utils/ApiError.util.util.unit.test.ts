import { describe, it, expect } from "vitest";
import { ApiError } from "../../../src/utils/index.js";

describe("ApiError class", () => {
  it("should correctly set the properties in the constructor", () => {
    const statusCode = 404;
    const message = "Not Found";
    const errors: string[] = [];
    const stack = "";
    const errorCode = "Invalid Token";

    const response = new ApiError(statusCode, message, errors, stack, errorCode);

    expect(response.statusCode).toBe(statusCode);
    expect(response.message).toBe(message);
    expect(response.data).toBe(null); // data is always null in constructor
    expect(response.success).toBe(false);
    expect(response.errors).toEqual(errors);
    expect(typeof response.stack).toBe("string");
    expect(response.errorCode).toBe(errorCode);
  });

  it("should default errors to empty array if not provided", () => {
    const response = new ApiError(500, "Server Error");
    expect(response.errors).toEqual([]);
  });

  it("should default stack to a string (not necessarily empty) if not provided", () => {
    const response = new ApiError(500, "Server Error");
    expect(typeof response.stack).toBe("string");
  });

  it("should default errorCode to empty string if not provided", () => {
    const response = new ApiError(400, "Bad Request");
    expect(response.errorCode).toBe("");
  });

  it("should set success to false always", () => {
    const response = new ApiError(403, "Forbidden");
    expect(response.success).toBe(false);
  });

  it("should keep the message as provided (string)", () => {
    const response = new ApiError(400, "Some error message");
    expect(response.message).toBe("Some error message");
  });

  it("should handle non-string message by converting to string", () => {
    // Since your class extends Error and super(message) is called,
    // message is always string, but test with non-string input anyway
    const response = new ApiError(400, 12345 as any);
    expect(response.message).toBe("12345");
  });

  it("should handle empty constructor arguments gracefully", () => {
    const response = new ApiError(0, "");
    expect(response.statusCode).toBe(0);
    expect(response.message).toBe("");
    expect(response.errors).toEqual([]);
    expect(typeof response.stack).toBe("string");
    expect(response.errorCode).toBe("");
    expect(response.success).toBe(false);
  });

  it("should maintain all properties independently for multiple instances", () => {
    const err1 = new ApiError(401, "Unauthorized", ["token expired"], "stack1", "TOKEN_EXPIRED");
    const err2 = new ApiError(500, "Internal Error", ["db failed"], "stack2", "DB_FAIL");

    expect(err1.statusCode).toBe(401);
    expect(err1.message).toBe("Unauthorized");
    expect(err1.errors).toEqual(["token expired"]);
    expect(err1.stack).toBe("stack1");
    expect(err1.errorCode).toBe("TOKEN_EXPIRED");

    expect(err2.statusCode).toBe(500);
    expect(err2.message).toBe("Internal Error");
    expect(err2.errors).toEqual(["db failed"]);
    expect(err2.stack).toBe("stack2");
    expect(err2.errorCode).toBe("DB_FAIL");
  });

  it("should set errors to empty array if empty array passed", () => {
    const response = new ApiError(400, "Error", []);
    expect(response.errors).toEqual([]);
  });

  it("should set errors to empty array if undefined passed", () => {
    const response = new ApiError(400, "Error", undefined);
    expect(response.errors).toEqual([]);
  });
});
