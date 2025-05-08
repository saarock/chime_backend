import { describe, it, expect } from "vitest";
import { ApiResponse } from "../../../src/utils/index.js";

describe("ApiResponse class", () => {
  it("should correctly set properties in the consturctor (success case", () => {
    const statusCode = 200;
    const data = { id: 1, name: "saarock" };
    const message = "success";

    const response = new ApiResponse(statusCode, data, message);

    expect(response.getStatusCode()).toBe(statusCode);
    expect(response.getData()).toBe(data);
    expect(response.getMessage()).toBe(message);
    expect(response.isSuccess()).toBe(true);
  });

  it("it should set success to false if the status code is >= 400", () => {
    const statusCode = 404;
    const data = { id: 1, name: "saarock" };
    const message = "Not Found";

    const response = new ApiResponse(statusCode, data, message);

    expect(response.getStatusCode()).toBe(statusCode);
    expect(response.getData()).toBe(data);
    expect(response.getMessage()).toBe(message);
    expect(response.isSuccess()).toBe(false);
  });
});
