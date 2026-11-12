"use client";
import { useEffect } from "react";
export default function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (!cancelled) window.dispatchEvent(new Event("dara:offline-ready"));
      })
      .catch(() => {
        if (!cancelled)
          window.dispatchEvent(new Event("dara:offline-unavailable"));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
