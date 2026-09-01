const fs = require('fs');
const file = 'd:/projects/FiberAI/Customer-Engagement-Platform/client/platform-web/src/api/index.ts';
const content = fs.readFileSync(file, 'utf8');

const additional = `
export const useWhatsAppTemplates = () =>
  useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => request<WhatsAppTemplate[]>("/api/v1/whatsapp-templates"),
  });

export const useSyncTemplates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request("/api/v1/whatsapp-templates/sync", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(\`/api/v1/whatsapp-templates/\${id}\`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};
`;

fs.writeFileSync(file, content + additional);
