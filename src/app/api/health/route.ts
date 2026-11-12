import { noStore } from "@/lib/server/http";
export function GET() {
  return Response.json(
    {
      status: "ok",
      application: "DARA",
      version: "0.1.0",
      mode: "demo",
      providers: {
        speech: "placeholder",
        extraction: "placeholder",
        authentication: "placeholder",
        cloudStorage: "placeholder",
      },
      storage: "this-device",
    },
    { headers: noStore },
  );
}
