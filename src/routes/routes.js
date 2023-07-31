/* eslint-disable no-console, max-len, camelcase, no-unused-vars */
const { strict: assert } = require('assert');
const querystring = require('querystring');
const { inspect } = require('util');

const isEmpty = require('lodash/isEmpty');
const { urlencoded } = require('express'); // eslint-disable-line import/no-unresolved
const bodyParser = require('body-parser');

const CredentialProvider = require('../models/CredentialProvider');
const Account = require('../models/Account');
const config = require('../config/config');

const body = urlencoded({ extended: false });
const jsonParser = bodyParser.json();

const keys = new Set();
const debug = (obj) => querystring.stringify(
  Object.entries(obj).reduce((acc, [key, value]) => {
    keys.add(key);
    if (isEmpty(value)) return acc;
    acc[key] = inspect(value, { depth: null });
    return acc;
  }, {}),
  '<br/>',
  ': ',
  {
    encodeURIComponent(value) {
      return keys.has(value) ? `<strong>${value}</strong>` : value;
    },
  },
);

module.exports = (app, provider) => {
  const {
    constructor: {
      errors: { SessionNotFound },
    },
  } = provider;

  app.use((req, res, next) => {
    const orig = res.render;
    // you'll probably want to use a full blown render engine capable of layouts
    res.render = (view, locals) => {
      app.render(view, locals, (err, html) => {
        if (err) throw err;
        orig.call(res, '_layout', {
          ...locals,
          body: html,
        });
      });
    };
    next();
  });

  function setNoCache(req, res, next) {
    res.set('cache-control', 'no-store');
    next();
  }

  app.get('/interaction/:uid', setNoCache, async (req, res, next) => {
    try {
      const {
        uid, prompt, params, session,
      } = await provider.interactionDetails(req, res);

      const client = await provider.Client.find(params.client_id);

      switch (prompt.name) {
        case 'login': {
          return res.render('login', {
            client,
            uid,
            details: prompt.details,
            params,
            title: 'Sign-in',
            session: session ? debug(session) : undefined,
            dbg: {
              params: debug(params),
              prompt: debug(prompt),
            },
            predefinedCredentials: new CredentialProvider().getCredentials(),
          });
        }
        case 'consent': {
          return res.render('interaction', {
            client,
            uid,
            details: prompt.details,
            params,
            title: 'Authorize',
            session: session ? debug(session) : undefined,
            dbg: {
              params: debug(params),
              prompt: debug(prompt),
            },
          });
        }
        default:
          return undefined;
      }
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    '/interaction/:uid/login',
    setNoCache,
    body,
    async (req, res, next) => {
      try {
        const {
          prompt: { name },
        } = await provider.interactionDetails(req, res);
        assert.equal(name, 'login');
        const account = await Account.findByLogin(
          req.body.login,
          req.body.password,
        );

        const result = {
          login: {
            accountId: account.accountId,
          },
        };

        await provider.interactionFinished(req, res, result, {
          mergeWithLastSubmission: false,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post('/get-code', jsonParser, async (req, res, next) => {
    try {
      const { login, password } = req.body;
      const account = await Account.findByLogin(login, password);
      if (!account) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // we're establishing a new grant
      const grant = new provider.Grant({
        accountId: account.accountId,
        clientId: config.clients[0].client_id,
      });

      const scopes = req.body.scopes?.split(' ') || [];
      grant.addOIDCScope(scopes.join(' '));
      grant.addOIDCClaims(['sub', 'name', 'email', 'email_verified']);

      const newGrantId = await grant.save();

      const authCode = new provider.AuthorizationCode({
        accountId: account.accountId,
        authTime: new Date().getTime(),
        grantId: newGrantId,
        clientId: config.clients[0].client_id,
        redirectUri: config.clients[0].redirect_uris[0],
        scope: scopes.join(' '),
      });

      const code = await authCode.save();

      res.json({ code });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/interaction/:uid/confirm',
    setNoCache,
    body,
    async (req, res, next) => {
      try {
        const interactionDetails = await provider.interactionDetails(req, res);
        const {
          prompt: { name, details },
          params,
          session: { accountId },
        } = interactionDetails;
        assert.equal(name, 'consent');

        let { grantId } = interactionDetails;
        let grant;

        if (grantId) {
          // we'll be modifying existing grant in existing session
          grant = await provider.Grant.find(grantId);
        } else {
          // we're establishing a new grant
          grant = new provider.Grant({
            accountId,
            clientId: params.client_id,
          });
        }

        if (details.missingOIDCScope) {
          grant.addOIDCScope(details.missingOIDCScope.join(' '));
        }
        if (details.missingOIDCClaims) {
          grant.addOIDCClaims(details.missingOIDCClaims);
        }
        if (details.missingResourceScopes) {
          // eslint-disable-next-line no-restricted-syntax
          for (const [indicator, scopes] of Object.entries(
            details.missingResourceScopes,
          )) {
            grant.addResourceScope(indicator, scopes.join(' '));
          }
        }

        grantId = await grant.save();

        const consent = {};
        if (!interactionDetails.grantId) {
          // we don't have to pass grantId to consent, we're just modifying existing one
          consent.grantId = grantId;
        }

        const result = { consent };
        await provider.interactionFinished(req, res, result, {
          mergeWithLastSubmission: true,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get('/interaction/:uid/abort', setNoCache, async (req, res, next) => {
    try {
      const result = {
        error: 'access_denied',
        error_description: 'End-User aborted interaction',
      };
      await provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, req, res, next) => {
    if (err instanceof SessionNotFound) {
      // handle interaction expired / session not found error
    }
    next(err);
  });
};
