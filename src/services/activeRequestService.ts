import type { FailureReason } from "./failureStatsService";

type ActiveRequestAttemptStatus = "active" | "failed";

type InternalActiveRequestAttempt = {
  providerId: number;
  providerName: string;
  status: ActiveRequestAttemptStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorType: FailureReason | null;
};

type InternalActiveRequest = {
  requestId: string;
  path: string;
  modelSlug: string;
  startedAt: Date;
  currentProviderId: number | null;
  currentProviderName: string | null;
  attempts: InternalActiveRequestAttempt[];
};

export type ActiveRequestAttempt = {
  providerId: number;
  providerName: string;
  status: ActiveRequestAttemptStatus;
  startedAt: Date;
  finishedAt: Date | null;
  elapsedMs: number;
  errorType: FailureReason | null;
};

export type ActiveRequestEntry = {
  requestId: string;
  path: string;
  modelSlug: string;
  startedAt: Date;
  elapsedMs: number;
  currentProviderId: number | null;
  currentProviderName: string | null;
  attempts: ActiveRequestAttempt[];
};

type StartRequestInput = {
  requestId: string;
  path: string;
  modelSlug: string;
  startedAt?: Date;
};

type StartAttemptInput = {
  requestId: string;
  providerId: number;
  providerName: string;
  startedAt?: Date;
};

type FailAttemptInput = {
  requestId: string;
  providerId: number;
  finishedAt?: Date;
  errorType?: FailureReason | null;
};

export class ActiveRequestService {
  private readonly requests = new Map<string, InternalActiveRequest>();

  startRequest(input: StartRequestInput) {
    this.requests.set(input.requestId, {
      requestId: input.requestId,
      path: input.path,
      modelSlug: input.modelSlug,
      startedAt: input.startedAt ?? new Date(),
      currentProviderId: null,
      currentProviderName: null,
      attempts: [],
    });
  }

  startAttempt(input: StartAttemptInput) {
    const request = this.requests.get(input.requestId);
    if (!request) return;

    request.currentProviderId = input.providerId;
    request.currentProviderName = input.providerName;
    request.attempts.push({
      providerId: input.providerId,
      providerName: input.providerName,
      status: "active",
      startedAt: input.startedAt ?? new Date(),
      finishedAt: null,
      errorType: null,
    });
  }

  failAttempt(input: FailAttemptInput) {
    const request = this.requests.get(input.requestId);
    if (!request) return;

    const attempt = [...request.attempts]
      .reverse()
      .find(
        (item) => item.providerId === input.providerId && item.status === "active"
      );
    if (!attempt) return;

    attempt.status = "failed";
    attempt.finishedAt = input.finishedAt ?? new Date();
    attempt.errorType = input.errorType ?? null;

    if (request.currentProviderId === input.providerId) {
      request.currentProviderId = null;
      request.currentProviderName = null;
    }
  }

  finishRequest(requestId: string) {
    this.requests.delete(requestId);
  }

  getEntries(now = Date.now()): ActiveRequestEntry[] {
    return [...this.requests.values()]
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .map((request) => ({
        requestId: request.requestId,
        path: request.path,
        modelSlug: request.modelSlug,
        startedAt: request.startedAt,
        elapsedMs: Math.max(now - request.startedAt.getTime(), 0),
        currentProviderId: request.currentProviderId,
        currentProviderName: request.currentProviderName,
        attempts: request.attempts.map((attempt) => ({
          providerId: attempt.providerId,
          providerName: attempt.providerName,
          status: attempt.status,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt,
          elapsedMs: Math.max(
            (attempt.finishedAt?.getTime() ?? now) - attempt.startedAt.getTime(),
            0
          ),
          errorType: attempt.errorType,
        })),
      }));
  }

  resetAll() {
    this.requests.clear();
  }
}

export const activeRequestService = new ActiveRequestService();
