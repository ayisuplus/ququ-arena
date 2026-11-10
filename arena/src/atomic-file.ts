/**
 * 原子写文件的唯一实现：先写同目录的唯一临时文件，再 rename 覆盖目标——进程中途被杀不会留下半截 JSON。
 *
 * Windows 上目标文件被读者或杀毒软件短暂占用时，rename 会报 EPERM / EACCES / EBUSY；
 * 这类错误是暂时的，退避重试即可。其他错误（磁盘满、权限真的不足）立即抛出。
 */
import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';

const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const MAX_RETRIES = 6;
const backoffMs = (attempt: number) => 50 * (attempt + 1);
const transient = (e: unknown, attempt: number) =>
  TRANSIENT.has((e as NodeJS.ErrnoException).code ?? '') && attempt < MAX_RETRIES;

export async function writeFileAtomic(file: string, data: string, options: { mode?: number } = {}): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { encoding: 'utf8', ...options });
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, file);
        return;
      } catch (e) {
        if (!transient(e, attempt)) throw e;
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      }
    }
  } finally {
    await unlink(temporary).catch(() => {}); // 成功时临时文件已被 rename 走，ENOENT 属预期
  }
}

/** 同步版本：供必须在同一事件循环回合内落盘的调用方（如赛事事件与结算一起持久化） */
export function writeFileAtomicSync(file: string, data: string): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(temporary, file);
        return;
      } catch (e) {
        if (!transient(e, attempt)) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoffMs(attempt));
      }
    }
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* 成功时已被 rename 走 */
    }
  }
}
