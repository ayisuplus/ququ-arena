import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { Connection } from './connection.ts';
import type { Budget, HarnessCall, Profile, Trial } from './types.ts';
import { BASE_PROMPT } from './extensions.ts';
import type { NativeHost } from './native-host.ts';

export function safeRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /原生扩展|调用预算|执行预算|累计失败|完整答案|上下文|context.{0,16}(length|limit|window)|maximum context/i.test(
      message,
    )
  )
    return /context/i.test(message) && !/原生扩展/.test(message)
      ? '上下文超过接口上限；材料未被裁剪'
      : message.slice(0, 300);
  const status = message.match(/\b(400|401|403|404|408|429|500|502|503|504)\b/)?.[0];
  return status
    ? `模型接口 HTTP ${status}；请检查该模型连接状态`
    : /abort|timeout|timed out/i.test(message)
      ? '模型请求中止或超时'
      : '模型执行失败；答卷与公开调用轨迹已保留';
}
function failureStream(model: Connection['model'], message: string) {
  const stream = createAssistantMessageEventStream();
  const error: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    stopReason: 'error',
    errorMessage: message,
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  stream.push({ type: 'error', reason: 'error', error });
  stream.end(error);
  return stream;
}

/** Observe usage presence without keeping provider payloads, headers, or credentials. */
function meteredFetch(call: HarnessCall): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.body) return response;
    let buffer = '';
    const decoder = new TextDecoder();
    const inspect = (line: string) => {
      try {
        const value = JSON.parse(line.replace(/^data:\s*/, '')),
          u = value.usage ?? value.message?.usage;
        if (typeof value.model === 'string' && value.model.length <= 300) call.reportedModel = value.model;
        if (typeof value.provider === 'string' && value.provider.length <= 300) call.reportedProvider = value.provider;
        if (!u) return;
        const inputTokens = u.prompt_tokens ?? u.input_tokens,
          output = u.completion_tokens ?? u.output_tokens;
        if (typeof inputTokens === 'number' && typeof output === 'number') {
          const cached =
            u.prompt_tokens_details?.cached_tokens ??
            u.input_tokens_details?.cached_tokens ??
            u.cache_read_input_tokens;
          const write = u.cache_creation_input_tokens;
          call.usage = {
            input: inputTokens + (u.input_tokens !== undefined ? (cached ?? 0) + (write ?? 0) : 0),
            output,
            ...(typeof cached === 'number' ? { cachedInput: cached } : {}),
            ...(typeof write === 'number' ? { cacheWrite: write } : {}),
          };
        } else if (call.usage && typeof output === 'number') call.usage.output = output;
      } catch {
        /* Partial frames are consumed on the next chunk. */
      }
    };
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n')) >= 0) {
            inspect(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
          }
          if (buffer.length > 2_000_000) buffer = '';
          controller.enqueue(chunk);
        },
        flush() {
          buffer += decoder.decode();
          inspect(buffer);
        },
      }),
    );
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export class PiTrial {
  private agent: Agent;
  private failures = 0;
  private phase = 'solve';
  private round = '';
  private budgetError = '';
  private toolError = false;
  private native?: NativeHost;
  private nativeError?: Error;
  private useTools = true;
  readonly trial: Trial;
  readonly profile: Profile;
  readonly tools: AgentTool<any>[];
  readonly signal: AbortSignal;
  readonly changed: (kind: string, text: string) => void;
  constructor(
    connection: Connection,
    trial: Trial,
    budget: Budget,
    profile: Profile,
    tools: AgentTool<any>[],
    signal: AbortSignal,
    changed: (kind: string, text: string) => void,
    native?: NativeHost,
  ) {
    this.trial = trial;
    this.profile = profile;
    this.tools = tools;
    this.signal = signal;
    this.changed = changed;
    this.native = native;
    const stream: StreamFn = (model, context, options) => {
      if (signal.aborted) return failureStream(model, '执行预算已耗尽或实验已中止');
      if (this.nativeError) return failureStream(model, this.nativeError.message);
      if (trial.calls.length >= budget.maxCalls) {
        this.budgetError = '调用预算已耗尽';
        return failureStream(model, this.budgetError);
      }
      const call: HarnessCall = {
        number: trial.calls.length + 1,
        round: this.round,
        phase: this.phase,
        startedAt: new Date().toISOString(),
        status: 'running',
        text: '',
        reasoning: '',
      };
      trial.calls.push(call);
      changed('call', `${this.round} · ${this.phase} · 调用 ${call.number}`);
      const output = createAssistantMessageEventStream();
      void (async () => {
        try {
          const source = await connection.stream(model, context, {
            ...options,
            apiKey: connection.apiKey,
            signal: AbortSignal.any([signal, ...(options?.signal ? [options.signal] : [])]),
            maxRetries: 0,
            temperature: 0,
            reasoning: undefined,
            cacheRetention: 'none',
            maxTokens: budget.maxOutputTokens,
            fetch: meteredFetch(call),
          });
          for await (const event of source) {
            if (event.type === 'text_delta' && !signal.aborted) call.text += event.delta;
            if (event.type === 'thinking_delta' && !signal.aborted) call.reasoning += event.delta;
            if (event.type === 'done' || event.type === 'error') {
              const message = event.type === 'done' ? event.message : event.error;
              call.status = signal.aborted ? 'aborted' : message.stopReason;
              // The final message is authoritative: handles empty deltas / end-only provider output.
              if (!signal.aborted) {
                call.text = message.content
                  .filter((b) => b.type === 'text')
                  .map((b) => b.text)
                  .join('');
                call.reasoning = message.content
                  .filter((b) => b.type === 'thinking' && !b.redacted)
                  .map((b) => (b.type === 'thinking' ? b.thinking : ''))
                  .join('');
              }
              if (event.type === 'error') {
                call.error = safeRuntimeError(message.errorMessage);
                event.error.errorMessage = call.error;
              }
              // pi supplies zero defaults when a provider omits usage. Only observed fields count as reported.
            }
            output.push(event);
            changed('progress', '');
          }
          output.end(await source.result());
        } catch (e) {
          call.error = safeRuntimeError(e);
          call.status = 'error';
          const failed = failureStream(model, call.error);
          for await (const event of failed) output.push(event);
          output.end(await failed.result());
        } finally {
          call.elapsedMs = Date.now() - Date.parse(call.startedAt);
          changed('call_end', `调用 ${call.number} · ${call.status}`);
        }
      })();
      return output;
    };
    this.agent = new Agent({
      initialState: {
        model: connection.model,
        systemPrompt: BASE_PROMPT,
        tools: this.liveTools(),
        thinkingLevel: 'off',
      },
      streamFn: stream,
      toolExecution: 'sequential',
      transformContext: native
        ? async (messages) => {
            try {
              return await this.nativeRequest('context', { messages });
            } catch {
              return messages;
            }
          }
        : undefined,
      convertToLlm: native
        ? (messages) =>
            messages.flatMap((m: any) =>
              ['user', 'assistant', 'toolResult'].includes(m.role)
                ? [m]
                : m.role === 'custom'
                  ? [{ role: 'user', content: m.content, timestamp: m.timestamp ?? Date.now() }]
                  : [],
            )
        : undefined,
      prepareNextTurnWithContext: native
        ? ({ context }) => ({ context: { ...context, tools: this.liveTools() } })
        : undefined,
      beforeToolCall: async (ctx) => {
        if (signal.aborted || this.budgetError || this.nativeError)
          return { block: true, terminate: true, reason: '实验已停止' };
        if (!native) return;
        const data = await this.nativeRequest('tool_call', {
          event: { toolCallId: ctx.toolCall.id, toolName: ctx.toolCall.name, input: ctx.args },
        });
        if (data.input && ctx.args && typeof ctx.args === 'object') {
          for (const key of Object.keys(ctx.args)) delete (ctx.args as any)[key];
          Object.assign(ctx.args, data.input);
        }
        return data.result;
      },
      afterToolCall: native
        ? (ctx) =>
            this.nativeRequest('tool_result', {
              event: {
                toolCallId: ctx.toolCall.id,
                toolName: ctx.toolCall.name,
                input: ctx.args,
                ...ctx.result,
                isError: ctx.isError,
              },
            })
        : undefined,
    });
    this.agent.subscribe((event) => {
      if (signal.aborted) return;
      if (event.type === 'tool_execution_start') changed('tool', event.toolName + ' ' + JSON.stringify(event.args));
      if (event.type === 'tool_execution_end') {
        if (event.isError) this.toolError = true;
        changed('tool_result', JSON.stringify(event.result));
      }
    });
  }
  private liveTools() {
    return this.useTools ? (this.native?.tools(this.tools) ?? this.tools) : [];
  }
  private async nativeRequest(op: string, args: Record<string, unknown>) {
    try {
      return await this.native!.request(op, args);
    } catch (e) {
      this.nativeError = e as Error;
      throw e;
    }
  }
  private async prompt(text: string, phase: string, useTools: boolean) {
    this.signal.throwIfAborted();
    this.phase = phase;
    this.useTools = useTools;
    if (this.native) {
      const result = await this.nativeRequest('before_agent', { prompt: text, systemPrompt: BASE_PROMPT });
      this.agent.state.systemPrompt = result?.systemPrompt ?? BASE_PROMPT;
      for (const message of result?.messages ?? [])
        this.agent.state.messages = [
          ...this.agent.state.messages,
          { role: 'user', content: message.content, timestamp: Date.now() },
        ];
    }
    this.agent.state.tools = this.liveTools();
    const before = [...this.agent.state.messages];
    while (true) {
      const abort = () => this.agent.abort();
      this.signal.addEventListener('abort', abort, { once: true });
      try {
        await this.agent.prompt(text);
      } finally {
        this.signal.removeEventListener('abort', abort);
      }
      this.signal.throwIfAborted();
      if (this.nativeError) throw this.nativeError;
      if (this.native)
        await this.nativeRequest('agent_end', { messages: this.agent.state.messages.slice(before.length) });
      const final = this.agent.state.messages.at(-1);
      if (!this.budgetError && final?.role === 'assistant' && final.stopReason === 'stop') {
        const answer = final.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');
        if (
          answer.trim() ||
          (useTools &&
            this.tools.length &&
            this.agent.state.messages.slice(before.length).some((m) => m.role === 'toolResult'))
        )
          return answer;
      }
      if (this.budgetError) throw new Error(this.budgetError);
      // Tool side effects may have occurred. Never replay the entire prompt after a tool batch.
      if (this.agent.state.messages.slice(before.length).some((m) => m.role === 'toolResult') || this.toolError)
        throw new Error('模型工具循环未产生完整答案');
      if (++this.failures >= 3) throw new Error('累计失败 3 次，当前试验停止');
      this.agent.state.messages = [...before];
      this.changed('retry', `调用失败，重试 ${this.failures}/2`);
    }
  }
  async answer(roundId: string, text: string) {
    this.round = roundId;
    const plan = this.profile.extensions.find((e) => e.id === 'plan'),
      review = this.profile.extensions.find((e) => e.id === 'review');
    if (plan) await this.prompt(text + '\n\n' + plan.prompt, 'plan', false);
    let answer = await this.prompt(plan ? '现在执行上面的原始任务。' : text, 'solve', true);
    if (review) answer = await this.prompt(review.prompt, 'review', true);
    return answer;
  }
  async close() {
    this.agent.abort();
    await this.agent.waitForIdle();
    await this.native?.close(true);
  }
}
