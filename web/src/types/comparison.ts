import type { AnalysisReportResponse } from "@/types/analysis";
export type ShareMap = Record<string, number>;
export type CohortWindow = { from: string; to: string; categories: ShareMap | null; times: ShareMap | null };
export type CohortSnapshot = { asOf: string; baseline: CohortWindow; recent: CohortWindow; previous: CohortWindow };
export type ComparisonRow = {
 id: string; label: string;
 mine: number | null; peers: number | null; trend: number | null;
 difference: number | null; change: number | null;
};
export type ComparisonData = {
 asOf: string; from: string; myVisits: number;
 categories: ComparisonRow[]; times: ComparisonRow[];
 ready: boolean;
};
export type ComparisonReportResponse = AnalysisReportResponse & { comparison: ComparisonData };
