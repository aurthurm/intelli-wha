import type { AgentInput, AgentModule, AgentPlugin } from "@intelli-wha/core";

export class AgentRegistry {
  private readonly plugins: AgentPlugin[];

  constructor(plugins: AgentPlugin[]) {
    this.plugins = plugins;
  }

  async resolve(input: AgentInput): Promise<AgentModule | undefined> {
    const active = input.runtime.activeAgentId ? this.plugins.find((plugin) => plugin.id === input.runtime.activeAgentId) : undefined;
    if (active) return active;

    for (const plugin of this.plugins) {
      if (await plugin.canHandle(input)) return plugin;
    }

    return undefined;
  }
}
