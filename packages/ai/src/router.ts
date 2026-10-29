import type { AiTask, GenerationQuality } from "@intelli-wha/core";
import type { AiProvider } from "./types.js";

export class ModelRouter {
  constructor(private readonly providers: AiProvider[]) {}

  select(task: AiTask, _quality: GenerationQuality = "draft") {
    const provider = this.providers.find((candidate) => candidate.supports(task));
    if (!provider) {
      throw new Error(`No AI provider registered for task: ${task}`);
    }
    return provider;
  }
}
