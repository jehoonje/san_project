"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import { postToNative } from "@/lib/nativeBridge";
import { compareCards, type TasteCard } from "@/lib/tasteCollection";
import {
  callSignFor,
  cellOf,
  coarsen,
  makeSessionId,
  makeSessionOffset,
  neighborCells,
  sanitizeGift,
  sanitizeWave,
  signalDistance,
  SIGNAL_RADIUS_M,
  type GiftPlace,
  type SignalPresence,
} from "@/lib/signal";
import { SignalChannels } from "@/lib/signalChannels";
import { patchEncounter, saveEncounter } from "@/lib/encounters";

export type SignalStatus = "off" | "connecting" | "live" | "error";

export type Peer = {
  sid: string;
  cs: string;
  pos: LngLat;
  ch: string;
  distance: number;
  card: TasteCard;
  match: number;
  common: string[];
  ghost: boolean;
};

export type Relation = {
  iWaved: boolean;
  theyWaved: boolean;
  crossed: boolean;
  encounterId: string | null;
  giftSent: GiftPlace | null;
  giftReceived: GiftPlace | null;
};

export type SignalNotice =
  | { id: string; kind: "wave"; sid: string; cs: string; match: number }
  | { id: string; kind: "gift"; sid: string; cs: string; place: GiftPlace };

export type Crossing = {
  sid: string;
  encounterId: string;
  cs: string;
  card: TasteCard;
  match: number;
  common: string[];
};

type Options = {
  userId: string | null;
  enabled: boolean;
  position: LngLat | null;
  card: TasteCard | null;
  region: string | null;
  /** 개발용 가상 산책자 (혼자서 흐름 확인) */
  ghost: boolean;
};

const EMPTY: Relation = {
  iWaved: false,
  theyWaved: false,
  crossed: false,
  encounterId: null,
  giftSent: null,
  giftReceived: null,
};

type KnownPeer = { cs: string; card: TasteCard; ch: string | null; ghost: boolean };

