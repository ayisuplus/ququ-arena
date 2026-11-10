export type ControlState = 'running' | 'pausing' | 'paused' | 'stopped';

/** Pausing holds the next round; stopping also aborts in-flight requests. */
export class BattleControl {
  readonly abort = new AbortController();
  state: ControlState = 'running';
  private release?: () => void;
  private changed: (state: ControlState) => void;
  constructor(changed: (state: ControlState) => void = () => {}) {
    this.changed = changed;
  }
  private set(state: ControlState) {
    this.state = state;
    this.changed(state);
  }
  pause() {
    if (this.state === 'running') this.set('pausing');
  }
  resume() {
    if (this.state === 'stopped') return;
    this.set('running');
    this.release?.();
  }
  stop() {
    this.set('stopped');
    this.abort.abort(new Error('比赛已终止'));
    this.release?.();
  }
  async checkpoint() {
    if (this.state === 'pausing' || this.state === 'paused') {
      this.set('paused');
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
      this.release = undefined;
    }
  }
}
