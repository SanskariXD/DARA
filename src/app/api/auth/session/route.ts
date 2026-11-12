import { unavailableIntegration } from "@/lib/server/providers";
export async function POST() {
  return unavailableIntegration("authentication");
}
