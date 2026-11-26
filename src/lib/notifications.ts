import { Resend } from "resend";
import { sendNotification } from "web-push";
import {
  buildHouseholdEmailUrl,
  buildHouseholdPushNavigate,
  getServerHouseholdPath,
} from "./auth";
import { PUSH_TEMPLATES, UI_COPY } from "./copy";
import {
  MEAL_CHECKIN_STAGES,
  MEAL_ESCALATION_DELAY_MINUTES,
  mealCheckinDispatchKey,
  mealCheckinSkipKey,
} from "./domain";
import {
  clampToQuietHours,
  getManilaDateKey,
  getManilaIsoWeekKey,
  getManilaParts,
  getSlotScheduledAt,
} from "./timezone";
import type {
  CareRepository,
  CaregiverRole,
  PushSubscriptionRecord,
} from "./types";

export interface WebPushPayload {
  web_push: 8030;
  notification: {
    title: string;
    body: string;
    navigate: string;
  };
}

export interface PushSendResult {
  ok: boolean;
  statusCode: number;
  errorMessage?: string;
}

export interface PushTransport {
  send(
    subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
    payload: WebPushPayload,
    options: { urgency: "high" | "normal"; TTL: number },
  ): Promise<PushSendResult>;
}

export interface EmailSendResult {
  ok: boolean;
  id?: string;
  errorMessage?: string;
}

export interface EmailTransport {
  send(input: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<EmailSendResult>;
}

class RealWebPushTransport implements PushTransport {
  public async send(
    subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
    payload: WebPushPayload,
    options: { urgency: "high" | "normal"; TTL: number },
  ): Promise<PushSendResult> {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:owner@example.com";
    if (!publicKey || !privateKey) {
      return {
        ok: false,
        statusCode: 503,
        errorMessage: "VAPID keys are not configured",
      };
    }
    try {
      const response = await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
        {
          urgency: options.urgency,
          TTL: options.TTL,
          vapidDetails: {
            subject,
            publicKey,
            privateKey,
          },
        },
      );
      return { ok: true, statusCode: response.statusCode };
    } catch (err: unknown) {
      const statusCode =
        typeof err === "object" &&
        err !== null &&
        "statusCode" in err &&
        typeof (err as { statusCode: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      const errorMessage =
        err instanceof Error ? err.message : "Push delivery failed";
      return { ok: false, statusCode, errorMessage };
    }
  }
}

class RealResendEmailTransport implements EmailTransport {
  public async send(input: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        errorMessage: "RESEND_API_KEY is not configured",
      };
    }
    try {
      const resend = new Resend(apiKey);
      const response = await resend.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      if (response.error) {
        return { ok: false, errorMessage: response.error.message };
      }
      return { ok: true, id: response.data?.id };
    } catch (err: unknown) {
      return {
        ok: false,
        errorMessage:
          err instanceof Error ? err.message : "Email send failed",
      };
    }
  }
}

const defaultPushTransport = new RealWebPushTransport();
const defaultEmailTransport = new RealResendEmailTransport();

let pushTransportOverride: PushTransport | null = null;
let emailTransportOverride: EmailTransport | null = null;

export function setPushTransportForTests(
  transport: PushTransport | null,
): void {
  pushTransportOverride = transport;
}

export function setEmailTransportForTests(
  transport: EmailTransport | null,
): void {
  emailTransportOverride = transport;
}

function getPushTransport(): PushTransport {
  return pushTransportOverride ?? defaultPushTransport;
}

function getEmailTransport(): EmailTransport {
  return emailTransportOverride ?? defaultEmailTransport;
}

