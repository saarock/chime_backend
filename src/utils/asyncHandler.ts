// Import all the necessary dependencies here
import { type Request, type Response, type NextFunction } from "express";
import ApiError from "./ApiError.js";

/**
 * This function is the async wrapper that handles all errors in async tasks.
 * @param fn The controller function.
 */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return await fn(req, res, next);
    } catch (error: any) {
      res
        .status(
          error.statusCode
            ? error.statusCode >= 400
              ? error.statusCode
              : 500
            : 500,
        )
        .json(
          new ApiError(
            error.statusCode && error.statusCode >= 400
              ? error.statusCode
              : 500,
            error?.message ?? "Something is wrong",
            [],
            error instanceof Error ? error.stack : "",
            error?.errorCode ?? "Something went wrong",
          ),
        );
    }
  };

export default asyncHandler;
