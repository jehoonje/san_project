"use client";

import { useId } from "react";

import type {
  PlaceEvidenceSummary,
} from "@/types/analysis";

type Props = {
  summary?: PlaceEvidenceSummary;
};

type MenuPlace = {
  placeId: string;
  name: string;
  regionDong: string | null;
  rawMenus: string[];
};

type MenuItem = {
  key: string;
  label: string;
  places: MenuPlace[];
};

type MenuResult = {
  items: MenuItem[];
  placesWithMenus: number;
  truncated: boolean;
};

function normalizeMenu(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "");
}

/**
 * 취향 발견에 도움이 적은 넓은 범주의 메뉴입니다.
 * 실제 데이터는 지우지 않고, 이 섹션의 노출 후보에서만 제외합니다.
 */
const GENERAL_MENUS = new Set(
  [
    "커피",
    "음료",
    "음료 메뉴",
    "커피 메뉴",
    "디저트",
    "디저트 메뉴",
    "베이커리",
    "베이커리 메뉴",
    "스페셜티",
    "스페셜티 커피",
    "아메리카노",
    "아이스 아메리카노",
    "핫 아메리카노",
    "에스프레소",
    "카페라떼",
    "카페 라떼",
    "라떼",
  ].map(normalizeMenu),
);

function cleanMenu(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!text || text.length > 100) {
    return null;
  }

  return text;
}

function buildMenuItems(
  summary?: PlaceEvidenceSummary,
): MenuResult {
  if (!summary) {
    return {
      items: [],
      placesWithMenus: 0,
      truncated: false,
    };
  }

  const groups = new Map<
    string,
    {
      label: string;
      places: Map<string, MenuPlace>;
    }
  >();

  const placesWithMenus = new Set<string>();

  for (const place of summary.places) {
    const menus = Array.isArray(place.signatureMenus)
      ? place.signatureMenus
          .map(cleanMenu)
          .filter(
            (menu): menu is string =>
              menu !== null,
          )
      : [];

    if (menus.length > 0) {
      placesWithMenus.add(place.placeId);
    }

    for (const rawMenu of menus) {
      const key = normalizeMenu(rawMenu);

      if (!key || GENERAL_MENUS.has(key)) {
        continue;
      }

      let group = groups.get(key);

      if (!group) {
        group = {
          label: rawMenu,
          places: new Map<string, MenuPlace>(),
        };

        groups.set(key, group);
      }

      const existing = group.places.get(
        place.placeId,
      );

      if (existing) {
        if (
          !existing.rawMenus.includes(rawMenu)
        ) {
          existing.rawMenus.push(rawMenu);
        }
      } else {
        group.places.set(place.placeId, {
          placeId: place.placeId,
          name: place.name,
          regionDong: place.regionDong,
          rawMenus: [rawMenu],
        });
      }
    }
  }

  const items: MenuItem[] = [
    ...groups.entries(),
  ]
    .map(([key, group]) => ({
      key,
      label: group.label,
      places: [
        ...group.places.values(),
      ].sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.placeId.localeCompare(b.placeId),
      ),
    }))
    .sort(
      (a, b) =>
        b.places.length - a.places.length ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 3);

  return {
    items,
    placesWithMenus: placesWithMenus.size,
    truncated: summary.truncated,
  };
}

