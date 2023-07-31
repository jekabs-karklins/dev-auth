const store = new Map();
const logins = new Map();
const { nanoid } = require('nanoid');

const UserDataSource = require('../datasources/UserDataSource');

function toOpenIdConnectProfile(record) {
  return {
    accountId: record.auth0_id,
    sub: record.auth0_id,
    name: record.first_name,
    given_name: record.first_name,
    family_name: record.last_name,
    email: record.email,
    picture: '',
    locale: 'en',
    updated_at: record.updated_at,
    website: '',
    zoneinfo: '',
    birthdate: record.birthdate,
    phone_number: record.telephone,
    phone_number_verified: true,
    address: '',
  };
}

class Account {
  constructor(id, profile) {
    this.accountId = id || nanoid();
    this.profile = profile;
    store.set(this.accountId, this);
  }

  /**
   * @param use - can either be "id_token" or "userinfo", depending on
   *   where the specific claims are intended to be put in.
   * @param scope - the intended scope, while oidc-provider will mask
   *   claims depending on the scope automatically you might want to skip
   *   loading some claims from external resources etc. based on this detail
   *   or not return them in id tokens but only userinfo and so on.
   */
  async claims(use, scope) {
    // eslint-disable-line no-unused-vars
    if (this.profile) {
      return {
        sub: this.accountId, // it is essential to always return a sub claim
        email: this.profile.email,
        email_verified: this.profile.email_verified,
        family_name: this.profile.family_name,
        given_name: this.profile.given_name,
        locale: this.profile.locale,
        name: this.profile.name,
      };
    }

    return {
      sub: this.accountId, // it is essential to always return a sub claim

      address: {
        country: '000',
        formatted: '000',
        locality: '000',
        postal_code: '000',
        region: '000',
        street_address: '000',
      },
      birthdate: '1987-10-16',
      email: 'johndoe@example.com',
      email_verified: false,
      family_name: 'Doe',
      gender: 'male',
      given_name: 'John',
      locale: 'en-US',
      middle_name: 'Middle',
      name: 'John Doe',
      nickname: 'Johny',
      phone_number: '+49 000 000000',
      phone_number_verified: false,
      picture: 'http://lorempixel.com/400/200/',
      preferred_username: 'johnny',
      profile: 'https://johnswebsite.com',
      updated_at: 1454704946,
      website: 'http://example.com',
      zoneinfo: 'Europe/Berlin',
    };
  }

  static async findByFederated(provider, claims) {
    const id = `${provider}.${claims.sub}`;
    if (!logins.get(id)) {
      logins.set(id, new Account(id, claims));
    }
    return logins.get(id);
  }

  static async findByLogin(login, password) {
    const user = await UserDataSource.getUserByLogin(login, password);
    if (!user) {
      // create user now
      throw new Error('Could not get user');
    }

    const openidProfile = toOpenIdConnectProfile(user);

    return new Account(user.auth0_id, openidProfile);
  }

  static async findAccount(ctx, id, token) {
    // eslint-disable-line no-unused-vars
    // token is a reference to the token used for which a given account is being loaded,
    //   it is undefined in scenarios where account claims are returned from authorization endpoint
    // ctx is the koa request context

    const user = await UserDataSource.getUserBySub(id);

    const openidProfile = toOpenIdConnectProfile(user);

    return openidProfile ? new Account(user.auth0_id, openidProfile) : null;
  }
}

module.exports = Account;
