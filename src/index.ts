// Import all the necessary dependencies

import app from "./app.js";
import { createServer } from "http";
import { type Request, type Response } from "express";
import { initSockets } from "./socket/index.js";

// PORT
const port = process.env.PORT || 8000;

// Import the socket to initialize
const httpServer = createServer(app);

// initialize socket.io
initSockets(httpServer);


/**
 * For testing
 */
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});



// Imports
import { connectMonogoDbDataBase, connectRedis } from "./configs/index.js";
import { connectProducer } from "./kafka/producer.js";
import { startMatchConsumer } from "./kafka/consumers/matchConsumer.js";
import { handleErrors } from "./kafka/consumers/errorConsumer.js";
import { handleEndCalls } from "./kafka/consumers/callEndConsumer.js";





// Connect to the mongoDb database, kafka and redis of all successfully connected then run server
connectMonogoDbDataBase()
  .then(async () => {
    return await connectRedis();
  })
  .then(async () => {
    return await Promise.all([
      connectProducer(),
      startMatchConsumer(),
      handleErrors(),
      handleEndCalls(),
    ]);
  })
  .then(() => {
    httpServer.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Startup error:", error);
    process.exit(1);
  });