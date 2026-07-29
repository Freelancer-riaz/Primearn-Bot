export interface AdminApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  pricePerGoodId: number;
  status: "active" | "inactive";
  submitEnabled: boolean;
  dailyLimitEnabled: boolean;
  dailySubmitCount: number;
  submitStartTime: string;
  submitEndTime: string;
  countdownSupport: boolean;
  duplicateCheck: boolean;
  recheckEnabled: boolean;
  minIds: number;
  maxIds: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  const data: AdminApiResponse<T> = await response.json().catch(() => ({ 
    success: false, 
    error: "Invalid JSON response from server" 
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || "An unknown error occurred");
  }

  // If the endpoint is just returning success without data (like health/auth check)
  if (data.data === undefined && data.success) {
    return { success: true } as unknown as T;
  }

  return data.data as T;
}

export async function verifyAuth(token: string): Promise<{ success: boolean }> {
  // A special fetch that uses the provided token explicitly instead of localStorage,
  // to verify before saving it.
  const url = `${API_BASE_URL}/admin/health`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  
  const data: AdminApiResponse<any> = await response.json().catch(() => ({ 
    success: false 
  }));
  
  if (!response.ok || !data.success) {
    throw new Error("Invalid ADMIN_SECRET");
  }
  
  return { success: true };
}

export async function getCategories(): Promise<Category[]> {
  return fetchApi<Category[]>("/admin/categories");
}

export async function getCategoryById(id: string): Promise<Category> {
  return fetchApi<Category>(`/admin/categories/${id}`);
}

export async function createCategory(data: Partial<Category> & { name: string; description: string }): Promise<Category> {
  return fetchApi<Category>("/admin/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  return fetchApi<Category>(`/admin/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  return fetchApi<void>(`/admin/categories/${id}`, {
    method: "DELETE",
  });
}
