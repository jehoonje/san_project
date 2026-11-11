// web/src/lib/signalChannels.ts
// 신호 채널 관리: 내 칸 + 주변 8칸을 구독하고, 이동하면 바뀐 칸만 갈아끼움.
// (같은 이름의 채널을 지웠다 바로 만들면 닫히는 중인 채널이 재사용되므로
//  닫힘이 끝날 때까지 기다렸다가 다시 엽니다.)
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  channelName,
  sanitizePresence,
  type SignalPresence,
} from "@/lib/signal";

type Hooks = {
  onPresence: (list: SignalPresence[]) => void;
  onBroadcast: (event: "wave" | "gift", payload: unknown) => void;
  onOwnStatus: (status: "live" | "connecting" | "error") => void;
};

export class SignalChannels {
  private channels = new Map<string, RealtimeChannel>();
  private closing = new Map<string, Promise<unknown>>();
  private wanted = new Set<string>();
  private own: { cell: string; payload: SignalPresence } | null = null;
  private visible = true;
  private destroyed = false;

  constructor(
    private readonly sid: string,
    private readonly hooks: Hooks,
  ) {}

  async sync(cells: string[]) {
    this.wanted = new Set(cells);

    for (const [cell, channel] of this.channels) {
      if (!this.wanted.has(cell)) this.close(cell, channel);
    }

    for (const cell of cells) {
      if (this.channels.has(cell)) continue;
      const pending = this.closing.get(cell);
      if (pending) await pending.catch(() => undefined);
      if (this.destroyed || !this.wanted.has(cell) || this.channels.has(cell)) {
        continue;
      }
      this.open(cell);
    }
    this.emitPresence();
  }

  setOwn(cell: string, payload: SignalPresence) {
    const previous = this.own;
    this.own = { cell, payload };

    if (previous && previous.cell !== cell) {
      const old = this.channels.get(previous.cell);
      if (old?.state === "joined") void old.untrack();
    }
    this.trackOwn();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible) {
      this.trackOwn();
    } else if (this.own) {
      const channel = this.channels.get(this.own.cell);
      if (channel?.state === "joined") void channel.untrack();
    }
  }

  send(event: "wave" | "gift", payload: unknown, cell?: string | null) {
    const target = cell ? this.channels.get(cell) : undefined;
    const list = target ? [target] : [...this.channels.values()];
    for (const channel of list) {
      if (channel.state !== "joined") continue;
      void channel.send({ type: "broadcast", event, payload });
    }
  }

  async destroy() {
    this.destroyed = true;
    this.wanted.clear();
    const closing = [...this.channels.entries()].map(([cell, channel]) =>
      this.close(cell, channel),
    );
    this.own = null;
    await Promise.allSettled(closing);
  }

  private open(cell: string) {
    const channel = supabase.channel(channelName(cell), {
      config: {
        presence: { key: this.sid, enabled: true },
        broadcast: { self: false },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => this.emitPresence())
      .on("broadcast", { event: "wave" }, ({ payload }) =>
        this.hooks.onBroadcast("wave", payload),
      )
      .on("broadcast", { event: "gift" }, ({ payload }) =>
        this.hooks.onBroadcast("gift", payload),
      )
      .subscribe((status) => {
        if (this.destroyed || this.channels.get(cell) !== channel) return;
        const isOwn = this.own?.cell === cell;
        if (status === "SUBSCRIBED") {
          if (isOwn) {
            this.trackOwn();
            this.hooks.onOwnStatus("live");
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (isOwn) this.hooks.onOwnStatus("error");
        }
      });

    this.channels.set(cell, channel);
  }

  private close(cell: string, channel: RealtimeChannel) {
    this.channels.delete(cell);
    const promise = supabase.removeChannel(channel);
    this.closing.set(cell, promise);
    void promise.finally(() => {
      if (this.closing.get(cell) === promise) this.closing.delete(cell);
    });
    return promise;
  }

  private trackOwn() {
    if (!this.own || !this.visible || this.destroyed) return;
    const channel = this.channels.get(this.own.cell);
    if (channel?.state !== "joined") return;
    void channel.track({ ...this.own.payload, at: Date.now() });
  }

  private emitPresence() {
    const latest = new Map<string, SignalPresence>();
    for (const channel of this.channels.values()) {
      const state = channel.presenceState();
      for (const metas of Object.values(state)) {
        for (const meta of metas) {
          const presence = sanitizePresence(meta);
          if (!presence || presence.sid === this.sid) continue;
          const seen = latest.get(presence.sid);
          if (!seen || seen.at < presence.at) latest.set(presence.sid, presence);
        }
      }
    }
    this.hooks.onPresence([...latest.values()]);
  }
}
