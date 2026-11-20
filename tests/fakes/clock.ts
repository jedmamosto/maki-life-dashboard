export class FakeClock {
  private currentMs: number;

  constructor(initialIso: string = "2026-11-20T00:00:00.000Z") {
    this.currentMs = new Date(initialIso).getTime();
  }

  public now(): Date {
    return new Date(this.currentMs);
  }

  public nowIso(): string {
    return new Date(this.currentMs).toISOString();
  }

  public setIso(iso: string): Date {
    this.currentMs = new Date(iso).getTime();
    return this.now();
  }

  public advanceMinutes(minutes: number): Date {
    this.currentMs += minutes * 60_000;
    return this.now();
  }

  public advanceHours(hours: number): Date {
    this.currentMs += hours * 3_600_000;
    return this.now();
  }
}
