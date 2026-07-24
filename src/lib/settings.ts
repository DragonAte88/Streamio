export interface Settings {
  hwdec: "auto" | "no";
  bufferSecs: number;
  defaultVolume: number;
  theme: "dark" | "light" | "system";
  discordRpcEnabled: boolean;
  discordBotStatusEnabled: boolean;
  autoplayNext: boolean;
  subtitleLanguage: string;
  audioLanguage: string;
  backendUrl: string;
  parentalPinEnabled: boolean;
  parentalPin: string;
  notifyChannelUpdates: boolean;
  notifyFriendActivity: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hwdec: "auto",
  bufferSecs: 10,
  defaultVolume: 100,
  theme: "dark",
  discordRpcEnabled: true,
  discordBotStatusEnabled: false,
  autoplayNext: false,
  subtitleLanguage: "off",
  audioLanguage: "default",
  backendUrl: "https://163-192-40-120.sslip.io",
  parentalPinEnabled: false,
  parentalPin: "",
  notifyChannelUpdates: true,
  notifyFriendActivity: false
};

const KEY = "streamio.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
