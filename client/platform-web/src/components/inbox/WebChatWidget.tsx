import { EmbedWebChat } from "../../embed/EmbedWebChat";
import { useWebChatSettings } from "../../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * In-app / demo bubble. Production third-party sites should load
 * `/embed/webchat.js` instead of importing this component.
 */
export function WebChatWidget() {
  const { data: settings } = useWebChatSettings();
  if (!settings?.widgetKey) return null;
  return (
    <EmbedWebChat
      apiBase={API_BASE || window.location.origin}
      widgetKey={settings.widgetKey}
      title="Live Chat"
      storageKey="cep_web_chat_demo"
    />
  );
}
