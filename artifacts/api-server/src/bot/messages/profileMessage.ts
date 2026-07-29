import type { UserProfile } from "../../models/UserProfile";

const LINE = "━━━━━━━━━━━━━━━━━━━━";

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "✅ Active";
    case "banned":
      return "🚫 Banned";
    case "inactive":
      return "⚪ Inactive";
    default:
      return status;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMoney(n: number): string {
  return `৳ ${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Builds the HTML-formatted Telegram profile message.
 * Future fields can be appended to the returned string array
 * without touching existing sections.
 */
export function buildProfileMessage(profile: UserProfile): string {
  const { user, stats } = profile;

  const username = user.username ? `@${user.username}` : "—";

  const lines: string[] = [
    `👤 <b>MY PROFILE</b>`,
    LINE,
    "",
    `📛 <b>Name:</b> ${user.name}`,
    `🔖 <b>Username:</b> ${username}`,
    `🆔 <b>Telegram ID:</b> <code>${user.telegramId}</code>`,
    `📅 <b>Joined:</b> ${formatDate(user.joinDate)}`,
    `🔰 <b>Status:</b> ${statusLabel(user.status)}`,
    "",
    LINE,
    `📊 <b>STATISTICS</b>`,
    LINE,
    "",
    `📤 <b>Total Submitted:</b> ${fmt(stats.totalSubmitted)}`,
    `⏳ <b>Pending Reports:</b> ${fmt(stats.pendingReports)}`,
    `✅ <b>Good IDs:</b> ${fmt(stats.goodIds)}`,
    `❌ <b>Bad IDs:</b> ${fmt(stats.badIds)}`,
    "",
    LINE,
    `💰 <b>WALLET</b>`,
    LINE,
    "",
    `💵 <b>Balance:</b> ${fmtMoney(stats.balance)}`,
    `🏆 <b>Total Earned:</b> ${fmtMoney(stats.totalEarned)}`,
    `💸 <b>Total Withdrawn:</b> ${fmtMoney(stats.totalWithdraw)}`,
  ];

  return lines.join("\n");
}
