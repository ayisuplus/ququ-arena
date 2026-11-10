/** Two-file packages stay compatible with the CLI. Readers see the previous complete
 * package until an editor transaction commits; an interrupted save is recoverable. */
import { readFile, writeFile, unlink, link } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileAtomic } from './atomic-file.ts';

export interface ArenaFiles {
  definition: string;
  questions: string;
}
interface Transaction extends ArenaFiles {
  pid: number;
}
const journalPath = (dir: string) => path.join(dir, '.editor-transaction.json');

async function journal(dir: string): Promise<Transaction | null> {
  try {
    return JSON.parse(await readFile(journalPath(dir), 'utf8')) as Transaction;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function pair(dir: string): Promise<ArenaFiles> {
  const definition = await readFile(path.join(dir, 'arena.json'), 'utf8');
  try {
    JSON.parse(definition);
  } catch {
    throw new Error(`${path.join(dir, 'arena.json')} 不是合法 JSON`);
  }
  const questions = await readFile(path.join(dir, 'tasks.jsonl'), 'utf8');
  return { definition, questions };
}

export async function readArenaFiles(dir: string): Promise<ArenaFiles> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await journal(dir);
    if (before) return { definition: before.definition, questions: before.questions };
    const first = await pair(dir);
    const after = await journal(dir);
    if (after) return { definition: after.definition, questions: after.questions };
    const second = await pair(dir);
    if (first.definition === second.definition && first.questions === second.questions) return first;
  }
  throw new Error('题库正在保存，请稍后重试');
}

export const atomicFile = (file: string, content: string): Promise<void> => writeFileAtomic(file, content);

async function writePair(dir: string, files: ArenaFiles) {
  await atomicFile(path.join(dir, 'tasks.jsonl'), files.questions);
  await atomicFile(path.join(dir, 'arena.json'), files.definition);
}

/** The exclusive journal is also the cross-process writer lock. */
export async function replaceArenaFiles(dir: string, previous: ArenaFiles, next: ArenaFiles): Promise<void> {
  const file = journalPath(dir);
  const interrupted = await journal(dir);
  if (interrupted) {
    let alive = true;
    try {
      process.kill(interrupted.pid, 0);
    } catch (e) {
      alive = (e as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (alive) throw new Error('题库正在由另一个窗口保存，请稍后重试');
    // A crashed writer leaves the old package authoritative. Restore it before retrying.
    await writePair(dir, interrupted);
    await unlink(file);
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ ...previous, pid: process.pid }), 'utf8');
    try {
      await link(temporary, file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('题库正在由另一个窗口保存，请稍后重试');
      throw e;
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
  try {
    const current = await pair(dir);
    if (current.definition !== previous.definition || current.questions !== previous.questions) {
      await unlink(file);
      throw new Error('题库已被其他窗口修改，请重新加载后再保存');
    }
    try {
      await writePair(dir, next);
    } catch (e) {
      await writePair(dir, previous);
      throw e;
    }
    await unlink(file); // Commit point: both files have been replaced before exposing the new package.
  } catch (e) {
    // On an I/O failure retain the journal if rollback did not complete.
    const current = await pair(dir).catch(() => null);
    if (current?.definition === previous.definition && current.questions === previous.questions)
      await unlink(file).catch(() => {});
    throw e;
  }
}
