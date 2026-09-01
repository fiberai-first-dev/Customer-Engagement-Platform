const fs = require('fs'); 
const file = 'd:/projects/FiberAI/Customer-Engagement-Platform/client/platform-web/src/api/index.ts'; 
const content = fs.readFileSync(file, 'utf8'); 
const goodContent = content.substring(0, content.indexOf('export const useDeleteOrgUser')); 
const additional = `export const useDeleteOrgUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean }>(\`/api/v1/users/\${id}\`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
    },
  });
};

export const useUploadMedia = () => {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(\`\${API_BASE}/api/v1/media/upload\`, {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${localStorage.getItem("token")}\`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload media");
      }
      return response.json() as Promise<{
        mediaKey: string;
        mimeType: string;
        filename: string;
      }>;
    },
  });
};

export const useSendWhatsAppTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      templateId,
      variables,
    }: {
      id: string;
      templateId: string;
      variables: Record<string, string>;
    }) =>
      request<{
        conversationId?: string;
        message: Message | null;
        result: { ok: boolean; status: string; error?: string };
      }>(\`/api/v1/conversations/\${encodeURIComponent(id)}/whatsapp/templates/send\`, {
        method: "POST",
        body: JSON.stringify({ templateId, variables }),
      }),
    onSuccess: (data, variables) => {
      const resolvedId = data.conversationId || variables.id;
      if (data.message) {
        queryClient.setQueryData<Message[]>(["messages", resolvedId], (current) => {
          const list = current ?? [];
          return [...list, data.message!];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
`;
fs.writeFileSync(file, goodContent + additional);
