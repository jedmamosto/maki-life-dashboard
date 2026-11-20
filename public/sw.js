/* Maki Care Service Worker - Classic + RFC 8030 Declarative Push Handler */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  const fallback = {
    title: "Maki Care",
    body: "Open Maki's care board to check today's tasks.",
    navigate: "/",
    tag: "maki-care-alert",
  };

  if (!event.data) {
    return fallback;
  }

  try {
    const raw = event.data.json();
    if (!raw || typeof raw !== "object") {
      return fallback;
    }

    // Support RFC 8030 Declarative Web Push format ({ web_push: 8030, notification: {...} })
    const notif =
      raw.web_push === 8030 && raw.notification && typeof raw.notification === "object"
        ? raw.notification
        : raw;

    const title =
      typeof notif.title === "string" && notif.title.trim().length > 0
        ? notif.title.trim()
        : fallback.title;
    const body =
      typeof notif.body === "string" && notif.body.trim().length > 0
        ? notif.body.trim()
        : fallback.body;
    const navigate =
      typeof notif.navigate === "string" && notif.navigate.trim().length > 0
        ? notif.navigate.trim()
        : typeof raw.url === "string" && raw.url.trim().length > 0
          ? raw.url.trim()
          : fallback.navigate;
    const tag =
      typeof notif.tag === "string" && notif.tag.trim().length > 0
        ? notif.tag.trim()
        : typeof raw.tag === "string" && raw.tag.trim().length > 0
          ? raw.tag.trim()
          : fallback.tag;

    return { title, body, navigate, tag };
  } catch {
    try {
      const text = event.data.text();
      if (typeof text === "string" && text.trim().length > 0) {
        return {
          ...fallback,
          body: text.trim(),
        };
      }
    } catch {
      // Fall back to default message
    }
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        title: "Maki Care",
        body: "Open Maki's care board to check today's tasks.",
        navigate: "/",
        tag: "maki-care-alert",
      };

      try {
        payload = parsePushPayload(event);
      } catch {
        // Keep safe fallback payload
      }

      try {
        await self.registration.showNotification(payload.title, {
          body: payload.body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: payload.tag,
          renotify: true,
          data: {
            navigate: payload.navigate,
          },
        });
      } catch {
        await self.registration.showNotification("Maki Care", {
          body: "Check Maki's care board.",
          icon: "/icons/icon-192.png",
          data: { navigate: "/" },
        });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawNavigate =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.navigate === "string"
      ? event.notification.data.navigate
      : "/";

  event.waitUntil(
    (async () => {
      const targetUrl = new URL(rawNavigate, self.location.origin).href;
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          const baseMatch = client.url.match(/^https?:\/\/[^/]+(\/h\/[^/?#]+)/);
          const clientBase = baseMatch ? baseMatch[1] : null;

          if (clientBase && rawNavigate === "/") {
            if (typeof client.focus === "function") {
              return client.focus();
            }
            continue;
          }

          let resolvedUrl = targetUrl;
          if (clientBase) {
            if (rawNavigate === "/owner" || rawNavigate.endsWith("/owner")) {
              resolvedUrl = `${self.location.origin}${clientBase}/owner`;
            } else if (
              rawNavigate.startsWith("/") &&
              !rawNavigate.startsWith("/h/")
            ) {
              resolvedUrl = `${self.location.origin}${clientBase}${rawNavigate}`;
            }
          }

          if (typeof client.navigate === "function") {
            try {
              await client.navigate(resolvedUrl);
            } catch {
              // Focus existing window even if navigate fails
            }
          }
          if (typeof client.focus === "function") {
            return client.focus();
          }
        }
      }

      if (typeof self.clients.openWindow === "function") {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })()
  );
});