export async function sendPushToSubscriptions(params: {
  repo: CareRepository;
  subscriptions: PushSubscriptionRecord[];
  title: string;
  body: string;
  navigate: string;
  urgency?: "high" | "normal";
  TTL?: number;
  now: Date;
  skipPushHealthCheck?: boolean;
}): Promise<{ sentCount: number; failedCount: number; revokedCount: number }> {
  const transport = getPushTransport();
  const payload: WebPushPayload = {
    web_push: 8030,
    notification: {
      title: params.title,
      body: params.body,
      navigate: params.navigate,
    },
  };
  const urgency = params.urgency ?? "high";
  const ttl = params.TTL ?? 1800;
  const nowIso = params.now.toISOString();

  let sentCount = 0;
  let failedCount = 0;
  let revokedCount = 0;
  let helperRevoked = false;

  const caregivers = await params.repo.listCaregivers();
  const roleByCaregiverId = new Map<string, CaregiverRole>(
    caregivers.map((c) => [c.id, c.role]),
  );

  for (const sub of params.subscriptions) {
    const result = await transport.send(sub, payload, { urgency, TTL: ttl });
    if (result.ok) {
      sentCount += 1;
      await params.repo.markPushSubscriptionSuccess(sub.endpoint, nowIso);
    } else if (result.statusCode === 404 || result.statusCode === 410) {
      revokedCount += 1;
      await params.repo.markPushSubscriptionRevoked(sub.endpoint, nowIso);
      if (roleByCaregiverId.get(sub.caregiverId) === "helper") {
        helperRevoked = true;
      }
    } else {
      failedCount += 1;
    }
  }

  if (helperRevoked && !params.skipPushHealthCheck) {
    const activeHelpers = await params.repo.listActivePushSubscriptions([
      "helper",
    ]);
    if (activeHelpers.length === 0) {
      const claimed = await params.repo.claimNotificationDispatch({
        dispatchKey: "push-health:helper-zero",
        channel: "web_push",
        targetScope: "owner",
        status: "sent",
        metaJson: { activeHelperDevices: 0 },
        createdAtIso: nowIso,
      });
      if (claimed) {
        const ownerSubs = await params.repo.listActivePushSubscriptions([
          "owner",
        ]);
        const settings = await params.repo.getSettings();
        const householdPath = getServerHouseholdPath(settings);
        const originBase = /^https?:\/\//i.test(params.navigate)
          ? new URL(params.navigate).origin
          : "";
        const alertTemplate = PUSH_TEMPLATES.pushHealthOwnerAlert(0);
        await sendPushToSubscriptions({
          repo: params.repo,
          subscriptions: ownerSubs,
          title: alertTemplate.title,
          body: alertTemplate.body,
          navigate: buildHouseholdPushNavigate(
            originBase,
            householdPath,
            "/owner",
          ),
          urgency: "high",
          TTL: 1800,
          now: params.now,
          skipPushHealthCheck: true,
        });
      }
    }
  }

  return { sentCount, failedCount, revokedCount };
}

export async function sendPushToRoles(params: {
  repo: CareRepository;
  roles: CaregiverRole[];
  title: string;
  body: string;
  navigate: string;
  urgency?: "high" | "normal";
  TTL?: number;
  now: Date;
}): Promise<{ sentCount: number; failedCount: number; revokedCount: number }> {
  const subs = await params.repo.listActivePushSubscriptions(params.roles);
  return sendPushToSubscriptions({
    repo: params.repo,
    subscriptions: subs,
    title: params.title,
    body: params.body,
    navigate: params.navigate,
    urgency: params.urgency ?? "high",
    TTL: params.TTL ?? 1800,
    now: params.now,
  });
}

export async function sendOwnerAlertEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  if (!params.to) {
    return { ok: false, errorMessage: "No owner email configured" };
  }
  const from = process.env.RESEND_FROM_EMAIL ?? "Maki Care <onboarding@resend.dev>";
  return getEmailTransport().send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
}

export async function markMealCheckinSkipped(
  repo: CareRepository,
  dateKey: string,
  nowIso: string,
): Promise<void> {
  for (const stage of MEAL_CHECKIN_STAGES) {
    const alreadySent = await repo.hasNotificationDispatch(
      mealCheckinDispatchKey(dateKey, stage),
    );
    if (!alreadySent) {
      await repo.claimNotificationDispatch({
        dispatchKey: mealCheckinSkipKey(dateKey, stage),
        channel: stage === "OWNER_EMAIL" ? "email" : "web_push",
        targetScope: stage,
        status: "skipped_done",
        metaJson: { dateKey, stage },
        createdAtIso: nowIso,
      });
    }
  }
}

export async function rearmMealCheckin(
  repo: CareRepository,
  dateKey: string,
): Promise<void> {
  await repo.clearDispatchesWithPrefix(`meal-checkin-skip:${dateKey}:`);
}

export interface CronTickResult {
  manilaNowIso: string;
  dispatchedCount: number;
  emailsSent: number;
}

