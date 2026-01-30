# Feature Spec: Delete Memo Interaction (Frontend)

**Goal**: Provide a safe, explicit way to delete memos.

## 1. UI Components
- **Timeline Card**: Add a `TrashIcon` (usually red or gray, top-right or bottom-right).
- **Transcription Editor**: Add a "Delete Memo" button (distinct from "Discard Changes").

## 2. Interaction Flow
1.  **Trigger**: User clicks Delete button.
2.  **Safety Check**:
    -   Show a native confirmation dialog: `window.confirm("Are you sure? This cannot be undone.")`
    -   OR use a Modal component.
3.  **API Call**:
    -   Call `DELETE /api/v1/memos/{id}`.
    -   **Important**: Expect HTTP 204 (No Content). **Do not attempt to parse JSON body.**
4.  **Optimistic Update & Error Handling**:
    -   **Optimistic**: Remove item from list immediately.
    -   **On Error**: Show Error Toast -> **Trigger full list refresh** (`fetchMemos`). (Do not try to manually revert state).

## 3. Edge Cases
- **Deleting while playing**: 
  - Implementation: Use a `useRef` to hold the Audio instance.
  - Check `if (currentPlayingId === deletedId)`.
  - If true, call `audioRef.current.pause()` and reset source.
- **Deleting while editing**: 
  - If user is in the Editor view:
    1. Clear `transcription` state.
    2. Set `currentMemo` to `null`.
    3. Set App State to **`Idle`**.
    4. Redirect to Dashboard.
