export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
export const START_TIME = Date.UTC(2180, 0, 1);
export const SPEEDS = [
  { value: 0, label: "暂停", rate: "—" },
  { value: 1 / 12, label: "月", rate: "1 月/秒" },
  { value: 1, label: "年", rate: "1 年/秒" },
  { value: 5, label: "十年", rate: "5 年/秒" }
];
export const POLICIES = {
  balanced: { name: "均衡发展", effect: "稳定生产，减少地方偏离" },
  industry: { name: "工业动员", effect: "工业增长快，但生态与支持率承压" },
  ecology: { name: "生态优先", effect: "恢复生态与支持率，建设较慢" },
  autonomy: { name: "地方自治", effect: "提高支持与执行弹性，中央税收较少" }
} as const;
export const RESEARCH = { propulsion: "推进与舰船", industry: "能源与工业", ecology: "生命维持", sensors: "探测与通信", governance: "远程治理" } as const;
