/**
 * Prompt caching optimization for Anthropic models.
 *
 * Manages cache control breakpoints on system prompts to reduce token costs
 * on repeated calls with stable system prompts.
 */

export interface PromptCacheConfig {
  enabled?: boolean;
  systemPromptCacheBreakpoints?: number;
}

export interface CacheStats {
  cacheHits: number;
  cacheMisses: number;
  estimatedSavingsUsd: number;
}

export class PromptCache {
  private config: PromptCacheConfig;
  private stats: CacheStats = { cacheHits: 0, cacheMisses: 0, estimatedSavingsUsd: 0 };

  constructor(config?: PromptCacheConfig) {
    this.config = config ?? { enabled: true };
  }

  get enabled(): boolean {
    return this.config.enabled !== false;
  }

  /**
   * Check if a model supports prompt caching.
   */
  supportsModel(modelId: string): boolean {
    // Anthropic models support prompt caching
    return modelId.startsWith("claude-");
  }

  /**
   * Apply cache control headers to a system prompt.
   * Adds cache_control breakpoints at strategic positions.
   */
  applyCacheControl(
    systemPrompt: string,
  ): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
    if (!this.enabled) {
      return [{ type: "text", text: systemPrompt }];
    }

    const breakpoints = this.config.systemPromptCacheBreakpoints ?? 2;

    if (breakpoints <= 1) {
      return [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
    }

    // Split system prompt into chunks at natural boundaries
    const chunks = this.splitAtBoundaries(systemPrompt, breakpoints);
    return chunks.map((text, i) => {
      const block: { type: "text"; text: string; cache_control?: { type: "ephemeral" } } = {
        type: "text",
        text,
      };
      // Apply cache control to all but the last chunk
      if (i < chunks.length - 1) {
        block.cache_control = { type: "ephemeral" };
      }
      return block;
    });
  }

  /**
   * Record a cache hit/miss for stats tracking.
   */
  recordCacheEvent(hit: boolean, savedTokens?: number): void {
    if (hit) {
      this.stats.cacheHits++;
      // Anthropic cache reads cost 0.1x of normal input; savings = 0.9x
      if (savedTokens) {
        this.stats.estimatedSavingsUsd += (savedTokens / 1_000_000) * 0.015 * 0.9;
      }
    } else {
      this.stats.cacheMisses++;
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private splitAtBoundaries(text: string, chunks: number): string[] {
    if (chunks <= 1) return [text];

    // Split at double-newline boundaries (section breaks)
    const sections = text.split(/\n\n/);
    if (sections.length <= chunks) {
      return sections.map((s) => s + "\n\n").filter((s) => s.trim().length > 0);
    }

    const sectionsPerChunk = Math.ceil(sections.length / chunks);
    const result: string[] = [];
    for (let i = 0; i < sections.length; i += sectionsPerChunk) {
      const chunk = sections.slice(i, i + sectionsPerChunk).join("\n\n");
      if (chunk.trim()) {
        result.push(chunk);
      }
    }
    return result;
  }
}
