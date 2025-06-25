// Import all the necessary dependencies here
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import expressEjsLayouts from "express-ejs-layouts";

// config the dotenv
dotenv.config();


const app = express();

// Equivalent to __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Set up EJS 
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Enables layout
app.use(expressEjsLayouts);
app.set("layout", "layouts/master");



// app configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);

// To accept the JSON From the server
app.use(express.json());
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
app.use("/admin/", dashBoardRoute);



export default app;
