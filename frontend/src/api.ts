import axios from "axios";

export type MemoStatus = "pending" | "review_needed" | "done";

export type Memo = {
  id: string;
  content?: string | null;
  audio_path: string;
  audio_url?: string | null;
  project_id?: string | null;
  status: MemoStatus;
  attachments: Record<string, unknown>[];
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
const AUTH_EVENT = "nc:auth-change";
const AUTH_ERROR_KEY = "nc_auth_error";
const AUTH_ERROR_EVENT = "nc:auth-error";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: token }));
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      setAuthError("Session expired. Please sign in again.");
      setAuthToken(null);
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
