import axios from "axios";

export type MemoStatus = "pending" | "review_needed" | "done";

export type Memo = {
  id: string;
  content?: string | null;
  audio_path: string;
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
