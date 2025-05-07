// Import all the necessary dependencies
import { connectMonogoDbDataBase, connectRedis } from "./config/index.js";
import app from "./app.js";
import { createServer } from "http";
import { type Request, type Response } from "express";

const port = process.env.PORT || 3000;

// Import the socket to initialize
const httpServer = createServer(app);

import { initSockets } from "./socket/index.js";

// initialize socket.io
initSockets(httpServer);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

// Connect to the mongoDb database 
connectMonogoDbDataBase().then(() => {
  // After connecting to the mongodb database connect to the redis
  connectRedis().then(() => {
    httpServer.listen(port, () => {   // ✅ CHANGED THIS LINE!
      console.log(`Server is running on port ${port}`);
    });
  }).catch((error) => { // Handle error if error occurs while connecting to redis
    console.log(`Error: ${error.message}`);
    process.exit(1);
  });
}).catch((error) => { // Handle error if error occurs while connecting to mongodb
  console.log(`Error: ${error.message}`);
  process.exit(1);
});
