import { useEffect } from "react";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { startRrwebTracker } from "./lib/rrwebTracker";
import { useAuthStore } from "./store/auth";

export function App() {
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    // If we want to restart the tracker or ensure it has the user info, 
    // it's best to start it here. But since `startRrwebTracker` skips if sessionId is set, 
    // we should ideally update the backend session. For now, it will start when the app boots.
    // If it boots while logged in, it will catch the username.
    startRrwebTracker();
  }, [user?.username]);

  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}

