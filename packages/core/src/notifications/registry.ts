import type { ChannelType } from "@tixing/shared";
import type { NotifyAdapter } from "./base.js";
import { BarkNotifyAdapter } from "./bark.js";
import { TelegramNotifyAdapter } from "./telegram.js";

const telegram = new TelegramNotifyAdapter();
const bark = new BarkNotifyAdapter();

export function getNotifyAdapter(type: ChannelType): NotifyAdapter | null {
  if (type === "telegram") return telegram;
  if (type === "bark") return bark;
  return null;
}
