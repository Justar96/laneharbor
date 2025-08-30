import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Simple health check without SSR overhead
  return json(
    {
      status: "ok",
      service: "LaneHarbor Frontend",
      timestamp: new Date().toISOString(),
      url: request.url,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "application/json",
      },
    }
  );
}

// Prevent this route from being rendered as a React component
export default function HealthRoute() {
  return null;
}
