/* eslint-disable no-console */
const Knex = require('knex');

const db = Knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: {
    afterCreate(connection, done) {
      const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      connection.query(
        `SET timezone = "${process.env.TZ || defaultTimezone}";`,
        (err) => {
          done(err, connection);
        },
      );
    },
  },
});

db.on('query-error', (error, obj) => {
  console.error('QUERY ERROR', {
    message: error?.message,
    error,
    obj,
    QueryName: obj?.sql,
  });
});

module.exports = db;
