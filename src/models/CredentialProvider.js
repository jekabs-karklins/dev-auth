class CredentialProvider {
  constructor() {
    this.credentials = [
      { username: 'john@portchain.com', pass: 'Test' },
      { username: 'admin@portchain.com', pass: 'Test' },
      { username: 'user@portchain.com', pass: 'Test' },
    ];
  }

  getCredentials() {
    return this.credentials;
  }
}

module.exports = CredentialProvider;
