import crypto from "node:crypto";
import type { QstashVerifier } from "@/lib/auth";

export class FakeQstashVerifier implements QstashVerifier {
  private readonly secret: string;

  constructor(secret: string = "fake-qstash-secret") {
    this.secret = secret;
  }

  public sign(body: string): string {
    return crypto
      .createHmac("sha256", this.secret)
      .update(body)
      .digest("hex");
  }

  public async verify(input: {
    signature: string;
    body: string;
    url: string;
  }): Promise<boolean> {
    if (!input.signature) {
      return false;
    }
    const expected = this.sign(input.body);
    const a = Buffer.from(input.signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}
