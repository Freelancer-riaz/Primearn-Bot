import type { User } from "./User";

/** All numeric statistics for a user. Defaults to 0 if no Firestore data exists. */
export interface UserStats {
  totalSubmitted: number;
  pendingReports: number;
  goodIds: number;
  badIds: number;
  balance: number;
  totalEarned: number;
  totalWithdraw: number;
}

/** Default stats returned when no Firestore document exists yet. */
export const DEFAULT_STATS: Readonly<UserStats> = {
  totalSubmitted: 0,
  pendingReports: 0,
  goodIds: 0,
  badIds: 0,
  balance: 0,
  totalEarned: 0,
  totalWithdraw: 0,
};

/** Combined user profile: identity + live stats. */
export interface UserProfile {
  user: User;
  stats: UserStats;
}
