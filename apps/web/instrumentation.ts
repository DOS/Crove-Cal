import * as Sentry from "@sentry/nextjs";
import { type Instrumentation } from "next";

export async function register() {
  if (process.env.NODE_ENV === "production") {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === "nodejs") {
      await import("./sentry.server.config");
    }
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === "edge") {
      await import("./sentry.edge.config");
    }
  }
  // Workflows engine (audit HI-14): subscribe the reminder scheduler to booking
  // lifecycle events. Nodejs server runtime only - the edge bundle must not
  // pull the workflows engine in.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@calcom/features/workflows/lib/bookingWorkflowListener").then(
      (mod) => mod.registerBookingWorkflowListener()
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureRequestError(err, request, context);
  }
};
