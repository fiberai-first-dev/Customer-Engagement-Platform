import { useGoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { useAuthStore } from "../../store/auth";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        let credential = tokenResponse.access_token;
        if (import.meta.env.VITE_MOCK === "true") {
          credential = "mock_credential";
        } else {
          // Exchange the access_token for an id_token via Google's userinfo
          // Then send to backend
          const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          });
          if (!userInfoRes.ok) throw new Error("Failed to get user info from Google");
        }

        // We use the implicit flow so we get access_token, not id_token.
        // We pass the access_token to our backend which validates via tokeninfo.
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");

        login(data.token, { id: data.id, username: data.username, role: data.role });
        toast.success(`Welcome, ${data.username}!`);
        navigate("/inbox");
      } catch (err: any) {
        const errorMsg = err.message || "Google sign-in failed";
        toast.error(errorMsg === "Failed to fetch" ? "Unauthorized" : errorMsg);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      toast.error("Google sign-in was cancelled or failed");
    },
    flow: "implicit",
  });

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Fybud</h1>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-foreground mb-2 text-center">Sign in</h2>
          <p className="text-muted-foreground text-sm mb-6 text-center">
            Use your company Google account to continue
          </p>

          <button
            id="google-signin-btn"
            onClick={async () => {
              if (import.meta.env.VITE_MOCK === "true") {
                setLoading(true);
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/auth/google`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ credential: "mock_credential" }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Login failed");
                  login(data.token, { id: data.id, username: data.username, role: data.role });
                  toast.success(`Welcome, ${data.username}!`);
                  navigate("/inbox");
                } catch (err: any) {
                  toast.error(err.message || "Mock login failed");
                } finally {
                  setLoading(false);
                }
              } else {
                googleLogin();
              }
            }}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Only accounts authorised by your organisation can access this platform.
          </p>
        </div>
      </div>
    </div>
  );
}
