import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DARA · ASHA household register",
    short_name: "DARA",
    description: "Digital Assisted Recordkeeping for ASHA Workers",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#175CD3",
    lang: "en",
    orientation: "any",
    categories: ["medical", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
