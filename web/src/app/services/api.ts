import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, shareReplay } from 'rxjs';
import {
  ChallengeRequest,
  JobResponse,
  PreviewResponse,
  ProfileResponse,
  RankingPage,
  RunResponse,
  SetupOptions,
  Tokens,
} from '../models';
import { Session } from './session';

const JOB_POLL_MILLIS = 500;
const JOB_POLLS = 60;

/** A call that expects text gets its error as text. What is not JSON is not something to show. */
function parsed(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** What went wrong, in words to show the player. */
export function messageOf(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : 'Something went wrong.';
  }

  if (error.status === 0) return 'The server cannot be reached right now.';
  if (error.status === 429) return 'Too many requests. Wait a minute and try again.';
  const body = parsed(error.error);
  if (typeof body === 'string' && body.length > 0) return body;
  if (typeof body === 'object' && body !== null && 'errors' in body) {
    return Object.values((body as { errors: Record<string, string[]> }).errors).flat().join(' ');
  }

  return error.status === 404 ? 'The server could not find that.' : 'The server is not answering as it should. Try again later.';
}

/** The server: challenges to read, accounts and the ranking. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly options$ = this.http.get<SetupOptions>('api/options').pipe(shareReplay(1));

  options(): Promise<SetupOptions> {
    return firstValueFrom(this.options$);
  }

  /** The challenge a page's address asks for. */
  previewOfLink(query: Record<string, string>): Promise<PreviewResponse> {
    return firstValueFrom(this.http.get<PreviewResponse>('api/previews', { params: new HttpParams({ fromObject: query }) }));
  }

  /** The challenge of a form. */
  previewOfForm(request: ChallengeRequest): Promise<PreviewResponse> {
    return firstValueFrom(this.http.post<PreviewResponse>('api/previews', request));
  }

  async signIn(email: string, password: string): Promise<void> {
    try {
      this.session.keep(await firstValueFrom(this.http.post<Tokens>('api/auth/login', { email, password })));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) throw new Error('That email and password do not match.');
      throw error;
    }
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post('api/auth/register', { email, password }, { responseType: 'text' }));
    await this.signIn(email, password);
  }

  signOut(): void {
    this.session.keep(null);
  }

  profile(): Promise<ProfileResponse> {
    return firstValueFrom(this.http.get<ProfileResponse>('api/me'));
  }

  setDisplayName(displayName: string): Promise<ProfileResponse> {
    return firstValueFrom(this.http.put<ProfileResponse>('api/me', { displayName }));
  }

  myRuns(): Promise<RunResponse[]> {
    return firstValueFrom(this.http.get<RunResponse[]>('api/me/runs'));
  }

  deleteRun(challengeId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`api/runs/${challengeId}`, { responseType: 'text' }));
  }

  ranking(offset: number, limit: number): Promise<RankingPage> {
    return firstValueFrom(this.http.get<RankingPage>('api/ranking', { params: { offset, limit } }));
  }

  /** Records a finished challenge: the server first generates its own copy of it, then takes the player's word. */
  async submitRun(code: string, deaths: number, proofUrl: string): Promise<RunResponse> {
    const challengeId = await this.storeChallenge(code);
    return firstValueFrom(this.http.put<RunResponse>('api/runs', { challengeId, deaths, proofUrl }));
  }

  private async storeChallenge(code: string): Promise<string> {
    let job = await firstValueFrom(this.http.post<JobResponse>('api/challenges', { code }));
    for (let poll = 0; poll < JOB_POLLS && job.status === 'queued'; poll++) {
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MILLIS));
      job = await firstValueFrom(this.http.get<JobResponse>(`api/jobs/${job.id}`));
    }

    if (!job.challengeId) throw new Error(job.error ?? 'The server took too long with this challenge. Try again.');
    return job.challengeId;
  }
}
