/**
 * Anonymous, privacy-first analytics service for Video Cleaner.
 * 
 * Guarantees:
 * - 100% anonymous installation ID (random UUID, never hardware/personal info)
 * - Explicit user opt-in/opt-out consent
 * - Strict sanitization: NO filenames, NO file paths, NO frames, NO personal data
 * - Non-blocking: offline errors are silently ignored and never affect video processing
 */

import { getApiEndpoint } from "../config/api";

const STORAGE_KEY_CONSENT = "vc_analytics_consent";
const STORAGE_KEY_INSTALL_ID = "vc_analytics_install_id";

export type AnalyticsConsent = "enabled" | "disabled" | "unset";

export const ALLOWED_ANALYTICS_EVENTS = [
  "app_first_launch",
  "app_started",
  "app_closed",
  "video_imported",
  "analysis_started",
  "analysis_completed",
  "cleaning_started",
  "cleaning_completed",
  "clean_video_exported",
  "clip_exported",
  "processing_cancelled",
  "processing_error",
  "export_error",
  "application_error",
  "settings_opened",
  "analytics_enabled",
  "analytics_disabled",
  "update_check",
  "update_available",
  "update_completed",
] as const;

export type AnalyticsEventName = typeof ALLOWED_ANALYTICS_EVENTS[number];

/**
 * Gets or creates a random, non-identifiable installation ID.
 */
export function getInstallationId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY_INSTALL_ID);
    if (!id || !id.startsWith("install_")) {
      const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      id = `install_${randomPart}`;
      localStorage.setItem(STORAGE_KEY_INSTALL_ID, id);
    }
    return id;
  } catch {
    return "install_anonymous";
  }
}

/**
 * Retrieves the current analytics consent status.
 */
export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    const val = localStorage.getItem(STORAGE_KEY_CONSENT);
    if (val === "enabled" || val === "disabled") {
      return val;
    }
    return "unset";
  } catch {
    return "unset";
  }
}

/**
 * Sets user consent. If enabled, immediately syncs with backend settings.
 */
export async function setAnalyticsConsent(consent: "enabled" | "disabled"): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_CONSENT, consent);
    // Sync with backend settings
    const enabled = consent === "enabled";
    fetch(getApiEndpoint("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analytics_enabled: enabled }),
    }).catch(() => {});

    if (enabled) {
      trackEvent("analytics_enabled");
    } else {
      trackEvent("analytics_disabled");
    }
  } catch {}
}

/**
 * Sanitizes metadata to ensure no filenames, full paths, or sensitive keys are ever sent.
 */
function sanitizeMetadata(meta?: Record<string, any>): Record<string, any> {
  if (!meta) return {};
  const clean: Record<string, any> = {};
  const forbiddenKeys = ["path", "filepath", "filename", "file_name", "name", "dir", "user", "username"];

  for (const [k, v] of Object.entries(meta)) {
    const lowerKey = k.toLowerCase();
    if (forbiddenKeys.some((f) => lowerKey.includes(f))) {
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      // If string looks like a Windows or Unix path, skip it
      if (typeof v === "string" && (v.includes(":\\") || v.includes("/") || v.length > 120)) {
        continue;
      }
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Safe, non-blocking telemetry event dispatcher.
 */
export async function trackEvent(
  eventName: AnalyticsEventName,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const consent = getAnalyticsConsent();
    if (consent !== "enabled" && eventName !== "analytics_disabled") {
      return;
    }

    const payload = {
      install_id: getInstallationId(),
      event_name: eventName,
      app_version: "1.0.0",
      metadata: sanitizeMetadata(metadata),
    };

    fetch(getApiEndpoint("/api/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Offline or network error: fail completely silently
    });
  } catch {
    // Fail silently, never affect user workflow
  }
}
