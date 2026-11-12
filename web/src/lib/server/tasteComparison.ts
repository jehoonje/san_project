import { createHash } from "node:crypto";
import type { RoutePlaceRow } from "@/lib/server/placeAnalysis";
import type { CohortSnapshot, ComparisonData, ComparisonRow, ShareMap } from "@/types/comparison";
const CATEGORY = { cafe:"카페", restaurant:"식당", bar:"술집", park:"공원", shop:"쇼핑", culture:"문화", etc:"기타" };
const TIME = { dawn:"새벽", morning:"오전", afternoon:"오후", evening:"저녁", night:"밤" };
export function buildComparison(places: RoutePlaceRow[], snapshot: CohortSnapshot): ComparisonData {
 const cutoff = new Date(snapshot.asOf).getTime();
 const from = cutoff-30*86400000;
 const selected = places.filter(p=>{const t=new Date(p.saved_at).getTime();return t>=from && t<cutoff;});
 const categories: ShareMap = {};const times: ShareMap = {};
 for(const p of selected){categories[p.category]=(categories[p.category]??0)+1;const h=new Date(new Date(p.saved_at).getTime()+9*3600000).getUTCHours();const slot=h<6?'dawn':h<12?'morning':h<17?'afternoon':h<22?'evening':'night';times[slot]=(times[slot]??0)+1;}
 const round=(v:number)=>Math.round(v*10)/10;
 const rows=(dimension:string, labels:Record<string,string>, counts:ShareMap, baseline:ShareMap|null,recent:ShareMap|null,previous:ShareMap|null):ComparisonRow[]=>Object.entries(labels).map(([key,label])=>{
  const mine=selected.length>=3?round((counts[key]??0)/selected.length*100):null;
  const peers=baseline?.[key]??null;const trend=recent?.[key]??null;const before=previous?.[key]??null;
  return{id:`${dimension}:${key}`,label,mine,peers,trend,difference:mine!==null&&peers!==null?round(mine-peers):null,change:trend!==null&&before!==null?round(trend-before):null};
 });
 const categoryRows=rows('category',CATEGORY,categories,snapshot.baseline.categories,snapshot.recent.categories,snapshot.previous.categories);
 const timeRows=rows('time',TIME,times,snapshot.baseline.times,snapshot.recent.times,snapshot.previous.times);
 return{asOf:snapshot.asOf,from:new Date(from).toISOString(),myVisits:selected.length,categories:categoryRows,times:timeRows,ready:[...categoryRows,...timeRows].some(r=>r.mine!==null&&r.peers!==null&&r.trend!==null)};
}
export function reportFingerprint(input:unknown){return createHash('sha256').update(JSON.stringify(input)).digest('hex');}
