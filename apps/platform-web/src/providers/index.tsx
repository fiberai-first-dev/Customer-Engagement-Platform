import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAppStore } from "../store";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
