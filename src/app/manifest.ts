import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes the phone-shell experience installable (Add to
 * Home Screen / PWA). Deliberately mirrors the app's brand palette.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ona",
    short_name: "Ona",
    description:
      "Find nearby mechanics, vulcanizers and tow trucks — request, negotiate and track repairs in one place.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F0A2E",
    theme_color: "#0F0A2E",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}