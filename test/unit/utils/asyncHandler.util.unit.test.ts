import { describe, it, expect, vi, beforeEach } from "vitest";
import asyncHandler from "../../../src/utils/asyncHandler"; // adjust path
import ApiError from "../../../src/utils/ApiError"; // adjust path

describe("asyncHandler", () => {
  const req = {} as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any;
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should call the passed function if no error", async () => {
    const controller = vi.fn().mockResolvedValue("ok");
    const wrapped = asyncHandler(controller);

    await wrapped(req, res, next);

    expect(controller).toHaveBeenCalledWith(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("should catch errors and send ApiError response", async () => {
    const errorMessage = "Something went wrong";
    const error = new Error(errorMessage);
    const controller = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(controller);

    await wrapped(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500); // since statusCode missing
    expect(res.json).toHaveBeenCalledWith(expect.any(ApiError));

    const apiErrorInstance = res.json.mock.calls[0][0];
    expect(apiErrorInstance.message).toBe(errorMessage);
    expect(apiErrorInstance.statusCode).toBe(500);
    expect(apiErrorInstance.stack).toContain("Error");
  });

  it("should respect error.statusCode if provided and > 400", async () => {
    const error = { statusCode: 404, message: "Not Found" };
    const controller = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(controller);

    await wrapped(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.any(ApiError));

    const apiErrorInstance = res.json.mock.calls[0][0];
    expect(apiErrorInstance.message).toBe("Not Found");
    expect(apiErrorInstance.statusCode).toBe(404);
  });

  it("should fallback to 500 if error.statusCode <= 400", async () => {
    const error = { statusCode: 300, message: "Bad Status" };
    const controller = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(controller);

    await wrapped(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.any(ApiError));

    const apiErrorInstance = res.json.mock.calls[0][0];
    expect(apiErrorInstance.statusCode).toBe(500);
  });
});
