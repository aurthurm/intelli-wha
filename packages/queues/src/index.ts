import { Queue } from "bullmq";
import { deliveryQueueName, deliveryMessage } from "./delivery.js";
import { Redis } from "ioredis";
import { env } from "@intelli-wha/config";
import type { JobRequest } from "@intelli-wha/core";
import { createQueuedGenerationJob } from "@intelli-wha/db";

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const mediaQueue = new Queue("media", { connection });
export { deliveryQueueName, deliveryMessage } from "./delivery.js";

export const deliveryQueues = {
  telegram: new Queue(deliveryQueueName("telegram"), { connection }),
  whatsapp: new Queue(deliveryQueueName("whatsapp"), { connection }),
};

export async function enqueueJob(job: JobRequest) {
  const queue =
    job.name === "chat.deliverMessage"
      ? deliveryQueues[deliveryMessage(job.payload).channel]
      : mediaQueue;
  const generationJobId = await createQueuedGenerationJob(job);
  const payload =
    generationJobId && job.payload && typeof job.payload === "object"
      ? { ...job.payload, generationJobId }
      : job.payload;

  return queue.add(job.name, payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
