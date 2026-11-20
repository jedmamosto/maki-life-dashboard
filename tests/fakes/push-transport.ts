import type { PushSubscriptionRecord } from "@/lib/types";
import type {
  PushSendResult,
  PushTransport,
  WebPushPayload,
} from "@/lib/notifications";

export interface RecordedPush {
  endpoint: string;
  payload: WebPushPayload;
  options: { urgency: "high" | "normal"; TTL: number };
  statusCode: number;
}

export class FakePushTransport implements PushTransport {
  public readonly sent: RecordedPush[] = [];
  private endpointStatuses = new Map<string, number>();

  public setEndpointStatus(endpoint: string, statusCode: number): void {
    this.endpointStatuses.set(endpoint, statusCode);
  }

  public clearEndpointStatus(endpoint: string): void {
    this.endpointStatuses.delete(endpoint);
  }

  public reset(): void {
    this.sent.length = 0;
    this.endpointStatuses.clear();
  }

  public async send(
    subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
    payload: WebPushPayload,
    options: { urgency: "high" | "normal"; TTL: number },
  ): Promise<PushSendResult> {
    const statusCode = this.endpointStatuses.get(subscription.endpoint) ?? 201;
    this.sent.push({
      endpoint: subscription.endpoint,
      payload,
      options,
      statusCode,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, statusCode };
    }
    return {
      ok: false,
      statusCode,
      errorMessage: `Simulated push failure (${statusCode})`,
    };
  }
}
