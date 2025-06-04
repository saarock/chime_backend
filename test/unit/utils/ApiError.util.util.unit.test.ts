import { describe, it, expect } from "vitest";
import { ApiError } from "../../../src/utils/index.js";

describe("ApiError class", () => {
  it("Should correctly set the property in the constructor", () => {
    const statusCode = 404;
    const message = "Not Found";
    const data = null;
    const success = false;
    const errors = [];
    const stacks = "";
    const errorCode = "Invalid Token";

    const response = new ApiError(statusCode, message, errors, stacks, errorCode);

    expect(response.statusCode).toBe(statusCode);
    expect(response.message).toBe(message);
    expect(response.data).toBe(data);
    expect(response.success).toBe(success);
    expect(response.errors).toEqual(errors);
  });
});
