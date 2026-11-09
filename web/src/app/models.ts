/** What the API speaks. */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type Length = 'short' | 'full' | 'epic';
export type Curve = 'constant' | 'rising' | 'peaks' | 'rollercoaster';

export interface Stats {
  strength: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  attunement: number;
}

export interface ClassOption {
  name: string;
  level: number;
  stats: Stats;
}

export interface GiftOption {
  row: number;
  label: string;
}

export interface SetupOptions {
  classes: ClassOption[];
  gifts: GiftOption[];
  difficulties: Difficulty[];
  lengths: Length[];
  curves: Curve[];
}

export interface RuleView {
  number: number;
  title: string;
  text: string;
  advice?: string;
}

export interface ChapterView {
  heading: string;
  until: string;
  areas: string[];
  bosses: string[];
  difficulty: Difficulty;
  rules: RuleView[];
}

export interface ChallengeView {
  code: string;
  generatorVersion: string;
  dataVersion: string;
  startingClass: string;
  gift: string[];
  levelCap: number;
  difficulty: Difficulty;
  curve: Curve;
  length: Length;
  journey: RuleView[];
  chapters: ChapterView[];
  definitions: { term: string; text: string }[];
  warnings: { npc: string; text: string }[];
}

export interface PreviewResponse {
  code?: string;
  notices: string[];
  view?: ChallengeView;
}

/** A challenge to generate: a code, or settings. Settings left out are drawn by the seed. */
export interface ChallengeRequest {
  code?: string;
  difficulty?: Difficulty;
  length?: Length;
  curve?: Curve;
  startingClass?: string;
  giftRow?: number;
  levelCap?: number;
}

export interface JobResponse {
  id: string;
  code: string;
  status: 'queued' | 'done' | 'failed';
  challengeId?: string;
  error?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface ProfileResponse {
  email: string;
  displayName?: string;
}

export interface RunResponse {
  challengeId: string;
  code: string;
  displayName: string;
  score: number;
  deaths: number;
  proofUrl?: string;
  finishedAt: string;
}

export interface RankingEntry {
  rank: number;
  displayName: string;
  score: number;
  runs: number;
}

export interface RankingPage {
  entries: RankingEntry[];
  offset: number;
  total: number;
}
