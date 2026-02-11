// Import all the necessary dependencies here
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import expressEjsLayouts from "express-ejs-layouts";
import helmet from "helmet";


const app = express();

// ##################### Security start ################### //
app.use(helmet());

// app configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
// Proxy
app.set('trust proxy', 1);
// Limit repeated requests to public APIs and/or endpoints such as login
const limiter = rateLimit({
  windowMs: 15 * 60 * 10000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);



// To accept the JSON From the server
app.use(express.json({ limit: "10mb" }));

// Data sanitization against NoSQL query injection


// Prevent HTTP Parameter Pollution
app.use(hpp());

// Enable gzip compression for responses (performance & security)
app.use(compression());

// ##################### Security end ################### //



// Equivalent to __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Set up EJS 
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));



// Enables layout
app.use(expressEjsLayouts);
app.set("layout", "layouts/master");

// Cookie parser
app.use(cookieParser());
// URL configuration
app.use(
  express.urlencoded({
    extended: true,
  }),
);

// For image configuration
app.use(express.static("public"));

/**
 * Node secutiry
 */

// Api Routers
import { feedBackRouter, userRouter } from "./routes/api/index.js";
app.use("/api/v1/users", userRouter);
app.use("/api/v1/users", feedBackRouter);

// Admin routers
import { dashBoardRoute } from "./routes/admin/index.js";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import compression from "compression";
app.use("/admin/", dashBoardRoute);


// Export the app 
export default app;
