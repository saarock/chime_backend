/**
 * Global API response
 */
class ApiResponse {
  statusCode: number;
  data: any;
  message: string;
  success: boolean;

  constructor(statusCode: number, data: any, message: string) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message.toString();
    this.success = statusCode < 400; // Optional: track if it's a success response
  }

  getStatusCode() {
    return this.statusCode;
  }

  getData() {
    return this.data;
  }

  getMessage() {
    return this.message;
  }

  isSuccess() {
    return this.success;
  }
}

// Import
export default ApiResponse;
