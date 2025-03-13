export interface CustomError {
  // If the error has a response property (likely an API error)
  response?: {
    status: number;
    data: {
      message: string;
    };
  };
  // Otherwise, assume it's a generic error
  message?: string;
}

export interface PRDiffFile {
  filename: string;
  baseContent: string;
  headContent: string;
  referencedFiles: { path: string; content: string }[];
}
