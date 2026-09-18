// An error the administrator can act on. `status` becomes the HTTP status,
// `message` is shown as written, and `fields` maps form fields to messages.
export class AdminError extends Error {
  constructor(status, message, { fields, code } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

export const fieldError = (fields) => new AdminError(400, "Corrigez les champs signalés.", { fields });
