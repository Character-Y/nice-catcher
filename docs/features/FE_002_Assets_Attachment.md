# Feature Spec: Assets & Media Controls (Frontend)

**Goal**: Interface for adding Photos and Location to a memo.

## 1. UI Components (Transcription Editor)

Add a generic **"Add Attachment"** section or toolbar.

### Button A: "Add Photo"
-   **Element**: Hidden `<input type="file" multiple accept="image/*" />`.
-   **Trigger**: Button click programmatically opens the file dialog.
-   **Flow**:
    1.  User selects files.
    2.  **UI State**: Show "Uploading..." spinner.
    3.  **API**: Call `POST /memos/{id}/media` with FormData.
    4.  **On Success**: Refresh memo data. The new images should appear in the list (using the `url` returned by backend).

### Button B: "Add Location"
-   **Element**: Button "Tag Location".
-   **Flow**:
    1.  User clicks button.
    2.  **Permission**: Browser asks for Location Permission.
    3.  **API**: `navigator.geolocation.getCurrentPosition`.
    4.  **Error Handling**:
        -   If denied/error: Show Toast "Could not get location".
    5.  **Success**: Call `POST /memos/{id}/location` with `{lat, lng}`.
    6.  **UI Update**: Show a "Map Pin" icon with coordinates (or "Current Location") in the attachment list.

## 2. Display Layer (Timeline Card)
-   **Images**: Render as a grid or carousel. Use the `url` field (which is the Signed URL).
-   **Location**: Render as a small chip/badge. (Future: Click to open Google Maps).
