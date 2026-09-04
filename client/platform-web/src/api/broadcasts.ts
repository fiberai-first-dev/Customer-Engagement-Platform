import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "./index";

export type BroadcastJob = {
  id: string;
  templateId: string;
  templateName: string;
  variables: Record<string, string>;
  status: "completed" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  recipients: Array<{
    id: string;
    customerId: string;
    customerName: string | null;
    status: "sent" | "failed";
    error: string | null;
  }>;
};

export const useBroadcastHistory = () => {
  return useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => request<{ jobs: BroadcastJob[] }>("/api/v1/broadcasts"),
  });
};

export const useSendBroadcast = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { templateId: string; customerIds: string[]; variables: Record<string, string> }) =>
      request<{ jobId: string; total: number; succeeded: number; failed: number }>("/api/v1/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

