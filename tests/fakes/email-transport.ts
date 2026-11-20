import type { EmailSendResult, EmailTransport } from "@/lib/notifications";

export interface RecordedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export class FakeEmailTransport implements EmailTransport {
  public readonly sent: RecordedEmail[] = [];
  private shouldFail = false;

  public setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  public reset(): void {
    this.sent.length = 0;
    this.shouldFail = false;
  }

  public async send(input: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<EmailSendResult> {
    if (this.shouldFail) {
      return { ok: false, errorMessage: "Simulated email error" };
    }
    this.sent.push({ ...input });
    return { ok: true, id: `email-${this.sent.length}` };
  }
}
