/** Shared error type for the public (unauthenticated) chat endpoints. */
export class PublicChatError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
