type AuthSnapshot = {
  accessToken: string | null;
};

let authSnapshot: AuthSnapshot = {
  accessToken: null,
};

export function setClientAuthSnapshot(next: Partial<AuthSnapshot>) {
  authSnapshot = {
    ...authSnapshot,
    ...next,
  };
}

export function getClientAccessToken() {
  return authSnapshot.accessToken;
}

export function clearClientAuthSnapshot() {
  authSnapshot = {
    accessToken: null,
  };
}
