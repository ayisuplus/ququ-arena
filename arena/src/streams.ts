import { StringDecoder } from 'node:string_decoder';

/** Decode arbitrary UTF-8 chunks before splitting protocol frames. */
export function jsonLines(onValue: (value: Record<string, unknown>) => void) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const consume = () => {
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end).trim();
      pending = pending.slice(end + 1);
      if (line) onValue(JSON.parse(line));
    }
  };
  return {
    push(chunk: Buffer | string) {
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      consume();
    },
    end() {
      pending += decoder.end() + '\n';
      consume();
    },
  };
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      pending = pending.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
  } finally {
    // Breaking at [DONE] or on a parser error must also release the network body.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
