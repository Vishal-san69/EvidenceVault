
import api from "./api";

export interface UploadUrlResponse {
  success: boolean;
  message: string;
  document: {
    id: string;
    case_id: string;
    original_name: string;
    content_type: string;
    file_size_bytes: number;
    status: string;
    created_at: string;
  };
  upload_url: string;
  upload_method: "PUT";
  expires_in: number;
}

export interface ConfirmUploadResponse {
  success: boolean;
  message: string;
  document: {
    id: string;
    case_id: string;
    original_name: string;
    content_type: string;
    file_size_bytes: number;
    status: string;
    created_at: string;
  };
}

interface UploadProgress {
  loaded: number;
  total: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const uploadCaseDocument = async (
  file: File,
  caseId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ConfirmUploadResponse["document"]> => {
  if (!file || !caseId) {
    throw new Error("A file and case are required.");
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("File must be between 1 byte and 10 MB.");
  }

  const contentType = file.type;

  if (!contentType) {
    throw new Error("Unable to determine the file type.");
  }

  // Step 1: Request a presigned upload URL.
  const response = await api.post<UploadUrlResponse>(
    "/documents/upload-url",
    {
      original_name: file.name,
      content_type: contentType,
      file_size_bytes: file.size,
      case_id: caseId,
    },
  );

  const { document, upload_url } = response.data;

  if (!document?.id || !upload_url) {
    throw new Error("The server returned an invalid upload response.");
  }

  // Step 2: Upload directly to private S3.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", upload_url);

    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader(
      "x-amz-server-side-encryption",
      "AES256",
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.({
          loaded: event.loaded,
          total: event.total,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `S3 upload failed with HTTP ${xhr.status}.`,
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading to S3."));
    };

    xhr.onabort = () => {
      reject(new Error("Upload was cancelled."));
    };

    xhr.send(file);
  });

  // Step 3: Ask the backend to verify and activate the document.
  const confirmation = await api.post<ConfirmUploadResponse>(
    `/documents/${document.id}/confirm`,
  );

  if (!confirmation.data.success) {
    throw new Error("The server could not verify the uploaded document.");
  }

  return confirmation.data.document;
};
