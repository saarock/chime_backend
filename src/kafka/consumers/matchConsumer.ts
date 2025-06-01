// /kafka/consumers/matchConsumer.ts
import { videoSocket } from "../../socket/index.js";
import { createConsumer } from "./baseConsumer.js";


/**
 * kafka match making for users
 */
export const startMatchConsumer = async () => {
    await createConsumer("match-user", "match-group", async (data) => {
        if (!videoSocket) {
            console.log("no video socket found");
            return;
        }

        const { callerId, calleeId, isCaller } = data; // userId means calleId

        await videoSocket.matchFound(callerId, calleeId, isCaller);
    });
};