export async function runCronEscalations(params: {
  repo: CareRepository;
  now: Date;
  baseUrl: string;
}): Promise<CronTickResult> {
  const { repo, now, baseUrl } = params;
  const nowIso = now.toISOString();
  const settings = await repo.updateSettings({ lastCronTickAtIso: nowIso });

  const todayDateKey = getManilaDateKey(now);
  const householdPath = getServerHouseholdPath(settings);
  const caregiverNavigate = buildHouseholdPushNavigate(baseUrl, householdPath);
  const ownerNavigate = buildHouseholdPushNavigate(
    baseUrl,
    householdPath,
    "/owner",
  );
  const ownerEmailUrl = buildHouseholdEmailUrl(baseUrl, householdPath);
  let dispatchedCount = 0;
  let emailsSent = 0;

  // 1. Daily Meal Shortfall Check-in + 60m Owner Escalation
  const todayFeedings = await repo.listActiveFeedingsByDate(todayDateKey);
  const mealCount = todayFeedings.length;
  const mealTarget = Math.max(1, settings.dailyMealGoal);

  if (mealCount < mealTarget) {
    const reminderAt = getSlotScheduledAt(
      todayDateKey,
      settings.mealReminderHour,
      settings.mealReminderMinute,
    );
    const diffMs = now.getTime() - reminderAt.getTime();
    if (diffMs >= 0) {
      const diffMinutes = Math.floor(diffMs / 60_000);
      const reminderKey = mealCheckinDispatchKey(todayDateKey, "REMINDER");
      const claimedReminder = await repo.claimNotificationDispatch({
        dispatchKey: reminderKey,
        channel: "web_push",
        targetScope: "helper,owner",
        status: "sent",
        metaJson: { dateKey: todayDateKey, mealCount, mealTarget },
        createdAtIso: nowIso,
      });
      if (claimedReminder) {
        const template = PUSH_TEMPLATES.mealShortfallCheckIn(
          mealCount,
          mealTarget,
        );
        await sendPushToRoles({
          repo,
          roles: ["helper", "owner"],
          title: template.title,
          body: template.body,
          navigate: caregiverNavigate,
          urgency: "high",
          TTL: 1800,
          now,
        });
        dispatchedCount += 1;
      }

      if (diffMinutes >= MEAL_ESCALATION_DELAY_MINUTES) {
        const escalationKey = mealCheckinDispatchKey(
          todayDateKey,
          "OWNER_ESCALATION",
        );
        const claimedEscalation = await repo.claimNotificationDispatch({
          dispatchKey: escalationKey,
          channel: "web_push",
          targetScope: "owner",
          status: "sent",
          metaJson: { dateKey: todayDateKey, mealCount, mealTarget, diffMinutes },
          createdAtIso: nowIso,
        });
        const escalationTemplate = PUSH_TEMPLATES.mealShortfallOwnerEscalation(
          mealCount,
          mealTarget,
        );
        if (claimedEscalation) {
          await sendPushToRoles({
            repo,
            roles: ["owner"],
            title: escalationTemplate.title,
            body: escalationTemplate.body,
            navigate: ownerNavigate,
            urgency: "high",
            TTL: 1800,
            now,
          });
          dispatchedCount += 1;
        }

        const emailAddress =
          settings.ownerEmail || process.env.OWNER_ALERT_EMAIL || "";
        if (emailAddress) {
          const emailKey = mealCheckinDispatchKey(todayDateKey, "OWNER_EMAIL");
          const claimedEmail = await repo.claimNotificationDispatch({
            dispatchKey: emailKey,
            channel: "email",
            targetScope: "owner",
            status: "sent",
            metaJson: { dateKey: todayDateKey, mealCount, mealTarget, emailAddress },
            createdAtIso: nowIso,
          });
          if (claimedEmail) {
            const emailRes = await sendOwnerAlertEmail({
              to: emailAddress,
              subject: escalationTemplate.title,
              text: `${escalationTemplate.body}\n\nOpen Maki Care: ${ownerEmailUrl}`,
            });
            if (emailRes.ok) {
              emailsSent += 1;
            }
          }
        }
      }
    }
  }

  // 2. Litter Escalations (Day+2 Helper clamped to Quiet Hours; Day+3 Owner immediate)
  const litterEvents = await repo.listCareEventsByType("LITTER_CLEAN", 1);
  const latestClean = litterEvents[0] ?? null;
  if (latestClean) {
    const cleanMs = new Date(latestClean.occurredAtIso).getTime();
    const day2DueAt = new Date(
      cleanMs + settings.litterIntervalHours * 3_600_000,
    );
    const day2ClampedAt = clampToQuietHours(day2DueAt);
    const day3OwnerAt = new Date(
      cleanMs + (settings.litterIntervalHours + 24) * 3_600_000,
    );

    if (now.getTime() >= day2ClampedAt.getTime()) {
      const claimedDay2 = await repo.claimNotificationDispatch({
        dispatchKey: `litter:${latestClean.id}:DAY2_HELPER`,
        channel: "web_push",
        targetScope: "helper",
        status: "sent",
        metaJson: { cleanId: latestClean.id },
        createdAtIso: nowIso,
      });
      if (claimedDay2) {
        const tmpl = PUSH_TEMPLATES.litterDueHelper();
        await sendPushToRoles({
          repo,
          roles: ["helper"],
          title: tmpl.title,
          body: tmpl.body,
          navigate: caregiverNavigate,
          urgency: "high",
          TTL: 1800,
          now,
        });
        dispatchedCount += 1;
      }
    }

    if (now.getTime() >= day3OwnerAt.getTime()) {
      const claimedDay3 = await repo.claimNotificationDispatch({
        dispatchKey: `litter:${latestClean.id}:DAY3_OWNER`,
        channel: "web_push",
        targetScope: "owner",
        status: "sent",
        metaJson: { cleanId: latestClean.id },
        createdAtIso: nowIso,
      });
      if (claimedDay3) {
        const tmpl = PUSH_TEMPLATES.litterEscalateOwner();
        await sendPushToRoles({
          repo,
          roles: ["owner"],
          title: tmpl.title,
          body: tmpl.body,
          navigate: ownerNavigate,
          urgency: "high",
          TTL: 1800,
          now,
        });
        dispatchedCount += 1;
      }
    }
  }

  // 3. Weekly Play Family Nudge (max 2/week: Wed 17:00 iff <2, Sat 11:00 iff <3)
  const parts = getManilaParts(now);
  const isoWeekKey = getManilaIsoWeekKey(now);
  const weekEvents = await repo.listCareEventsByWeek(isoWeekKey);
  const playCount = weekEvents.filter(
    (e) => e.eventType === "OUT_OF_ROOM" || e.eventType === "PLAY_SESSION",
  ).length;
  const playTarget = Math.max(1, settings.weeklyPlayGoal);

  if (parts.weekday === 3 && parts.hour >= 17 && playCount < 2) {
    const claimedWed = await repo.claimNotificationDispatch({
      dispatchKey: `play:${isoWeekKey}:WED_NUDGE`,
      channel: "web_push",
      targetScope: "family",
      status: "sent",
      metaJson: { isoWeekKey, playCount },
      createdAtIso: nowIso,
    });
    if (claimedWed) {
      const tmpl = PUSH_TEMPLATES.playFamilyNudge(playCount, playTarget);
      await sendPushToRoles({
        repo,
        roles: ["family"],
        title: tmpl.title,
        body: tmpl.body,
        navigate: caregiverNavigate,
        urgency: "normal",
        TTL: 1800,
        now,
      });
      dispatchedCount += 1;
    }
  }

  if (parts.weekday === 6 && parts.hour >= 11 && playCount < playTarget) {
    const claimedSat = await repo.claimNotificationDispatch({
      dispatchKey: `play:${isoWeekKey}:SAT_NUDGE`,
      channel: "web_push",
      targetScope: "family",
      status: "sent",
      metaJson: { isoWeekKey, playCount },
      createdAtIso: nowIso,
    });
    if (claimedSat) {
      const tmpl = PUSH_TEMPLATES.playFamilyNudge(playCount, playTarget);
      await sendPushToRoles({
        repo,
        roles: ["family"],
        title: tmpl.title,
        body: tmpl.body,
        navigate: caregiverNavigate,
        urgency: "normal",
        TTL: 1800,
        now,
      });
      dispatchedCount += 1;
    }
  }

  // Keep UI_COPY referenced cleanly for lint/unused checks if needed
  void UI_COPY.brandTitle;

  return {
    manilaNowIso: nowIso,
    dispatchedCount,
    emailsSent,
  };
}
