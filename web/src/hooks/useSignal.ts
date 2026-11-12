"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import { postToNative } from "@/lib/nativeBridge";
import {
  callSignFor,
  cellOf,
  coarsen,
  makeSessionId,
  makeSessionOffset,
  neighborCells,
  sanitizeEmote,
  signalDistance,
  SIGNAL_RADIUS_M,
  type EmoteId,
  type SignalPresence,
} from "@/lib/signal";
import { SignalChannels } from "@/lib/signalChannels";
import { saveEncounter } from "@/lib/encounters";

export type SignalStatus = "off" | "connecting" | "live" | "error";

export type Peer = {
  sid: string;
  cs: string;
  pos: LngLat;
  ch: string;
  distance: number;
  ghost: boolean;
};

export type Relation = {
  /** 내가 마지막으로 건넨 감정 표현 */
  mine: EmoteId | null;
  /** 상대가 마지막으로 건넨 감정 표현 */
  theirs: EmoteId | null;
  /** 서로 주고받아 교차 로그에 남긴 상태 */
  crossed: boolean;
};

export type SignalNotice = {
  id: string;
  kind: "emote" | "crossing";
  sid: string;
  cs: string;
  emote: EmoteId;
};

/** 지도 아바타가 재생할 감정 표현 (상대가 나에게 건넨 것) */
export type IncomingEmote = {
  key: number;
  sid: string;
  emote: EmoteId;
};

type Options = {
  /** 계정 id 또는 게스트 id. 신호명과 교차 로그 보관에 사용 */
  ownerId: string | null;
  /** 로그인 사용자면 true (교차 로그를 서버에도 저장) */
  remote: boolean;
  enabled: boolean;
  position: LngLat | null;
  region: string | null;
  /** 개발용 가상 산책자 (혼자서 흐름 확인) */
  ghost: boolean;
};

const EMPTY: Relation = { mine: null, theirs: null, crossed: false };

type KnownPeer = { cs: string; ch: string | null; ghost: boolean };

const GHOST_SID = "ghost-echo";
const GHOST_CS = "ECHO-00";
const GHOST_REPLIES: Record<EmoteId, EmoteId> = {
  wave: "wave",
  talk: "talk",
  bow: "bow",
  clap: "cheer",
  cheer: "clap",
};

function haptic(style: "tap" | "wave" | "crossing") {
  postToNative({ type: "HAPTIC", style });
}

function offsetMeters([lng, lat]: LngLat, east: number, north: number): LngLat {
  return [
    lng + east / (111320 * Math.cos((lat * Math.PI) / 180)),
    lat + north / 111320,
  ];
}

function noticeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useSignal({
  ownerId,
  remote,
  enabled,
  position,
  region,
  ghost,
}: Options) {
  const [sid] = useState(makeSessionId);
  const [offset] = useState(makeSessionOffset);
  const callSign = useMemo(
    () => (ownerId ? callSignFor(ownerId) : null),
    [ownerId],
  );

  const [presence, setPresence] = useState<SignalPresence[]>([]);
  const [ownStatus, setOwnStatus] = useState<"live" | "connecting" | "error">(
    "connecting",
  );
  const [relations, setRelations] = useState<Record<string, Relation>>({});
  const [notices, setNotices] = useState<SignalNotice[]>([]);
  const [incoming, setIncoming] = useState<IncomingEmote | null>(null);
  const [ghostPresence, setGhostPresence] = useState<SignalPresence | null>(
    null,
  );

  const relationsRef = useRef<Record<string, Relation>>({});
  const knownRef = useRef(new Map<string, KnownPeer>());
  const managerRef = useRef<SignalChannels | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const incomingKeyRef = useRef(0);
  const regionRef = useRef(region);
  const ownerRef = useRef(ownerId);
  const remoteRef = useRef(remote);
  const callSignRef = useRef(callSign);
  // 채널·타이머에서 부르는 최신 처리기 (아래에서 정의 후 갱신)
  const emoteHandlerRef = useRef<(raw: unknown) => void>(() => undefined);

  useEffect(() => {
    regionRef.current = region;
    ownerRef.current = ownerId;
    remoteRef.current = remote;
    callSignRef.current = callSign;
  }, [region, ownerId, remote, callSign]);

  const active = Boolean(enabled && ownerId && position && callSign);
  const coarse = useMemo(
    () => (position ? coarsen(position, offset) : null),
    [position, offset],
  );
  const coarseKey = coarse ? `${coarse[0]},${coarse[1]}` : "";
  const cell = active && position ? cellOf(position) : null;

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  const updateRelation = useCallback(
    (peerSid: string, fn: (r: Relation) => Relation) => {
      const prev = relationsRef.current[peerSid] ?? EMPTY;
      const next = fn(prev);
      relationsRef.current = { ...relationsRef.current, [peerSid]: next };
      setRelations(relationsRef.current);
      return { prev, next };
    },
    [],
  );

  const pushNotice = useCallback((notice: SignalNotice) => {
    setNotices((list) => [...list.slice(-3), notice]);
  }, []);

  // 서로 한 번씩 건넸다면 교차: 조용히 로그에 남김
  const maybeCross = useCallback(
    (peerSid: string, relation: Relation) => {
      if (!relation.mine || !relation.theirs || relation.crossed) return false;
      const peer = knownRef.current.get(peerSid);
      const owner = ownerRef.current;
      if (!peer || !owner) return false;

      updateRelation(peerSid, (r) => ({ ...r, crossed: true }));

      void saveEncounter(owner, remoteRef.current, {
        id: crypto.randomUUID(),
        peerCallSign: peer.cs,
        myEmote: relation.mine,
        peerEmote: relation.theirs,
        region: regionRef.current,
        metAt: new Date().toISOString(),
      });

      pushNotice({
        id: noticeId(),
        kind: "crossing",
        sid: peerSid,
        cs: peer.cs,
        emote: relation.theirs,
      });
      haptic("crossing");
      return true;
    },
    [pushNotice, updateRelation],
  );

  const handleEmote = useCallback(
    (raw: unknown) => {
      const message = sanitizeEmote(raw);
      if (!message || message.to !== sid) return;

      const known = knownRef.current.get(message.from);
      knownRef.current.set(message.from, {
        cs: message.cs,
        ch: known?.ch ?? null,
        ghost: message.from.startsWith("ghost-"),
      });

      const { next } = updateRelation(message.from, (r) => ({
        ...r,
        theirs: message.e,
      }));

      incomingKeyRef.current += 1;
      setIncoming({
        key: incomingKeyRef.current,
        sid: message.from,
        emote: message.e,
      });

      if (!maybeCross(message.from, next)) {
        haptic("wave");
        if (!next.crossed) {
          pushNotice({
            id: noticeId(),
            kind: "emote",
            sid: message.from,
            cs: message.cs,
            emote: message.e,
          });
        }
      }
    },
    [maybeCross, pushNotice, sid, updateRelation],
  );

  useEffect(() => {
    emoteHandlerRef.current = handleEmote;
  }, [handleEmote]);

  // 채널 관리자: 신호가 켜져 있는 동안만 존재
  useEffect(() => {
    if (!active) return;
    const manager = new SignalChannels(sid, {
      onPresence: (list) => setPresence(list),
      onEmote: (payload) => emoteHandlerRef.current(payload),
      onOwnStatus: (status) => setOwnStatus(status),
    });
    managerRef.current = manager;
    const timers = timersRef.current;
    return () => {
      managerRef.current = null;
      void manager.destroy();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, [active, sid]);

  // 칸이 바뀌면 구독 칸만 갈아끼움
  useEffect(() => {
    if (!cell) return;
    void managerRef.current?.sync(neighborCells(cell));
  }, [cell, active]);

  // 내 신호(뭉갠 위치) 갱신
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !cell || !coarse || !callSign) return;
    manager.setOwn(cell, {
      v: 2,
      sid,
      cs: callSign,
      p: coarse,
      ch: cell,
      at: Date.now(),
    });
    // coarseKey가 바뀔 때만 다시 보냄
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, coarseKey, callSign, sid, active]);

  // 앱을 내리면 신호를 숨기고, 돌아오면 다시 보냄
  useEffect(() => {
    if (!active) return;
    const onVisibility = () =>
      managerRef.current?.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  // 개발용 가상 산책자: 잠시 뒤 북동쪽 약 60m에 나타났다가 천천히 주변을 걸음
  useEffect(() => {
    if (!active || !ghost || !coarse) return;
    const spots: LngLat[] = [
      offsetMeters(coarse, 42, 44),
      offsetMeters(coarse, 70, 20),
      offsetMeters(coarse, 30, 62),
    ];
    let step = 0;
    const place = () => {
      const at = spots[step % spots.length];
      step += 1;
      knownRef.current.set(GHOST_SID, { cs: GHOST_CS, ch: null, ghost: true });
      setGhostPresence({
        v: 2,
        sid: GHOST_SID,
        cs: GHOST_CS,
        p: at,
        ch: cellOf(at),
        at: Date.now(),
      });
    };
    const spawn = setTimeout(place, 1400);
    const stroll = setInterval(place, 26000);
    // 먼저 인사하지 않으면 가상 산책자가 먼저 손을 흔듦
    const firstWave = setTimeout(() => {
      if (relationsRef.current[GHOST_SID]?.theirs) return;
      emoteHandlerRef.current({
        from: GHOST_SID,
        to: sid,
        cs: GHOST_CS,
        e: "wave",
      });
    }, 14000);
    return () => {
      clearTimeout(spawn);
      clearInterval(stroll);
      clearTimeout(firstWave);
    };
    // 켜질 때 한 번만 배치
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ghost, sid]);

  // 가까이 잡힌 산책자만 남김. 범위를 벗어나면 목록에서 빠져 지도에서 사라짐
  const peers = useMemo<Peer[]>(() => {
    if (!active || !coarse) return [];
    const list = ghost && ghostPresence ? [...presence, ghostPresence] : presence;
    return list
      .filter((p) => p.sid !== sid)
      .map((p) => ({
        sid: p.sid,
        cs: p.cs,
        pos: p.p,
        ch: p.ch,
        distance: signalDistance(coarse, p.p),
        ghost: p.sid.startsWith("ghost-"),
      }))
      .filter((p) => p.distance <= SIGNAL_RADIUS_M)
      .sort((a, b) => a.distance - b.distance);
  }, [active, coarse, ghost, ghostPresence, presence, sid]);

  // 지도에 보이는 산책자는 상대 정보로 기억 (감정 표현을 보낼 때 사용)
  useEffect(() => {
    for (const peer of peers) {
      knownRef.current.set(peer.sid, {
        cs: peer.cs,
        ch: peer.ch,
        ghost: peer.ghost,
      });
    }
  }, [peers]);

  const sendEmote = useCallback(
    (peerSid: string, emote: EmoteId) => {
      const peer = knownRef.current.get(peerSid);
      const cs = callSignRef.current;
      if (!peer || !cs) return;

      const { next } = updateRelation(peerSid, (r) => ({ ...r, mine: emote }));
      haptic("tap");

      if (peer.ghost) {
        later(
          () =>
            emoteHandlerRef.current({
              from: GHOST_SID,
              to: sid,
              cs: GHOST_CS,
              e: GHOST_REPLIES[emote],
            }),
          3200,
        );
      } else {
        managerRef.current?.sendEmote(
          { from: sid, to: peerSid, cs, e: emote },
          peer.ch,
        );
      }
      maybeCross(peerSid, next);
    },
    [later, maybeCross, sid, updateRelation],
  );

  const dismissNotice = useCallback((id: string) => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  const status: SignalStatus = !enabled
    ? "off"
    : !active
      ? "connecting"
      : ownStatus;

  return {
    status,
    callSign,
    peers,
    relations,
    incoming: enabled ? incoming : null,
    notices: enabled ? notices : [],
    sendEmote,
    dismissNotice,
  };
}
