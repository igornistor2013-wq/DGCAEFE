'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = message => new HttpError(400, message);

module.exports = { HttpError, bad };
