export type Resource = 'energy' | 'food' | 'materials' | 'goods' | 'components';
export type Stock = Record<Resource, number>;
export type ResearchFocus = 'propulsion' | 'industry' | 'ecology' | 'sensors' | 'governance';
export type Tech = Record<ResearchFocus, number>;
export type Policy = 'balanced' | 'industry' | 'ecology' | 'autonomy' | 'ration' | 'control';
export type Regime = 'republic' | 'federation' | 'directorate';
export type Zone = 'housing' | 'industry' | 'farm' | 'science' | 'reserve' | 'commerce' | 'defense';
export type Contact = 'observe' | 'secret' | 'contact' | 'exchange' | 'compete';
export interface StarSystem {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    distance: number;
    spectral: 'G' | 'K' | 'M' | 'F';
    habitability: number;
    resources: number;
    risk: number;
    anomaly?: 'ruins' | 'civilization';
    planets: number;
    bodies: PlanetBody[];
}
export interface PlanetBody {
    id: string;
    name: string;
    kind: '岩质' | '气态' | '冰质';
    orbit: number;
    radius: number;
    primary: boolean;
    habitability?: number;
    resources?: number;
}
export type SurfacePoint = [number, number, number];
export interface SurfaceDraft {
    kind: 'road' | 'zone';
    zone: Zone;
    points: SurfacePoint[];
    width: number;
}
export interface SurfaceProject extends SurfaceDraft {
    id: string;
    progress: number;
    cost: number;
    spent: number;
    status: string;
}
export interface Cohort {
    id: number;
    region: number;
    size: number;
    young: number;
    elderly: number;
    profession: 'workers' | 'scientists' | 'farmers' | 'services';
    education: number;
    identity: number;
    living: number;
    support: number;
    axes: [
        number,
        number,
        number,
        number
    ];
}
export interface District {
    id: number;
    zone: Zone;
    priority: number;
    progress: number;
    density: number;
    pollution: number;
    hub: boolean;
    damage: number;
    ruins: number;
    terrain: 'plain' | 'mountain' | 'forest' | 'desert';
    fertility: number;
    minerals: number;
}
export interface Finance {
    balance: number;
    debt: number;
    revenue: number;
    expenses: number;
    interest: number;
    commitments: number;
    limit: number;
    tax: number;
    budget: number;
    price: number;
}
export interface WorldState {
    systemId: string;
    radiusKm: number;
    planetId: string;
    surface: SurfaceProject[];
    name: string;
    foundedAt: number;
    population: number;
    stock: Stock;
    cohorts: Cohort[];
    districts: District[];
    finance: Finance;
    industry: number;
    support: number;
    stability: number;
    ecology: number;
    autonomy: number;
    policy: Policy;
    regime: Regime;
    tech: Tech;
    knowledge: Tech;
    research: Tech;
    focus: ResearchFocus;
    spaceport: number;
    stage: number;
    independent: boolean;
    charter: boolean;
    crisis: boolean;
    contact: Contact;
    alienTrust: number;
    alienDevelopment: number;
    causes: string[];
    history: {
        time: number;
        population: number;
        support: number;
        ecology: number;
        industry: number;
    }[];
}
export interface IntelRecord {
    systemId: string;
    planetId: string;
    level: 'observed' | 'surveyed' | 'colonized';
    observedAt: number;
    receivedAt: number;
    uncertainty: number;
    survey?: StarSystem;
    worldSnapshot?: WorldState;
}
export type ShipKind = 'probe' | 'colony' | 'freighter' | 'passenger';
export interface Ship {
    id: string;
    name: string;
    kind: ShipKind;
    originId: string;
    targetId: string;
    launchedAt: number;
    departsAt: number;
    arrivesAt: number;
    velocityC: number;
    properYears: number;
    status: 'building' | 'outbound' | 'arrived' | 'lost';
    cargo: Stock;
    passengers: number;
    reliability: number;
    orderId: string;
    knowledge: Tech;
}
export interface Directive {
    targetId: string;
    kind: 'policy' | 'budget' | 'surface' | 'hub' | 'project' | 'reform' | 'contact' | 'relief' | 'evacuate' | 'charter';
    value: string;
    district?: number;
    surface?: SurfaceDraft[];
    budget: number;
    priority: number;
    deadline: number;
    risk: number;
    authorization: 'strict' | 'adaptive' | 'broad';
    after: 'maintain' | 'return';
}
export interface Order extends Directive {
    id: string;
    sourceId: string;
    issuedAt: number;
    arrivesAt: number;
    status: 'transmitting' | 'deferred' | 'executed' | 'adjusted' | 'rejected';
    result: string;
}
export interface Message {
    id: string;
    systemId: string;
    occurredAt: number;
    receivedAt: number;
    title: string;
    body: string;
    tone: 'info' | 'good' | 'warn' | 'critical';
    cause: string[];
    action: string;
    pause: boolean;
}
export interface Signal {
    id: string;
    arrivesAt: number;
    intel?: IntelRecord;
    message?: Message;
    order?: Order;
    ship?: Ship;
    knowledge?: {
        targetId: string;
        tech: Tech;
    };
}
export type Action = {
    type: 'launch';
    targetId: string;
    originId: string;
    kind: ShipKind;
    authorization: Directive['authorization'];
    risk: number;
    goal: Zone;
} | {
    type: 'directive';
    directive: Directive;
} | {
    type: 'research';
    focus: ResearchFocus;
    budget: number;
} | {
    type: 'catalog';
} | {
    type: 'route';
    targetId: string;
    enabled: boolean;
};
export interface GameState {
    version: 3;
    contentVersion: string;
    seed: number;
    tick: number;
    time: number;
    sequence: number;
    rngState: number;
    systems: StarSystem[];
    worlds: Record<string, WorldState>;
    intel: Record<string, IntelRecord>;
    ships: Ship[];
    knownShips: Ship[];
    orders: Order[];
    knownOrders: Order[];
    signals: Signal[];
    messages: Message[];
    milestones: string[];
    actions: {
        tick: number;
        action: Action;
    }[];
    routes: string[];
    failed: boolean;
    pauseRequested: boolean;
}
export interface PlayerView {
    time: number;
    seed: number;
    systems: StarSystem[];
    intel: Record<string, IntelRecord>;
    worlds: Record<string, WorldState>;
    ships: Ship[];
    orders: Order[];
    messages: Message[];
    milestones: string[];
    routes: string[];
    failed: boolean;
    credits: number;
    capacity: number;
}
