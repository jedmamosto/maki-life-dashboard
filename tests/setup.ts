import { beforeEach } from "vitest";

process.env.TZ = "UTC";
process.env.HOUSEHOLD_TOKEN = "maki-test-household-token";
process.env.OWNER_DEFAULT_PIN = "1234";
process.env.SESSION_SECRET = "maki-test-session-secret-32-chars-min";
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BTestPublicKeyForVitest1234567890";
process.env.VAPID_PRIVATE_KEY = "TestPrivateKeyForVitest1234567890";
process.env.VAPID_SUBJECT = "mailto:owner@example.com";
process.env.OWNER_ALERT_EMAIL = "owner@example.com";
process.env.RESEND_FROM_EMAIL = "Maki Care <onboarding@resend.dev>";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.CARE_REPO_DRIVER = "memory";
process.env.ENABLE_TEST_HARNESS = "true";

beforeEach(() => {
  process.env.TZ = "UTC";
});
