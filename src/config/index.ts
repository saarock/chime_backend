
// Import all the necessary dependencies here 
import connectMonogoDbDataBase from "./mongoDb.js";
import { connectRedis, client } from "./redis.js";



// Export all the necessary dependencies here
export {
    connectMonogoDbDataBase,
    connectRedis,
    client,

}