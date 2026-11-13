import { noStore } from "@/lib/server/http";
import { providerConfiguration } from "@/lib/server/providers";
export function GET() {
  return Response.json(
    {
      status: "ok",
      application: "DARA",
      version: "0.5.0",
      mode: "workspace",
      providers: {
        ...providerConfiguration(),
        authentication: "workspace-access-code",
        cloudStorage: "not-connected",
      },
      storage: "this-device",
      configurationOnly: true,
    },
    { headers: noStore },
  );
}
