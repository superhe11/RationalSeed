import type { CapacitorConfig } from "@capacitor/cli";
import "@capgo/capacitor-updater";

const config: CapacitorConfig = {
  appId: "by.superhell.rationalseed",
  appName: "Рациональное зерно",
  webDir: "dist-mobile",
  plugins: {
    SystemBars: { insetsHandling: "css", style: "DARK" },
    CapacitorUpdater: {
      autoUpdate: "off",
      statsUrl: "",
      updateUrl: "",
      channelUrl: "",
      appReadyTimeout: 20000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
