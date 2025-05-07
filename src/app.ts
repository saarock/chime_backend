
// Import all the necessary dependencies here
import express from "express";
import cors from "cors";
import dotenv from "dotenv";



// config the dotenv
dotenv.config();


const app = express();






// app configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
}));
// To accept the JSON From the server
app.use(express.json());
// URL configuration
app.use(express.urlencoded(
    {
        extended: true,
    }
));
// For image configuration
app.use(express.static("public"));



// Routers
import { userRouter } from "./routes/index.js";
app.use("/api/v1/users", userRouter);


export default app;

