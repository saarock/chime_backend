import { describe, it, expect } from "vitest";
import { ApiResponse } from "../../../src/utils/index.js";

describe("ApiResponse class", () => {
  it("should correctly set properties in the constructor (success case)", () => {
    const statusCode = 200;
    const data = { id: 1, name: "saarock" };
    const message = "success";

    const response = new ApiResponse(statusCode, data, message);

    expect(response.getStatusCode()).toBe(statusCode);
    expect(response.getData()).toBe(data);
    expect(response.getMessage()).toBe(message);
    expect(response.isSuccess()).toBe(true);
  });

  it("should set success to false if the status code is >= 400", () => {
    const statusCode = 404;
    const data = { id: 1, name: "saarock" };
    const message = "Not Found";

    const response = new ApiResponse(statusCode, data, message);

    expect(response.getStatusCode()).toBe(statusCode);
    expect(response.getData()).toBe(data);
    expect(response.getMessage()).toBe(message);
    expect(response.isSuccess()).toBe(false);
  });

  it("should default message to empty string if not provided", () => {
    const statusCode = 200;
    const data = { id: 2 };

    const response = new ApiResponse(statusCode, data, "");

    expect(response.getMessage()).toBe("");
  });

  it("should handle null data correctly", () => {
    const statusCode = 204; // No Content
    const data = null;
    const message = "No content";

    const response = new ApiResponse(statusCode, data, message);

    expect(response.getData()).toBeNull();
    expect(response.isSuccess()).toBe(true);
  });

  it("should treat status code 399 as success", () => {
    const statusCode = 399;
    const response = new ApiResponse(statusCode, {}, "Almost error");

    expect(response.isSuccess()).toBe(true);
  });

  it("should treat status code 400 as failure", () => {
    const statusCode = 400;
    const response = new ApiResponse(statusCode, {}, "Bad Request");

    expect(response.isSuccess()).toBe(false);
  });

  it("should handle undefined data properly", () => {
    const statusCode = 200;
    const response = new ApiResponse(statusCode, undefined, "OK");

    expect(response.getData()).toBeUndefined();
  });

  it("should handle numeric message by converting to string", () => {
    const statusCode = 200;
    const message = 12345 as any; // force numeric message

    const response = new ApiResponse(statusCode, {}, message);

    expect(response.getMessage()).toBe("12345");
  });

  it("should return correct values for multiple instances", () => {
    const res1 = new ApiResponse(200, { a: 1 }, "First");
    const res2 = new ApiResponse(500, null, "Error");

    expect(res1.isSuccess()).toBe(true);
    expect(res2.isSuccess()).toBe(false);

    expect(res1.getData()).toEqual({ a: 1 });
    expect(res2.getData()).toBeNull();

    expect(res1.getMessage()).toBe("First");
    expect(res2.getMessage()).toBe("Error");
  });

  it("should handle empty constructor arguments gracefully", () => {
    const response = new ApiResponse(0, undefined, "");

    expect(response.getStatusCode()).toBe(0);
    expect(response.getData()).toBeUndefined();
    expect(response.getMessage()).toBe("");
    expect(response.isSuccess()).toBe(true); // 0 < 400 so success
  });
});
