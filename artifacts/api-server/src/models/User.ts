export type UserStatus = "active" | "banned" | "inactive";

export interface User {
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  name: string;
  photoUrl: string | null;
  joinDate: string;  // ISO 8601
  status: UserStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateUserInput {
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}
