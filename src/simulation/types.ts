export type IntelLevel = "observed" | "surveyed" | "colonized";
export type ShipKind = "probe" | "colony";
export type Policy = "balanced" | "industry" | "ecology" | "autonomy";
export type ResearchFocus = "propulsion" | "industry" | "ecology" | "sensors" | "governance";

export interface StarSystem { id: string; name: string; x: number; y: number; z: number; distance: number; spectral: "G" | "K" | "M" | "F"; habitability: number; resources: number; risk: number; anomaly?: "ruins" | "civilization"; }
export interface WorldState { systemId: string; name: string; foundedAt: number; population: number; food: number; materials: number; energy: number; industry: number; research: number; treasury: number; priceIndex: number; support: number; autonomy: number; stability: number; ecology: number; policy: Policy; plan: "habitat" | "industry" | "science" | "preserve"; spaceport: boolean; }
export interface IntelRecord { systemId: string; level: IntelLevel; observedAt: number; receivedAt: number; worldSnapshot?: WorldState; uncertainty: number; }
export interface Ship { id: string; name: string; kind: ShipKind; originId: string; targetId: string; launchedAt: number; arrivesAt: number; velocityC: number; status: "outbound" | "arrived"; properYears: number; }
export interface Order { id: string; kind: "probe" | "colony" | "policy" | "relief"; targetId: string; issuedAt: number; arrivesAt: number; summary: string; budget: number; authorization: "strict" | "adaptive" | "broad"; status: "transmitting" | "executed" | "adjusted" | "rejected"; payload?: string; }
export interface Message { id: string; occurredAt: number; receivedAt: number; title: string; body: string; tone: "info" | "good" | "warn" | "critical"; unread: boolean; cause: string[]; action?: string; worldSnapshot?: WorldState; }
export interface GameState { version: 1; seed: number; time: number; speed: number; capitalId: string; systems: StarSystem[]; worlds: Record<string, WorldState>; intel: Record<string, IntelRecord>; ships: Ship[]; orders: Order[]; messages: Message[]; credits: number; researchFocus: ResearchFocus; propulsionLevel: number; milestones: string[]; lastAutosaveAt: number; }
