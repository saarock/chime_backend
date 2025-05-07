class ApiError extends Error {
    statusCode: number;
    message: string;
    data: any;
    success:boolean;
    errors: string[];
    stack: string;


    constructor(
        statusCode:number,
        message:string,
        errors?: string[],
        stack?: string,
    ) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.data = null;
        this.success = false;
        this.errors = errors ? errors : [];
        this.stack = stack || new Error().stack || "";
    }
}


export default ApiError;
