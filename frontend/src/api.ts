import axios from "axios";

export type MemoStatus = "pending" | "review_needed" | "done";

export type ImageAttachment = {
  type: "image";
  url: string;
};

export type LocationAttachment = {
  type: "location";
  lat: number;
  lng: number;
};

export type Attachment = ImageAttachment | LocationAttachment;

export type Memo = {
  id: string;
  content?: string | null;
  audio_path: string;
  audio_url?: string | null;
  project_id?: string | null;
  status: MemoStatus;
  attachments: Attachment[];
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
};

export type CaptureResponse = {
  id: string;
  status: MemoStatus;
  audio_url: string;
  estimated_wait?: string;
  memo?: Memo;
};

export type MemoUpdate = {
  content?: string;
  project_id?: string | null;
  new_project_name?: string;
  status?: MemoStatus;
};

const api = axios.create({
  baseURL: "/api/v1",
});

const TOKEN_STORAGE_KEY = "nc_token";
const REFRESH_TOKEN_STORAGE_KEY = "nc_refresh_token";
const AUTH_EVENT = "nc:auth-change";
const AUTH_ERROR_KEY = "nc_auth_error";
const AUTH_ERROR_EVENT = "nc:auth-error";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: token }));
}

/** Store both access and refresh token (e.g. after login). Clears refresh if not provided. */
export function setAuthTokens(accessToken: string | null, refreshToken: string | null = null) {
  if (accessToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: accessToken }));
}

/** Clear both access and refresh tokens (e.g. on logout). */
export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: null }));
}

export function setAuthError(message: string | null) {
  if (message) {
    localStorage.setItem(AUTH_ERROR_KEY, message);
  } else {
    localStorage.removeItem(AUTH_ERROR_KEY);
  }
  window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, { detail: message }));
}

export function getAuthError() {
  return localStorage.getItem(AUTH_ERROR_KEY);
}

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const access = payload?.access_token ?? null;
  const refresh = payload?.refresh_token ?? refreshToken;
  if (access) {
    setAuthTokens(access, refresh);
    return access;
  }
  return null;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;
    if (status === 401 && config && !config._retriedAfterRefresh) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        config._retriedAfterRefresh = true;
        if (config.headers) config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(config);
      }
      setAuthError("Session expired. Please sign in again.");
      clearAuthTokens();
    }
    return Promise.reject(error);
  }
);

export function subscribeToAuthChange(listener: (token: string | null) => void) {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<string | null>;
    listener(custom.detail ?? null);
  };
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

export function subscribeToAuthError(listener: (message: string | null) => void) {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<string | null>;
    listener(custom.detail ?? null);
  };
  window.addEventListener(AUTH_ERROR_EVENT, handler);
  return () => window.removeEventListener(AUTH_ERROR_EVENT, handler);
}

export async function captureAudio(file: File, attachments?: unknown[]) {
  const form = new FormData();
  form.append("file", file);
  if (attachments?.length) {
    form.append("attachments", JSON.stringify(attachments));
  }
  const response = await api.post<CaptureResponse>("/capture", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function listMemos(params?: { status?: MemoStatus; project_id?: string }) {
  const response = await api.get<Memo[]>("/memos", { params });
  return response.data;
}

export async function listProjects() {
  const response = await api.get<Project[]>("/projects");
  return response.data;
}

export async function updateMemo(memoId: string, payload: MemoUpdate) {
  const response = await api.patch<Memo>(`/memos/${memoId}`, payload);
  return response.data;
}

export async function deleteMemo(memoId: string) {
  await api.delete(`/memos/${memoId}`);
}

export async function uploadMemoMedia(memoId: string, files: File[]) {
  const form = new FormData();
  files.forEach((file) => {
    form.append("files", file);
  });
  const response = await api.post<Memo>(`/memos/${memoId}/media`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function addMemoLocation(memoId: string, payload: { lat: number; lng: number }) {
  const response = await api.post<Memo>(`/memos/${memoId}/location`, payload);
  return response.data;
}
