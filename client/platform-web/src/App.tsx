import { useEffect } from "react";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { startRrwebTracker } from "./lib/rrwebTracker";

export function App() {
  useEffect(() => {
    startRrwebTracker();
  }, []);

  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}

