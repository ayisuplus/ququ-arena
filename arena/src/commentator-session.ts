import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Agent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import { AgentSession, COMMENTATOR_INSTRUCTIONS, type AgentEvent, type CommentatorSession } from './agent-session.ts';
import { askModel, resolveContestant } from './models.ts';
import { readModelSettings } from './model-settings.ts';
import { commentatorSettings, type CommentatorProfile } from './commentator-settings.ts';
import { jsonLines } from './streams.ts';

export function createCommentatorSession(id: string, cwd: string): CommentatorSession {
  return id === 'codex' || id === 'claude' ? new AgentSession(id, cwd) : new OpenCommentatorSession(id, cwd);
}
export class OpenCommentatorSession implements CommentatorSession {
  private controller?: AbortController;
  private agent?: Agent;
  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  private id: string;
  private cwd: string;
  private timeoutMs: number;
  constructor(id: string, cwd: string, timeoutMs = 120000) {
    this.id = id;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
  }
  cancel() {
    this.controller?.abort(new Error('解说已取消'));
    this.agent?.abort();
    this.child?.kill();
  }
  close() {
    this.closed = true;
    this.cancel();
  }
  async send(prompt: string, emit: (event: AgentEvent) => void) {
    if (this.closed) throw new Error('解说会话已关闭');
    if (this.controller) throw new Error('解说正在生成');
    const controller = (this.controller = new AbortController());
    const timer = setTimeout(() => controller.abort(new Error('解说超时，请检查模型或 Agent')), this.timeoutMs);
    try {
      const selected = this.id.startsWith('llm:')
        ? { kind: 'llm', modelId: this.id.slice(4), prompt: '' }
        : (await commentatorSettings.read()).find((p) => p.id === this.id);
      if (!selected) throw new Error('解说配置已移除，请重新选择');
      controller.signal.throwIfAborted();
      const systemPrompt =
        COMMENTATOR_INSTRUCTIONS + (selected.prompt ? '\n\n解说风格与偏好：\n' + selected.prompt : '');
      if (selected.kind === 'command')
        await this.command(selected as CommentatorProfile, prompt, systemPrompt, emit, controller.signal);
      else {
        if (!selected.modelId) throw new Error('请先为 Pi 解说选择模型');
        const settings = await readModelSettings();
        controller.signal.throwIfAborted();
        const model = resolveContestant(selected.modelId);
        const generate = async () => {
          const blocks = new Map<string, string>();
          const answer = await askModel(model, { id: 'commentary', condition: 'commentary', input: prompt }, 'exact', {
            modelSettings: settings,
            systemPrompt,
            signal: controller.signal,
            maxTokens: 1800,
            onDelta: (delta) => {
              if (controller.signal.aborted) return;
              const key = delta.channel + ':' + delta.block;
              blocks.set(key, delta.replace ? delta.delta : (blocks.get(key) ?? '') + delta.delta);
              emit({
                type: delta.channel === 'answer' ? 'text' : 'reasoning',
                text: [...blocks]
                  .filter(([k]) => k.startsWith(delta.channel + ':'))
                  .map(([, v]) => v)
                  .join('\n'),
              });
            },
          });
          controller.signal.throwIfAborted();
          if (!answer.text.trim()) throw new Error('解说模型返回空文本');
          emit({ type: 'text', text: answer.text });
          if (answer.reasoning) emit({ type: 'reasoning', text: answer.reasoning });
          if (answer.usage) emit({ type: 'usage', input: answer.usage.input ?? 0, output: answer.usage.output ?? 0 });
          return answer;
        };
        if (selected.kind === 'llm') await generate();
        else {
          // Pi owns the agent lifecycle; model transport remains the same tested arena provider.
          const descriptor: Model<'openai-completions'> = {
            id: model.id,
            name: model.name,
            api: 'openai-completions',
            provider: 'ququ-commentary',
            baseUrl: '',
            reasoning: false,
            input: ['text'],
            contextWindow: 128000,
            maxTokens: 1800,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          };
          this.agent = new Agent({
            initialState: { model: descriptor, systemPrompt, tools: [], thinkingLevel: 'off' },
            streamFn: () => {
              const stream = createAssistantMessageEventStream();
              void (async () => {
                const message: AssistantMessage = {
                  role: 'assistant',
                  content: [],
                  api: descriptor.api,
                  provider: descriptor.provider,
                  model: descriptor.id,
                  timestamp: Date.now(),
                  stopReason: 'stop',
                  usage: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                  },
                };
                try {
                  const out = await generate();
                  message.content = [{ type: 'text', text: out.text }];
                  message.usage.input = out.usage?.input ?? 0;
                  message.usage.output = out.usage?.output ?? 0;
                  message.usage.totalTokens = message.usage.input + message.usage.output;
                  stream.push({ type: 'done', reason: 'stop', message });
                } catch (e) {
                  message.stopReason = controller.signal.aborted ? 'aborted' : 'error';
                  message.errorMessage = e instanceof Error ? e.message : String(e);
                  stream.push({ type: 'error', reason: message.stopReason, error: message });
                } finally {
                  stream.end(message);
                }
              })();
              return stream;
            },
          });
          const abort = () => this.agent?.abort();
          controller.signal.addEventListener('abort', abort, { once: true });
          try {
            await this.agent.prompt(prompt);
            controller.signal.throwIfAborted();
            if (this.agent.state.errorMessage) throw new Error(this.agent.state.errorMessage);
          } finally {
            controller.signal.removeEventListener('abort', abort);
            this.agent = undefined;
          }
        }
        emit({ type: 'done' });
      }
    } finally {
      clearTimeout(timer);
      this.controller = undefined;
    }
  }
  private async command(
    profile: CommentatorProfile,
    prompt: string,
    systemPrompt: string,
    emit: (e: AgentEvent) => void,
    signal: AbortSignal,
  ) {
    await mkdir(this.cwd, { recursive: true });
    signal.throwIfAborted();
    const child = (this.child = spawn(profile.command, profile.args, {
      cwd: this.cwd,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
    const id = randomUUID();
    try {
      await new Promise<void>((resolve, reject) => {
        let complete = false,
          text = '',
          bytes = 0;
        const finish = (error?: Error) => {
          if (complete) return;
          complete = true;
          signal.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        const abort = () => {
          child.kill();
          finish(new Error('解说已取消或超时'));
        };
        signal.addEventListener('abort', abort, { once: true });
        const decoder = jsonLines((frame) => {
          if (complete || frame.id !== id) return;
          if (frame.type === 'text' || frame.type === 'reasoning') {
            if (typeof frame.text !== 'string') throw new Error('Agent 文本格式错误');
            if (frame.type === 'text') text = frame.text;
            emit({ type: frame.type, text: frame.text });
          } else if (frame.type === 'usage') {
            if (
              typeof frame.input !== 'number' ||
              typeof frame.output !== 'number' ||
              !Number.isFinite(frame.input + frame.output)
            )
              throw new Error('Agent 用量格式错误');
            emit({ type: 'usage', input: frame.input, output: frame.output });
          } else if (frame.type === 'error')
            finish(new Error(typeof frame.message === 'string' ? frame.message.slice(0, 2000) : 'Agent 调用失败'));
          else if (frame.type === 'done') {
            if (!text.trim()) finish(new Error('Agent 没有返回解说文本'));
            else {
              emit({ type: 'done' });
              finish();
            }
          }
        });
        child.stdout.on('data', (chunk) => {
          if (complete) return;
          try {
            bytes += chunk.length;
            if (bytes > 2_000_000) throw new Error('Agent 返回内容过大');
            decoder.push(chunk);
          } catch (e) {
            finish(e instanceof Error ? e : new Error(String(e)));
          }
        });
        child.stderr.resume(); // Agent diagnostics may contain secrets; never copy them into a match.
        child.once('error', () => finish(new Error('无法启动 Agent，请检查程序路径和参数')));
        child.stdin.on('error', () => finish(new Error('Agent 输入通道已关闭')));
        child.once('close', (code) => {
          try {
            decoder.end();
          } catch {
            finish(new Error('Agent 返回了无效 JSON'));
          }
          finish(new Error('Agent 在完成解说前退出（' + code + '）'));
        });
        child.stdin.end(JSON.stringify({ version: 1, type: 'request', id, prompt, systemPrompt }) + '\n');
      });
    } finally {
      child.kill();
      if (this.child === child) this.child = undefined;
    }
  }
}
