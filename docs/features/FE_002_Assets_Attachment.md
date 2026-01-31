# Feature Spec: Assets & Media Controls (Frontend)

**Goal**: Interface for adding Photos and Location to a memo.

## 1. UI Components (Transcription Editor)

Add a generic **"Add Attachment"** section or toolbar.

### Button A: "Add Photo"
-   **Element**: Hidden `<input type="file" multiple accept="image/*" />`.
-   **Trigger**: Button click programmatically opens the file dialog.
-   **Flow**:
    1.  User selects files.
    2.  **UI State**: Show "Uploading..." spinner. *(Future UX: Show progress per file)*
    3.  **API**: Call `POST /memos/{id}/media` with FormData.
    4.  **On Success**: Call `fetchMemos()` to refresh the entire list (ensures consistency), then update local view.
    5.  **On Partial/Full Failure**: Show Error Toast. Do NOT rollback. Refresh list.

### Button B: "Add Location"
-   **Element**: Button "Tag Location".
-   **Flow**:
    1.  User clicks button.
    2.  **Permission**: Browser asks for Location Permission.
    3.  **API**: `navigator.geolocation.getCurrentPosition`.
    4.  **Error Handling**:
        -   If denied/error: Show Toast "Could not get location".
    5.  **Success**: Call `POST /memos/{id}/location` with `{lat, lng}`.
    6.  **UI Update**: Show a "Map Pin" icon with coordinates (e.g., `Location: 12.34, 56.78`) or "Current Location".

## 2. Display Layer (Timeline Card)
-   **Images**: Render as a grid or carousel. Use the `url` field (which is the Signed URL).
-   **Location**: Render as a small chip/badge. (Future: Click to open Google Maps).