const GHOST_SID = "ghost-echo";
const GHOST_CS = "ECHO-00";
const GHOST_CARD: TasteCard = {
  t: "레코드를 모으는 카페 산책자",
  k: [
    "music.record",
    "category.cafe",
    "interior.wood",
    "atmosphere.calm",
    "menu.hand_drip",
    "category.bar",
  ],
  n: 9,
};
const GHOST_GIFT: GiftPlace = {
  name: "모노 레코드 바",
  category: "bar",
  region: "을지로동",
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
  userId,
  enabled,
  position,
  card,
  region,
  ghost,
}: Options) {
  const [sid] = useState(makeSessionId);
  const [offset] = useState(makeSessionOffset);
  const callSign = useMemo(
    () => (userId ? callSignFor(userId) : null),
    [userId],
  );

  const [presence, setPresence] = useState<SignalPresence[]>([]);
  const [ownStatus, setOwnStatus] = useState<"live" | "connecting" | "error">(
    "connecting",
  );
  const [relations, setRelations] = useState<Record<string, Relation>>({});
  const [notices, setNotices] = useState<SignalNotice[]>([]);
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const [ghostPresence, setGhostPresence] = useState<SignalPresence | null>(
    null,
  );

  const relationsRef = useRef<Record<string, Relation>>({});
  // 지금 열려 있는 교차 화면의 상대 (그 화면에서 선물을 바로 보여주므로 알림 생략)
  const crossingSidRef = useRef<string | null>(null);
  const knownRef = useRef(new Map<string, KnownPeer>());
  const managerRef = useRef<SignalChannels | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const cardRef = useRef(card);
  const regionRef = useRef(region);
  const userIdRef = useRef(userId);
  const callSignRef = useRef(callSign);
  // 채널·타이머에서 부르는 최신 처리기 (아래에서 정의 후 갱신)
  const handlersRef = useRef<{
    wave: (raw: unknown) => void;
    gift: (raw: unknown) => void;
  }>({ wave: () => undefined, gift: () => undefined });

  useEffect(() => {
    cardRef.current = card;
    regionRef.current = region;
    userIdRef.current = userId;
    callSignRef.current = callSign;
  }, [card, region, userId, callSign]);

  const active = Boolean(enabled && userId && card && position && callSign);
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

  // 서로 손을 흔들면 교차: 기록을 남기고 교차 화면을 띄움
  const maybeCross = useCallback(
    (peerSid: string, relation: Relation) => {
      if (!relation.iWaved || !relation.theyWaved || relation.crossed) return;
      const peer = knownRef.current.get(peerSid);
      const owner = userIdRef.current;
      if (!peer || !owner) return;

      const encounterId = crypto.randomUUID();
      const { percent, common } = compareCards(cardRef.current, peer.card);
      updateRelation(peerSid, (r) => ({ ...r, crossed: true, encounterId }));

      void saveEncounter(owner, {
        id: encounterId,
        peerCallSign: peer.cs,
        peerCard: peer.card,
        match: percent,
        common,
        region: regionRef.current,
        metAt: new Date().toISOString(),
        giftReceived: null,
        giftSent: null,
      });

      crossingSidRef.current = peerSid;
      setCrossing({
        sid: peerSid,
        encounterId,
        cs: peer.cs,
        card: peer.card,
        match: percent,
        common,
      });
      haptic("crossing");

      // 가상 산책자는 교차 후 장소 하나를 건넴
      if (peer.ghost) {
        later(() => handlersRef.current.gift({
          from: GHOST_SID,
          to: sid,
          cs: GHOST_CS,
          place: GHOST_GIFT,
        }), 2600);
      }
    },
    [later, sid, updateRelation],
  );

  const handleWave = useCallback(
    (raw: unknown) => {
      const message = sanitizeWave(raw);
      if (!message || message.to !== sid) return;

      const known = knownRef.current.get(message.from);
      knownRef.current.set(message.from, {
        cs: message.cs,
        card: message.c,
        ch: known?.ch ?? null,
        ghost: message.from.startsWith("ghost-"),
      });

      const { prev, next } = updateRelation(message.from, (r) => ({
        ...r,
        theyWaved: true,
      }));
      if (prev.theyWaved) return;

      haptic("wave");
      if (next.iWaved) {
        maybeCross(message.from, next);
      } else {
        pushNotice({
          id: noticeId(),
          kind: "wave",
          sid: message.from,
          cs: message.cs,
          match: compareCards(cardRef.current, message.c).percent,
        });
      }
    },
    [maybeCross, pushNotice, sid, updateRelation],
  );

  const handleGift = useCallback(
    (raw: unknown) => {
      const message = sanitizeGift(raw);
      if (!message || message.to !== sid) return;
      const relation = relationsRef.current[message.from];
      // 교차한 상대의 선물만 받음
      if (!relation?.crossed || relation.giftReceived) return;

      updateRelation(message.from, (r) => ({ ...r, giftReceived: message.place }));
      const owner = userIdRef.current;
      if (owner && relation.encounterId) {
        void patchEncounter(owner, relation.encounterId, {
          giftReceived: message.place,
        });
      }
      if (crossingSidRef.current !== message.from) pushNotice({
        id: noticeId(),
        kind: "gift",
        sid: message.from,
        cs: message.cs,
        place: message.place,
      });
      haptic("wave");
    },
    [pushNotice, sid, updateRelation],
  );

  useEffect(() => {
    handlersRef.current = { wave: handleWave, gift: handleGift };
  }, [handleWave, handleGift]);

  // 채널 관리자: 신호가 켜져 있는 동안만 존재
  useEffect(() => {
    if (!active) return;
    const manager = new SignalChannels(sid, {
      onPresence: (list) => setPresence(list),
      onBroadcast: (event, payload) => handlersRef.current[event](payload),
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

  // 내 신호(뭉갠 위치 + 취향 카드) 갱신
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !cell || !coarse || !card || !callSign) return;
    manager.setOwn(cell, {
      v: 1,
      sid,
      cs: callSign,
      p: coarse,
      ch: cell,
      c: card,
      at: Date.now(),
    });
    // coarseKey가 바뀔 때만 다시 보냄
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, coarseKey, card, callSign, sid, active]);

  // 앱을 내리면 신호를 숨기고, 돌아오면 다시 보냄
  useEffect(() => {
    if (!active) return;
    const onVisibility = () =>
      managerRef.current?.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  // 개발용 가상 산책자: 신호를 켜고 잠시 뒤 북동쪽 약 140m에 나타남
  useEffect(() => {
    if (!active || !ghost || !coarse) return;
    const at = offsetMeters(coarse, 100, 100);
    const spawn = setTimeout(() => {
      knownRef.current.set(GHOST_SID, {
        cs: GHOST_CS,
        card: GHOST_CARD,
        ch: null,
        ghost: true,
      });
      setGhostPresence({
        v: 1,
        sid: GHOST_SID,
        cs: GHOST_CS,
        p: at,
        ch: cellOf(at),
        c: GHOST_CARD,
        at: Date.now(),
      });
    }, 1400);
    // 먼저 손을 흔들지 않으면 가상 산책자가 먼저 흔듦
    const firstWave = setTimeout(() => {
      if (relationsRef.current[GHOST_SID]?.theyWaved) return;
      handlersRef.current.wave({
        from: GHOST_SID,
        to: sid,
        cs: GHOST_CS,
        c: GHOST_CARD,
      });
    }, 12000);
    return () => {
      clearTimeout(spawn);
      clearTimeout(firstWave);
    };
    // 켜질 때 한 번만 배치
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ghost, sid]);

  const peers = useMemo<Peer[]>(() => {
    if (!active || !coarse) return [];
    const list = ghost && ghostPresence ? [...presence, ghostPresence] : presence;
    return list
      .filter((p) => p.sid !== sid)
      .map((p) => {
        const { percent, common } = compareCards(card, p.c);
        return {
          sid: p.sid,
          cs: p.cs,
          pos: p.p,
          ch: p.ch,
          distance: signalDistance(coarse, p.p),
          card: p.c,
          match: percent,
          common,
          ghost: p.sid.startsWith("ghost-"),
        };
      })
      .filter((p) => p.distance <= SIGNAL_RADIUS_M)
      .sort((a, b) => a.distance - b.distance);
  }, [active, card, coarse, ghost, ghostPresence, presence, sid]);

  // 지도에 보이는 신호는 상대 정보로 기억 (손 흔들기·선물 보낼 때 사용)
  useEffect(() => {
    for (const peer of peers) {
      knownRef.current.set(peer.sid, {
        cs: peer.cs,
        card: peer.card,
        ch: peer.ch,
        ghost: peer.ghost,
      });
    }
  }, [peers]);

  const wave = useCallback(
    (peerSid: string) => {
      const peer = knownRef.current.get(peerSid);
      const mine = cardRef.current;
      const cs = callSignRef.current;
      if (!peer || !mine || !cs) return;

      const { prev, next } = updateRelation(peerSid, (r) => ({ ...r, iWaved: true }));
      if (prev.iWaved) return;
      haptic("tap");

      if (peer.ghost) {
        later(() => handlersRef.current.wave({
          from: GHOST_SID,
          to: sid,
          cs: GHOST_CS,
          c: GHOST_CARD,
        }), 1800);
      } else {
        managerRef.current?.send(
          "wave",
          { from: sid, to: peerSid, cs, c: mine },
          peer.ch,
        );
      }
      maybeCross(peerSid, next);
    },
    [later, maybeCross, sid, updateRelation],
  );

  const sendGift = useCallback(
    (peerSid: string, place: GiftPlace) => {
      const peer = knownRef.current.get(peerSid);
      const relation = relationsRef.current[peerSid];
      const cs = callSignRef.current;
      if (!peer || !relation?.crossed || relation.giftSent || !cs) return;

      updateRelation(peerSid, (r) => ({ ...r, giftSent: place }));
      const owner = userIdRef.current;
      if (owner && relation.encounterId) {
        void patchEncounter(owner, relation.encounterId, { giftSent: place });
      }
      if (!peer.ghost) {
        managerRef.current?.send(
          "gift",
          { from: sid, to: peerSid, cs, place },
          peer.ch,
        );
      }
    },
    [sid, updateRelation],
  );

  const dismissNotice = useCallback((id: string) => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  const closeCrossing = useCallback(() => {
    crossingSidRef.current = null;
    setCrossing(null);
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
    notices: enabled ? notices : [],
    crossing: enabled ? crossing : null,
    wave,
    sendGift,
    dismissNotice,
    closeCrossing,
  };
}
