import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Worker } from "bullmq";
import { ModelRouter, OpenAiProvider, StubAiProvider } from "@intelli-wha/ai";
import { env } from "@intelli-wha/config";
import { createAssetForGenerationJob, updateGenerationJobStatus } from "@intelli-wha/db";
import { logger } from "@intelli-wha/logger";
import { createTextPoster } from "@intelli-wha/media";
import { connection, enqueueJob } from "@intelli-wha/queues";

const modelRouter = new ModelRouter([new OpenAiProvider(), new StubAiProvider()]);

const worker = new Worker(
  "media",
  async (job) => {
    logger.info({ jobName: job.name, jobId: job.id }, "Processing media job");
    const generationJobId = generationJobIdFrom(job.data);

    if (generationJobId) await updateGenerationJobStatus(generationJobId, "running");

    try {
      const result = await handleMediaJob(job.name, job.data, generationJobId);

      if (generationJobId) {
        await updateGenerationJobStatus(generationJobId, "completed", asResult(result));
      }

      return result;
    } catch (error) {
      if (generationJobId) {
        await updateGenerationJobStatus(generationJobId, "failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      throw error;
    }
  },
  { connection }
);

async function handleMediaJob(jobName: string, data: unknown, generationJobId?: string) {
  if (jobName === "seller.generatePreview") {
    const payload = data as {
      brief?: { price?: string; style?: string; platform?: string };
      channel?: "whatsapp" | "telegram";
      chatId?: string;
      userId?: string;
    };

    const visionProvider = modelRouter.select("vision", "draft");
    const vision = await visionProvider.analyzeImage?.({
      image: "",
      prompt: "Analyze the product image for sales content generation."
    });

    const poster = await createTextPoster({
      title: vision?.productType ?? "Product Preview",
      price: payload.brief?.price,
      contact: "Reply YES for final pack or send changes.",
      format: payload.brief?.platform === "whatsapp-status" ? "whatsapp-status" : "square"
    });

    const asset = generationJobId
      ? await saveGeneratedAsset({
          generationJobId,
          buffer: poster,
          fileName: "preview.png",
          mimeType: "image/png",
          metadata: { jobName, brief: payload.brief }
        })
      : undefined;

    if (payload.channel && payload.chatId) {
      await enqueueJob({
        name: "chat.deliverMessage",
        payload: {
          message: {
            channel: payload.channel,
            chatId: payload.chatId,
            text: "Here’s a low-cost preview. Reply YES to create the final pack, or tell me what to change.",
            media: [
              {
                kind: "image",
                bufferBase64: poster.toString("base64"),
                mimeType: "image/png",
                fileName: "preview.png",
                caption: "Preview"
              }
            ]
          }
        }
      });
    }

    return {
      mimeType: "image/png",
      bytes: poster.byteLength,
      delivered: Boolean(payload.channel && payload.chatId),
      assetId: asset?.id,
      assetUrl: asset?.url
    };
  }

  if (jobName === "seller.generateFinalPack") {
    const imageProvider = modelRouter.select("image-edit", "final");
    return imageProvider.editImage?.({
      prompt: "Create final WhatsApp-ready sales assets for the seller.",
      quality: "final",
      size: "1024x1536"
    });
  }

  logger.warn({ jobName }, "No handler registered for job");
  return { skipped: true };
}

async function saveGeneratedAsset(input: {
  generationJobId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}) {
  const relativePath = join("assets", "previews", `${input.generationJobId}-${randomUUID()}-${input.fileName}`);
  const absolutePath = resolve(env.LOCAL_STORAGE_DIR, relativePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  return createAssetForGenerationJob({
    generationJobId: input.generationJobId,
    kind: "image",
    url: `local://${relativePath}`,
    mimeType: input.mimeType,
    metadata: {
      ...input.metadata,
      filePath: absolutePath,
      bytes: input.buffer.byteLength
    }
  });
}

function generationJobIdFrom(data: unknown) {
  return data && typeof data === "object" && "generationJobId" in data && typeof data.generationJobId === "string"
    ? data.generationJobId
    : undefined;
}

function asResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return { value: result };
  return result as Record<string, unknown>;
}

worker.on("completed", (job) => logger.info({ jobId: job.id, jobName: job.name }, "Job completed"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "Job failed"));

logger.info("Worker started.");
