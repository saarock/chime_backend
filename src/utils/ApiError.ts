class ApiError extends Error {
  statusCode: number;
  message: string;
  data: any;
  success: boolean;
  errors: string[];
  stack: string;
  errorCode: string;

  constructor(
    statusCode: number,
    message: string,
    errors?: string[],
    stack?: string,
    errorCode?: string,
  ) {
   
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.data = null;
    this.success = false;
    this.errorCode = errorCode ? errorCode : ""
    this.errors = errors && errors?.length > 0 ? errors : [];
    this.stack = stack || new Error().stack || "";
  }
}

export default ApiError;