export function MenuInsightSection({
  summary,
}: Props) {
  const titleId = useId();

  const result = buildMenuItems(summary);

  if (result.items.length === 0) {
    return null;
  }

  const hasRepeatedMenu = result.items.some(
    (item) => item.places.length >= 2,
  );

  return (
    <section
      className="menu-insight"
      aria-labelledby={titleId}
    >
      <style>{STYLES}</style>

      <header className="menu-insight-heading">
        <span>
          기록한 장소의 대표 메뉴
        </span>

        <h2 id={titleId}>
          {hasRepeatedMenu ? (
            <>
              메뉴판에도
              <br />
              겹치는 게 있네요.
            </>
          ) : (
            <>
              그 공간에는
              <br />
              이런 메뉴도.
            </>
          )}
        </h2>
      </header>

      <div className="menu-insight-list">
        {result.items.map((item, index) => {
          const visiblePlaces =
            item.places.slice(0, 3);

          const remaining =
            item.places.length -
            visiblePlaces.length;

          return (
            <article
              key={item.key}
              className="menu-insight-item"
            >
              <div className="menu-insight-item-top">
                <span
                  className="menu-insight-index"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(
                    2,
                    "0",
                  )}
                </span>

                <h3>{item.label}</h3>

                <span className="menu-insight-count">
                  {item.places.length >= 2
                    ? `${item.places.length}곳에서 확인`
                    : "대표 메뉴"}
                </span>
              </div>

              <ul
                className="menu-insight-places"
                aria-label={`${item.label}이 확인된 장소`}
              >
                {visiblePlaces.map((place) => (
                  <li key={place.placeId}>
                    <div className="menu-insight-place-heading">
                      <span>
                        {place.name}
                      </span>

                      {place.regionDong && (
                        <small>
                          {place.regionDong}
                        </small>
                      )}
                    </div>

                    {(
                      place.rawMenus.length > 1 ||
                      place.rawMenus[0] !==
                        item.label
                    ) && (
                      <p className="menu-insight-original">
                        {place.rawMenus.join(
                          " · ",
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {remaining > 0 && (
                <p className="menu-insight-more">
                  같은 메뉴가 확인된 장소{" "}
                  {remaining}곳 더
                </p>
              )}
            </article>
          );
        })}
      </div>

      <footer className="menu-insight-footer">
        <span>
          {result.truncated
            ? "이번 분석에 포함된 장소 기준"
            : "메뉴 정보가 확인된 장소 기준"}
          {" · "}
          {result.placesWithMenus}곳
        </span>

        <p>
          장소 소개에 확인된 메뉴예요.
          주문 기록과는 구분해요.
        </p>
      </footer>
    </section>
  );
}

const STYLES = `
.menu-insight {
  padding:30px 0;
  border-bottom: 1px solid transparent;
}

.menu-insight-heading > span {
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: .2em;
  text-transform: uppercase;
}

.menu-insight-heading h2 {
  margin-top: 14px;
  color: var(--san-text);
  font-size: clamp(29px, 8vw, 40px);
  font-weight:300;
  line-height: 1.25;
  letter-spacing:0;
  word-break: keep-all;
}

.menu-insight-list {
  display: grid;
  margin-top: 25px;
}

.menu-insight-item {
  padding: 14px 0;
  border-top: 1px solid transparent;
}

.menu-insight-item-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
}

.menu-insight-index {
  flex-shrink: 0;
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size:11px;
  font-variant-numeric: tabular-nums;
}

.menu-insight-item h3 {
  flex: 1;
  min-width: 100px;
  margin: 0;
  color: var(--san-text);
  font-size: 23px;
  font-weight:300;
  line-height: 1.45;
  letter-spacing:0;
  overflow-wrap: anywhere;
}

.menu-insight-count {
  color: var(--san-text);
  font-family: var(--san-font-mono);
  font-size:11px;
  font-variant-numeric: tabular-nums;
}

.menu-insight-places {
  display: grid;
  gap: 10px;
  margin-top: 15px !important;
  padding: 0 0 0 25px;
  list-style: none;
}

.menu-insight-place-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.menu-insight-place-heading > span {
  color: var(--san-text);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.menu-insight-place-heading > small {
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

.menu-insight-original {
  margin-top: 3px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.menu-insight-more {
  margin: 12px 0 0 25px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

.menu-insight-footer {
  margin-top: 5px;
}

.menu-insight-footer > span {
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

.menu-insight-footer > p {
  margin-top: 7px !important;
  color: var(--san-text);
  font-size:11px;
  line-height: 1.8;
}

@media (min-width: 640px) {
  .menu-insight {
    padding-block: 36px;
  }

  .menu-insight-item h3 {
    font-size: 27px;
  }

  .menu-insight-place-heading > span {
    font-size: 13px;
  }
}
`;

export default MenuInsightSection;